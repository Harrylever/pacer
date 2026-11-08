use anchor_lang::prelude::*;

#[event]
pub struct VaultCreated {
    pub owner: Pubkey,
    pub withdrawal_destination: Pubkey,
    pub rate_per_period: u64,
    pub mints: Vec<Pubkey>,
    pub withdraw_delay_secs: u32,
    pub ts: i64,
}

#[event]
pub struct Deposited {
    pub owner: Pubkey,
    pub amount: u64,
    pub ts: i64,
}

#[event]
pub struct RulesChanged {
    pub owner: Pubkey,
    pub old_rate: u64,
    pub new_rate: u64,
    pub mints: Vec<Pubkey>,
    pub paused: bool,
    pub ts: i64,
}

#[event]
pub struct Bought {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub usdc_in: u64,
    pub stock_out: u64,
    pub price_micro_usdc: u64,
    pub allowance_after: u64,
    pub ts: i64,
}

#[event]
pub struct Withdrawn {
    pub owner: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub destination: Pubkey,
    pub ts: i64,
}

#[event]
pub struct PriceUpdated {
    pub mint: Pubkey,
    pub price_micro_usdc: u64,
    pub ts: i64,
}

#[event]
pub struct IntentRecorded {
    pub owner: Pubkey,
    pub intent_hash: [u8; 32],
    pub model_id: [u8; 16],
    pub intent_count: u64,
    pub ts: i64,
}

#[event]
pub struct HaltChanged {
    pub halted: bool,
    pub ts: i64,
}

#[event]
pub struct WithdrawRequested {
    pub owner: Pubkey,
    pub unlock_ts: i64,
    pub expires_ts: i64,
    pub ts: i64,
}

#[event]
pub struct WithdrawCancelled {
    pub owner: Pubkey,
    pub ts: i64,
}
