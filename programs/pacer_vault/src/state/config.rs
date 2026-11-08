use anchor_lang::prelude::*;

/// Program-wide settings. Immutable after `init_config` except the keeper and
/// oracle keys (`set_authorities`) and `halted` (`set_halt`).
#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    /// Kept offline. Signs only init_config, init_price, set_halt, set_authorities.
    pub admin: Pubkey,
    /// The AI agent. Can only call `buy` and `record_intent`.
    pub keeper: Pubkey,
    /// The price updater. Can only call `update_price`.
    pub oracle_authority: Pubkey,
    pub usdc_mint: Pubkey,
    /// Locked at init: `buy` calls only this program.
    pub swap_program: Pubkey,
    /// The stock allowlist, locked at init. Only the first `stock_count` entries are used.
    pub stock_mints: [Pubkey; 10],
    pub stock_count: u8,
    pub period_seconds: u32,
    /// micro-USDC.
    pub min_trade: u64,
    /// micro-USDC ceiling for any user's pace.
    pub max_rate_per_period: u64,
    pub max_slippage_bps: u16,
    pub max_price_age_secs: u32,
    pub max_withdraw_delay_secs: u32,
    pub withdraw_window_secs: u32,
    /// When true `buy` is refused; everything else keeps working.
    pub halted: bool,
    pub bump: u8,
    pub reserved: [u8; 64],
}

impl GlobalConfig {
    pub fn stocks(&self) -> &[Pubkey] {
        &self.stock_mints[..usize::from(self.stock_count)]
    }

    pub fn is_allowed(&self, mint: &Pubkey) -> bool {
        self.stocks().contains(mint)
    }
}
