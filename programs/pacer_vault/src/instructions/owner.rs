//! Instructions only the vault's owner can sign. The keeper has no path to any of them.
use crate::constants::*;
use crate::errors::VaultError;
use crate::events::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateVaultArgs {
    /// Set once; nothing can change it afterwards.
    pub withdrawal_destination: Pubkey,
    pub rate_per_period: u64,
    pub mints: Vec<Pubkey>,
    /// 0 means no delay.
    pub withdraw_delay_secs: u32,
}

#[derive(Accounts)]
pub struct CreateVault<'info> {
    pub owner: Signer<'info>,
    /// The gas wallet: users hold no SOL.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
    /// Plain `init`: a second vault for the same owner fails.
    #[account(init, payer = payer, space = 8 + UserVault::INIT_SPACE, seeds = [VAULT_SEED, owner.key().as_ref()], bump)]
    pub vault: Account<'info, UserVault>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(init, payer = payer, associated_token::mint = usdc_mint, associated_token::authority = vault, associated_token::token_program = usdc_token_program)]
    pub usdc_vault_ata: InterfaceAccount<'info, TokenAccount>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_vault(ctx: Context<CreateVault>, args: CreateVaultArgs) -> Result<()> {
    let cfg = &ctx.accounts.config;
    validate_plan(cfg, args.rate_per_period, &args.mints)?;
    require!(
        args.withdrawal_destination != Pubkey::default() && args.withdrawal_destination != ctx.accounts.vault.key(),
        VaultError::InvalidDestination
    );
    require!(args.withdraw_delay_secs <= cfg.max_withdraw_delay_secs, VaultError::DelayTooLong);

    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    vault.owner = ctx.accounts.owner.key();
    vault.withdrawal_destination = args.withdrawal_destination;
    vault.rate_per_period = args.rate_per_period;
    vault.allowance = 0;
    vault.last_checkpoint_ts = now; // period 0 earns nothing
    vault.created_ts = now;
    vault.withdraw_delay_secs = args.withdraw_delay_secs;
    vault.bump = ctx.bumps.vault;
    vault.chosen_mints = args.mints.clone();
    emit!(VaultCreated {
        owner: vault.owner,
        withdrawal_destination: args.withdrawal_destination,
        rate_per_period: args.rate_per_period,
        mints: args.mints,
        withdraw_delay_secs: args.withdraw_delay_secs,
        ts: now,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(seeds = [VAULT_SEED, vault.owner.as_ref()], bump = vault.bump, has_one = owner @ VaultError::NotOwner)]
    pub vault: Account<'info, UserVault>,
    #[account(address = config.usdc_mint)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = usdc_mint, token::authority = owner, token::token_program = usdc_token_program)]
    pub owner_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = vault, associated_token::token_program = usdc_token_program)]
    pub usdc_vault_ata: InterfaceAccount<'info, TokenAccount>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, VaultError::ZeroAmount);
    token_interface::transfer_checked(
        CpiContext::new(
            ctx.accounts.usdc_token_program.key(),
            TransferChecked {
                from: ctx.accounts.owner_usdc.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.usdc_vault_ata.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.usdc_mint.decimals,
    )?;
    emit!(Deposited { owner: ctx.accounts.owner.key(), amount, ts: Clock::get()?.unix_timestamp });
    Ok(())
}

/// Shared accounts for the owner-only vault edits.
#[derive(Accounts)]
pub struct OwnerVault<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(mut, seeds = [VAULT_SEED, vault.owner.as_ref()], bump = vault.bump, has_one = owner @ VaultError::NotOwner)]
    pub vault: Account<'info, UserVault>,
}

