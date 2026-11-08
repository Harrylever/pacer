//! The pace: what unlocks, when, and what a vault can never build up.
use crate::common::*;
use pacer_vault::errors::VaultError as E;
use pacer_vault::math::quote_out;
use solana_signer::Signer;

#[test]
fn period_zero_has_no_allowance() {
    let mut env = Env::new();
    let u = env.new_user(5_000_000);
    env.create_vault(&u, 144_000, &[0]).unwrap();
    env.deposit(&u, 5_000_000).unwrap();
    let o = u.owner.pubkey();
    assert!(failed_with(&env.buy(&o, 0, 100_000), E::ExceedsAllowance));
    env.warp(9); // still inside period 0
    env.refresh_prices();
    assert!(failed_with(&env.buy(&o, 0, 100_000), E::ExceedsAllowance));
    assert_eq!(env.vault_state(&o).total_invested, 0);
}

#[test]
fn a_split_buy_of_two_stocks_in_one_period() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0, 2], 5_000_000, 7); // allowance caps at 288_000
    let o = u.owner.pubkey();
    env.buy(&o, 0, 100_000).unwrap();
    env.buy(&o, 2, 100_000).unwrap();
    let v = vault_pda(&o);
    assert_eq!(env.balance(&env.stock_ata(&v, 0)), quote_out(100_000, PRICES[0], 8).unwrap());
    assert_eq!(env.balance(&env.stock_ata(&v, 2)), quote_out(100_000, PRICES[2], 8).unwrap());
    assert_eq!(env.vault_state(&o).total_invested, 200_000);
    assert_eq!(env.vault_state(&o).allowance, 88_000);
}

#[test]
fn raising_the_rate_does_not_unlock_past_periods() {
    let mut env = Env::new();
    let u = env.ready_vault(100_000, &[0], 5_000_000, 1);
    let o = u.owner.pubkey();
    env.set_rules(&u, 50_000_000, &[0], false).unwrap(); // settles first, at the OLD rate
    assert!(failed_with(&env.buy(&o, 0, 100_001), E::ExceedsAllowance));
    env.buy(&o, 0, 100_000).unwrap();
}

#[test]
fn a_long_idle_period_caps_the_allowance() {
    let mut env = Env::new();
    let u = env.ready_vault(100_000, &[0], 5_000_000, 365);
    let o = u.owner.pubkey();
    // cap = 2 * max(rate, min_trade) = 200_000, however long the vault sat idle
    assert!(failed_with(&env.buy(&o, 0, 200_001), E::ExceedsAllowance));
    env.buy(&o, 0, 200_000).unwrap();
}

#[test]
fn pausing_mid_period_credits_only_whole_periods_before_the_pause() {
    let mut env = Env::new();
    let u = env.new_user(5_000_000);
    env.create_vault(&u, 100_000, &[0]).unwrap();
    env.deposit(&u, 5_000_000).unwrap();
    let o = u.owner.pubkey();
    let t0 = env.now();
    env.warp(15); // one whole period plus 5 s of the next
    env.set_rules(&u, 100_000, &[0], true).unwrap();
    assert_eq!(env.vault_state(&o).allowance, 100_000); // the whole period, not the partial one
    assert_eq!(env.vault_state(&o).last_checkpoint_ts, t0 + 10);
    env.warp(100); // paused time never accrues
    env.set_rules(&u, 100_000, &[0], false).unwrap();
    let v = env.vault_state(&o);
    assert_eq!(v.allowance, 100_000);
    assert_eq!(v.last_checkpoint_ts, env.now()); // unpausing starts a fresh period
    env.warp(10);
    env.refresh_prices();
    env.buy(&o, 0, 200_000).unwrap(); // 100_000 + one new period
}

#[test]
fn set_rules_cannot_change_the_withdrawal_destination() {
    let mut env = Env::new();
    let u = env.ready_vault(100_000, &[0], 1_000_000, 1);
    env.set_rules(&u, 200_000, &[0, 1], false).unwrap();
    assert_eq!(env.vault_state(&u.owner.pubkey()).withdrawal_destination, u.destination.pubkey());
}
