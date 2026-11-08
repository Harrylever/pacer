//! Pacer's vault. Each user's money sits in their own vault and can only ever
//! leave to one withdrawal address fixed at creation. See CONTRACT.md.
use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("Bj6PUUzuupGFKhLdDpVEakW4NQp3z9VXjSmekmx1yHC4");

#[program]
pub mod pacer_vault {
    use super::*;

    // ---- admin (kept offline) ----
    pub fn init_config(ctx: Context<InitConfig>, args: InitConfigArgs) -> Result<()> {
        instructions::admin::handle_init_config(ctx, args)
    }
    pub fn init_price(ctx: Context<InitPrice>) -> Result<()> {
        instructions::admin::handle_init_price(ctx)
    }
    pub fn set_halt(ctx: Context<AdminConfig>, halted: bool) -> Result<()> {
        instructions::admin::handle_set_halt(ctx, halted)
    }
    pub fn set_authorities(ctx: Context<AdminConfig>, keeper: Pubkey, oracle_authority: Pubkey) -> Result<()> {
        instructions::admin::handle_set_authorities(ctx, keeper, oracle_authority)
    }

    // ---- oracle ----
    pub fn update_price(ctx: Context<UpdatePrice>, price_micro_usdc: u64) -> Result<()> {
        instructions::oracle::handle_update_price(ctx, price_micro_usdc)
    }

    // ---- owner ----
    pub fn create_vault(ctx: Context<CreateVault>, args: CreateVaultArgs) -> Result<()> {
        instructions::owner::handle_create_vault(ctx, args)
    }
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::owner::handle_deposit(ctx, amount)
    }
    pub fn set_rules(ctx: Context<OwnerVault>, rate_per_period: u64, mints: Vec<Pubkey>, paused: bool) -> Result<()> {
        instructions::owner::handle_set_rules(ctx, rate_per_period, mints, paused)
    }
    pub fn withdraw<'info>(ctx: Context<'info, Withdraw<'info>>, amount: u64) -> Result<()> {
        instructions::owner::handle_withdraw(ctx, amount)
    }
    pub fn request_withdraw(ctx: Context<OwnerVault>) -> Result<()> {
        instructions::owner::handle_request_withdraw(ctx)
    }
    pub fn cancel_withdraw(ctx: Context<OwnerVault>) -> Result<()> {
        instructions::owner::handle_cancel_withdraw(ctx)
    }
    pub fn set_withdraw_delay(ctx: Context<OwnerVault>, new_delay_secs: u32) -> Result<()> {
        instructions::owner::handle_set_withdraw_delay(ctx, new_delay_secs)
    }

    // ---- keeper (the AI agent) ----
    pub fn buy(ctx: Context<Buy>, usdc_in: u64, min_out: u64) -> Result<()> {
        instructions::keeper::handle_buy(ctx, usdc_in, min_out)
    }
    pub fn record_intent(ctx: Context<RecordIntent>, intent_hash: [u8; 32], model_id: [u8; 16]) -> Result<()> {
        instructions::keeper::handle_record_intent(ctx, intent_hash, model_id)
    }
}
