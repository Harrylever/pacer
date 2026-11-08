//! The price updater's only instruction. The keeper key cannot call it.
use crate::constants::*;
use crate::errors::VaultError;
use crate::events::*;
use crate::state::*;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct UpdatePrice<'info> {
    #[account(address = config.oracle_authority @ VaultError::NotOracle)]
    pub oracle: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, GlobalConfig>,
    #[account(mut, seeds = [PRICE_SEED, price.mint.as_ref()], bump = price.bump)]
    pub price: Account<'info, PriceAccount>,
}

pub fn handle_update_price(ctx: Context<UpdatePrice>, price_micro_usdc: u64) -> Result<()> {
    require!(price_micro_usdc > 0, VaultError::InvalidPrice);
    let ts = Clock::get()?.unix_timestamp;
    let price = &mut ctx.accounts.price;
    price.price_micro_usdc = price_micro_usdc;
    price.updated_at = ts;
    emit!(PriceUpdated { mint: price.mint, price_micro_usdc, ts });
    Ok(())
}
