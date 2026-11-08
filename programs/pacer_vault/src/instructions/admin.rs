//! Setup and emergency controls. The admin key is kept offline.
use crate::constants::*;
use crate::errors::VaultError;
use crate::events::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token_interface::Mint;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitConfigArgs {
    pub keeper: Pubkey,
    pub oracle_authority: Pubkey,
    pub swap_program: Pubkey,
    pub period_seconds: u32,
    pub min_trade: u64,
    pub max_rate_per_period: u64,
    pub max_slippage_bps: u16,
    pub max_price_age_secs: u32,
    pub max_withdraw_delay_secs: u32,
    pub withdraw_window_secs: u32,
    pub stock_mints: Vec<Pubkey>,
}

#[derive(Accounts)]
pub struct InitConfig<'info> {
    pub admin: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, space = 8 + GlobalConfig::INIT_SPACE, seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, GlobalConfig>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_config(ctx: Context<InitConfig>, args: InitConfigArgs) -> Result<()> {
    let admin = ctx.accounts.admin.key();
    require!(distinct_keys(&admin, &args.keeper, &args.oracle_authority), VaultError::DuplicateKeys);
    for key in [&args.keeper, &args.oracle_authority, &args.swap_program] {
        require!(*key != Pubkey::default(), VaultError::InvalidConfig);
    }
    require!(ctx.accounts.usdc_mint.decimals == USDC_DECIMALS, VaultError::InvalidDecimals);

    let n = args.stock_mints.len();
    require!((1..=MAX_STOCKS).contains(&n), VaultError::InvalidConfig);
    let usdc = ctx.accounts.usdc_mint.key();
    let mut stock_mints = [Pubkey::default(); 10];
    for (i, mint) in args.stock_mints.iter().enumerate() {
        require!(*mint != Pubkey::default() && *mint != usdc, VaultError::InvalidConfig);
        require!(!args.stock_mints[..i].contains(mint), VaultError::InvalidConfig);
        stock_mints[i] = *mint;
    }
    require!(
        args.period_seconds > 0
            && args.min_trade > 0
            && args.max_rate_per_period > 0
            && args.max_slippage_bps < 10_000
            && args.max_price_age_secs > 0
            && args.withdraw_window_secs > 0,
        VaultError::InvalidConfig
    );

    let cfg = &mut ctx.accounts.config;
    cfg.admin = admin;
    cfg.keeper = args.keeper;
    cfg.oracle_authority = args.oracle_authority;
    cfg.usdc_mint = usdc;
    cfg.swap_program = args.swap_program;
    cfg.stock_mints = stock_mints;
    cfg.stock_count = n as u8;
    cfg.period_seconds = args.period_seconds;
    cfg.min_trade = args.min_trade;
    cfg.max_rate_per_period = args.max_rate_per_period;
    cfg.max_slippage_bps = args.max_slippage_bps;
    cfg.max_price_age_secs = args.max_price_age_secs;
    cfg.max_withdraw_delay_secs = args.max_withdraw_delay_secs;
    cfg.withdraw_window_secs = args.withdraw_window_secs;
    cfg.halted = false;
    cfg.bump = ctx.bumps.config;
    Ok(())
}

#[derive(Accounts)]
pub struct InitPrice<'info> {
    #[account(address = config.admin @ VaultError::NotAdmin)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(init, payer = payer, space = 8 + PriceAccount::INIT_SPACE, seeds = [PRICE_SEED, mint.key().as_ref()], bump)]
    pub price: Account<'info, PriceAccount>,
    pub system_program: Program<'info, System>,
}

pub fn handle_init_price(ctx: Context<InitPrice>) -> Result<()> {
    let mint = ctx.accounts.mint.key();
    require!(ctx.accounts.config.is_allowed(&mint), VaultError::MintNotAllowed);
    let price = &mut ctx.accounts.price;
    price.price_micro_usdc = 0;
    price.updated_at = 0;
    price.mint = mint;
    price.bump = ctx.bumps.price;
    Ok(())
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    #[account(address = config.admin @ VaultError::NotAdmin)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
}

pub fn handle_set_halt(ctx: Context<AdminConfig>, halted: bool) -> Result<()> {
    ctx.accounts.config.halted = halted;
    emit!(HaltChanged { halted, ts: Clock::get()?.unix_timestamp });
    Ok(())
}

pub fn handle_set_authorities(ctx: Context<AdminConfig>, keeper: Pubkey, oracle_authority: Pubkey) -> Result<()> {
    let cfg = &mut ctx.accounts.config;
    require!(keeper != Pubkey::default() && oracle_authority != Pubkey::default(), VaultError::InvalidConfig);
    require!(distinct_keys(&cfg.admin, &keeper, &oracle_authority), VaultError::DuplicateKeys);
    cfg.keeper = keeper;
    cfg.oracle_authority = oracle_authority;
    Ok(())
}

fn distinct_keys(a: &Pubkey, b: &Pubkey, c: &Pubkey) -> bool {
    a != b && b != c && a != c
}