pub fn handle_set_rules(ctx: Context<OwnerVault>, rate_per_period: u64, mints: Vec<Pubkey>, paused: bool) -> Result<()> {
    let cfg = &ctx.accounts.config;
    validate_plan(cfg, rate_per_period, &mints)?;
    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    // Settle first with the OLD rate and pause state: whole periods before this
    // moment are credited; a change only affects the future.
    vault.settle(now, cfg)?;
    let old_rate = vault.rate_per_period;
    vault.rate_per_period = rate_per_period;
    vault.chosen_mints = mints.clone();
    vault.paused = paused;
    emit!(RulesChanged { owner: vault.owner, old_rate, new_rate: rate_per_period, mints, paused, ts: now });
    Ok(())
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    pub owner: Signer<'info>,
    /// The gas wallet pays for the destination token account.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(mut, seeds = [VAULT_SEED, vault.owner.as_ref()], bump = vault.bump, has_one = owner @ VaultError::NotOwner)]
    pub vault: Account<'info, UserVault>,
    /// CHECK: address-constrained to the vault's fixed withdrawal destination.
    #[account(address = vault.withdrawal_destination @ VaultError::InvalidDestination)]
    pub withdrawal_destination: UncheckedAccount<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(mut, associated_token::mint = mint, associated_token::authority = vault, associated_token::token_program = token_program)]
    pub vault_ata: InterfaceAccount<'info, TokenAccount>,
    /// The only `init_if_needed` for user funds: an associated token account whose
    /// mint, authority and token program are all constrained.
    #[account(init_if_needed, payer = payer, associated_token::mint = mint, associated_token::authority = withdrawal_destination, associated_token::token_program = token_program)]
    pub destination_ata: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_withdraw<'info>(ctx: Context<'info, Withdraw<'info>>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let mint = ctx.accounts.mint.key();
    require!(
        mint == ctx.accounts.config.usdc_mint || ctx.accounts.config.is_allowed(&mint),
        VaultError::MintNotAllowed
    );
    require!(amount > 0, VaultError::ZeroAmount);

    let (owner, bump) = {
        let vault = &mut ctx.accounts.vault;
        require!(vault.lock_until == 0 || now >= vault.lock_until, VaultError::WithdrawLocked);
        vault.fold_pending_delay(now);
        if vault.withdraw_delay_secs > 0 {
            let open = vault.withdraw_unlock_ts != 0 && now >= vault.withdraw_unlock_ts && now <= vault.withdraw_expires_ts;
            require!(open, VaultError::WithdrawWindowClosed);
        }
        (vault.owner, vault.bump)
    };

    let seeds: &[&[u8]] = &[VAULT_SEED, owner.as_ref(), &[bump]];
    // remaining_accounts are forwarded so a transfer hook the issuer enables later
    // needs no program change.
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.vault_ata.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.destination_ata.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            &[seeds],
        )
        .with_remaining_accounts(ctx.remaining_accounts.to_vec()),
        amount,
        ctx.accounts.mint.decimals,
    )?;
    emit!(Withdrawn { owner, mint, amount, destination: ctx.accounts.withdrawal_destination.key(), ts: now });
    Ok(())
}

// ---- Stretch: withdrawal delay -------------------------------------------------

pub fn handle_request_withdraw(ctx: Context<OwnerVault>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let window = i64::from(ctx.accounts.config.withdraw_window_secs);
    let vault = &mut ctx.accounts.vault;
    vault.fold_pending_delay(now);
    require!(vault.withdraw_delay_secs > 0, VaultError::DelayNotEnabled);
    let unlock = now.checked_add(i64::from(vault.withdraw_delay_secs)).ok_or(VaultError::MathOverflow)?;
    let expires = unlock.checked_add(window).ok_or(VaultError::MathOverflow)?;
    vault.withdraw_unlock_ts = unlock;
    vault.withdraw_expires_ts = expires;
    emit!(WithdrawRequested { owner: vault.owner, unlock_ts: unlock, expires_ts: expires, ts: now });
    Ok(())
}

pub fn handle_cancel_withdraw(ctx: Context<OwnerVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.withdraw_unlock_ts = 0;
    vault.withdraw_expires_ts = 0;
    emit!(WithdrawCancelled { owner: vault.owner, ts: Clock::get()?.unix_timestamp });
    Ok(())
}

/// A higher delay applies at once; a lower one only after the current delay has passed,
/// so nobody (including a server holding the owner key) can shorten it quickly.
pub fn handle_set_withdraw_delay(ctx: Context<OwnerVault>, new_delay_secs: u32) -> Result<()> {
    require!(new_delay_secs <= ctx.accounts.config.max_withdraw_delay_secs, VaultError::DelayTooLong);
    let now = Clock::get()?.unix_timestamp;
    let vault = &mut ctx.accounts.vault;
    vault.fold_pending_delay(now);
    if new_delay_secs >= vault.withdraw_delay_secs {
        vault.withdraw_delay_secs = new_delay_secs;
        vault.pending_delay_secs = 0;
        vault.pending_delay_effective_ts = 0;
    } else {
        vault.pending_delay_secs = new_delay_secs;
        vault.pending_delay_effective_ts = now.checked_add(i64::from(vault.withdraw_delay_secs)).ok_or(VaultError::MathOverflow)?;
    }
    Ok(())
}
