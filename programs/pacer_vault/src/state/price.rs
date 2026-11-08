use anchor_lang::prelude::*;

/// One price per allowlisted stock. **Byte offsets are part of the contract**
/// (mock_swap reads this account's raw bytes): discriminator 0..8,
/// price_micro_usdc 8, updated_at 16, mint 24, bump 56, reserved 57.
#[account]
#[derive(InitSpace)]
pub struct PriceAccount {
    /// micro-USDC value of ONE WHOLE RAW token (10^decimals base units).
    /// This is Jupiter's `scaledUiConfig.usdPricePrescaled` x 1,000,000, not `usdPrice`.
    pub price_micro_usdc: u64,
    /// Unix time of the last `update_price`; 0 until the first update.
    pub updated_at: i64,
    pub mint: Pubkey,
    pub bump: u8,
    pub reserved: [u8; 32],
}
