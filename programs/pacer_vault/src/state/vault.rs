use crate::constants::MAX_STOCKS;
use crate::errors::VaultError;
use crate::math::{settled_allowance, whole_periods};
use crate::state::GlobalConfig;
use anchor_lang::prelude::*;

/// One user's vault. The PDA is also the authority of the vault's token accounts.
/// Fixed-size fields first, the variable-size `chosen_mints` last.
#[account]
#[derive(InitSpace)]
pub struct UserVault {
    pub owner: Pubkey,
    /// Set once at creation. Nothing can change it.
    pub withdrawal_destination: Pubkey,
    pub rate_per_period: u64,
    /// Stored allowance. It only changes inside `settle`, so clients must not
    /// read it as "what can be bought now".
    pub allowance: u64,
    pub last_checkpoint_ts: i64,
    pub total_invested: u64,
    pub intent_count: u64,
    pub created_ts: i64,
    /// Reserved. Always 0 (CONTRACT.md decision 7).
    pub lock_until: i64,
    pub withdraw_unlock_ts: i64,
    pub withdraw_expires_ts: i64,
    pub pending_delay_effective_ts: i64,
    /// 0 means no delay.
    pub withdraw_delay_secs: u32,
    pub pending_delay_secs: u32,
    pub paused: bool,
    pub bump: u8,
    pub last_intent_hash: [u8; 32],
    pub last_model_id: [u8; 16],
    pub reserved: [u8; 64],
    #[max_len(10)]
    pub chosen_mints: Vec<Pubkey>,
}

impl UserVault {
    pub fn is_chosen(&self, mint: &Pubkey) -> bool {
        self.chosen_mints.contains(mint)
    }

    /// CONTRACT.md "Pace math". Credits whole periods (capped), keeps the
    /// partial period, and never accrues while paused.
    pub fn settle(&mut self, now: i64, cfg: &GlobalConfig) -> Result<()> {
        if self.paused {
            self.last_checkpoint_ts = now;
            return Ok(());
        }
        let periods = whole_periods(now, self.last_checkpoint_ts, cfg.period_seconds);
        self.allowance = settled_allowance(self.allowance, self.rate_per_period, cfg.min_trade, periods)?;
        let advance = i64::try_from(periods)
            .ok()
            .and_then(|p| p.checked_mul(i64::from(cfg.period_seconds)))
            .ok_or(VaultError::MathOverflow)?;
        self.last_checkpoint_ts = self.last_checkpoint_ts.checked_add(advance).ok_or(VaultError::MathOverflow)?;
        Ok(())
    }

    /// Applies a lower delay once its waiting time has passed.
    pub fn fold_pending_delay(&mut self, now: i64) {
        if self.pending_delay_effective_ts != 0 && now >= self.pending_delay_effective_ts {
            self.withdraw_delay_secs = self.pending_delay_secs;
            self.pending_delay_secs = 0;
            self.pending_delay_effective_ts = 0;
        }
    }
}

/// Shared by `create_vault` and `set_rules`: 0 < rate <= ceiling, and the mints
/// are a non-empty, duplicate-free subset of the allowlist.
pub fn validate_plan(cfg: &GlobalConfig, rate: u64, mints: &[Pubkey]) -> Result<()> {
    require!(rate > 0 && rate <= cfg.max_rate_per_period, VaultError::ExceedsMaxRate);
    require!(!mints.is_empty() && mints.len() <= MAX_STOCKS, VaultError::NoMintsChosen);
    for (i, m) in mints.iter().enumerate() {
        require!(cfg.is_allowed(m), VaultError::MintNotAllowed);
        require!(!mints[..i].contains(m), VaultError::NoMintsChosen);
    }
    Ok(())
}
