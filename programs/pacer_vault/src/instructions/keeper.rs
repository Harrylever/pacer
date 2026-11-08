//! The keeper (the AI agent) can only buy and record intents. It can never
//! withdraw, change rules, or write prices.
use crate::constants::*;
use crate::errors::VaultError;
use crate::events::*;
use crate::math::{quote_out, slippage_floor};
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

#[derive(Accounts)]
pub struct Buy<'info> {
    // The large accounts are boxed onto the heap: validating all 16 on the stack needs
    // 4,224 bytes, over SBF's 4,096-byte frame limit (undefined behaviour otherwise).
    #[account(address = config.keeper @ VaultError::NotKeeper)]
    pub keeper: Signer<'info>,
    /// The gas wallet: pays for the stock token account on the first buy of a stock.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Box<Account<'info, GlobalConfig>>,
    #[account(mut, seeds = [VAULT_SEED, vault.owner.as_ref()], bump = vault.bump)]
    pub vault: Box<Account<'info, UserVault>>,
    #[account(seeds = [PRICE_SEED, stock_mint.key().as_ref()], bump = price.bump)]
    pub price: Box<Account<'info, PriceAccount>>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    /// Mutable because the swap mints into it on devnet.
    #[account(mut)]
    pub stock_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = vault, associated_token::token_program = usdc_token_program)]
    pub usdc_vault_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// `init_if_needed` only for an associated token account, with every part constrained.
    #[account(init_if_needed, payer = payer, associated_token::mint = stock_mint, associated_token::authority = vault, associated_token::token_program = stock_token_program)]
    pub stock_vault_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: executable and equal to `config.swap_program`.
    #[account(executable, address = config.swap_program @ VaultError::InvalidSwapProgram)]
    pub swap_program: UncheckedAccount<'info>,
    /// CHECK: validated by the swap program (it must be its own USDC token account).
    #[account(mut)]
    pub treasury_usdc: UncheckedAccount<'info>,
    /// CHECK: validated by the swap program (its mint-authority PDA).
    pub mock_authority: UncheckedAccount<'info>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub stock_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_buy(ctx: Context<Buy>, usdc_in: u64, min_out: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let stock = ctx.accounts.stock_mint.key();

    // 2-4: halt, allowlist, the user's chosen stocks, pause.
    require!(!ctx.accounts.config.halted, VaultError::Halted);
    require!(ctx.accounts.config.is_allowed(&stock), VaultError::MintNotAllowed);
    require!(ctx.accounts.vault.is_chosen(&stock), VaultError::MintNotChosen);
    require!(!ctx.accounts.vault.paused, VaultError::VaultPaused);

    // 5-6: unlock what the pace allows, then check the amount against it.
    ctx.accounts.vault.settle(now, &ctx.accounts.config)?;
    require!(usdc_in >= ctx.accounts.config.min_trade, VaultError::BelowMinTrade);
    require!(usdc_in <= ctx.accounts.vault.allowance, VaultError::ExceedsAllowance);

    // 7: the price must exist, be fresh and be non-zero.
    let price = &ctx.accounts.price;
    let age = now.checked_sub(price.updated_at).ok_or(VaultError::MathOverflow)?;
    require!(price.updated_at > 0 && age <= i64::from(ctx.accounts.config.max_price_age_secs), VaultError::StalePrice);
    require!(price.price_micro_usdc > 0, VaultError::InvalidPrice);
    let price_micro_usdc = price.price_micro_usdc;

    // 8: slippage floor, computed in u128 with the mint's own decimals. A floor of 0
    // is rejected so `min_out = 0` can never get through.
    let quoted = quote_out(usdc_in, price_micro_usdc, ctx.accounts.stock_mint.decimals)?;
    let floor = slippage_floor(quoted, ctx.accounts.config.max_slippage_bps);
    require!(floor > 0 && min_out >= floor, VaultError::SlippageTooHigh);

    // 10: swap, signed by the vault PDA.
    let usdc_before = ctx.accounts.usdc_vault_ata.amount;
    let stock_before = ctx.accounts.stock_vault_ata.amount;
    let (owner, bump) = (ctx.accounts.vault.owner, ctx.accounts.vault.bump);
    let seeds: &[&[u8]] = &[VAULT_SEED, owner.as_ref(), &[bump]];
    mock_swap::cpi::swap(
        CpiContext::new_with_signer(
            ctx.accounts.swap_program.key(),
            mock_swap::cpi::accounts::Swap {
                user_authority: ctx.accounts.vault.to_account_info(),
                usdc_mint: ctx.accounts.usdc_mint.to_account_info(),
                stock_mint: ctx.accounts.stock_mint.to_account_info(),
                user_usdc: ctx.accounts.usdc_vault_ata.to_account_info(),
                user_stock: ctx.accounts.stock_vault_ata.to_account_info(),
                treasury_usdc: ctx.accounts.treasury_usdc.to_account_info(),
                mock_authority: ctx.accounts.mock_authority.to_account_info(),
                price: ctx.accounts.price.to_account_info(),
                usdc_token_program: ctx.accounts.usdc_token_program.to_account_info(),
                stock_token_program: ctx.accounts.stock_token_program.to_account_info(),
            },
            &[seeds],
        ),
        usdc_in,
        min_out,
    )?;

    // 11: do not trust the callee: re-read both balances and check them.
    ctx.accounts.usdc_vault_ata.reload()?;
    ctx.accounts.stock_vault_ata.reload()?;
    let spent = usdc_before.checked_sub(ctx.accounts.usdc_vault_ata.amount).ok_or(VaultError::SwapOverspend)?;
    require!(spent == usdc_in, VaultError::SwapOverspend);
    let stock_out = ctx
        .accounts
        .stock_vault_ata
        .amount
        .checked_sub(stock_before)
        .ok_or(VaultError::SwapShortfall)?;
    require!(stock_out >= min_out, VaultError::SwapShortfall);

    // 12: book it.
    let vault = &mut ctx.accounts.vault;
    vault.allowance = vault.allowance.checked_sub(usdc_in).ok_or(VaultError::MathOverflow)?;
    vault.total_invested = vault.total_invested.checked_add(usdc_in).ok_or(VaultError::MathOverflow)?;
    emit!(Bought {
        owner,
        mint: stock,
        usdc_in,
        stock_out,
        price_micro_usdc,
        allowance_after: vault.allowance,
        ts: now,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct RecordIntent<'info> {
    #[account(address = config.keeper @ VaultError::NotKeeper)]
    pub keeper: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(mut, seeds = [VAULT_SEED, vault.owner.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, UserVault>,
}

pub fn handle_record_intent(ctx: Context<RecordIntent>, intent_hash: [u8; 32], model_id: [u8; 16]) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.last_intent_hash = intent_hash;
    vault.last_model_id = model_id;
    vault.intent_count = vault.intent_count.checked_add(1).ok_or(VaultError::MathOverflow)?;
    emit!(IntentRecorded {
        owner: vault.owner,
        intent_hash,
        model_id,
        intent_count: vault.intent_count,
        ts: Clock::get()?.unix_timestamp,
    });
    Ok(())
}
