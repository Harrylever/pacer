//! The optional withdrawal delay: friction against impulse, not a trap.
use crate::common::*;
use pacer_vault::errors::VaultError as E;
use solana_signer::Signer;

fn vault_with_delay(env: &mut Env, delay: u32) -> User {
    let u = env.new_user(5_000_000);
    env.create_vault_with_delay(&u, 144_000, &[0], delay).unwrap();
    env.deposit(&u, 5_000_000).unwrap();
    u
}

#[test]
fn requesting_a_withdrawal_needs_a_delay_to_be_set() {
    let mut env = Env::new();
    let u = vault_with_delay(&mut env, 0);
    let ix = env.ix_request_withdraw(&u.owner.pubkey(), &u.owner.pubkey());
    assert!(failed_with(&env.as_owner(&u, ix), E::DelayNotEnabled));
    env.withdraw_usdc(&u, 1_000_000).unwrap(); // no delay: withdrawing is immediate
}

#[test]
fn a_delayed_vault_pays_out_only_inside_its_window() {
    let mut env = Env::new();
    let u = vault_with_delay(&mut env, 20);
    let o = u.owner.pubkey();
    // No request yet: refused.
    assert!(failed_with(&env.withdraw_usdc(&u, 1_000_000), E::WithdrawWindowClosed));
    // Request: still refused until the delay has passed.
    let ix = env.ix_request_withdraw(&o, &o);
    env.as_owner(&u, ix).unwrap();
    assert!(failed_with(&env.withdraw_usdc(&u, 1_000_000), E::WithdrawWindowClosed));
    env.warp(19);
    assert!(failed_with(&env.withdraw_usdc(&u, 1_000_000), E::WithdrawWindowClosed));
    env.warp(1); // unlocked
    env.withdraw_usdc(&u, 1_000_000).unwrap();
    env.withdraw_usdc(&u, 1_000_000).unwrap(); // the window covers the whole vault, so several legs work
    // The window closes after `withdraw_window_secs`.
    env.warp(WINDOW as i64 + 1);
    assert!(failed_with(&env.withdraw_usdc(&u, 1_000_000), E::WithdrawWindowClosed));
    // A new withdrawal needs a new request and waits out the delay again.
    let ix = env.ix_request_withdraw(&o, &o);
    env.as_owner(&u, ix).unwrap();
    env.warp(20);
    env.withdraw_usdc(&u, 1_000_000).unwrap();
}

#[test]
fn cancelling_closes_the_window() {
    let mut env = Env::new();
    let u = vault_with_delay(&mut env, 20);
    let o = u.owner.pubkey();
    let ix = env.ix_request_withdraw(&o, &o);
    env.as_owner(&u, ix).unwrap();
    env.warp(20);
    let ix = env.ix_cancel_withdraw(&o, &o);
    env.as_owner(&u, ix).unwrap();
    assert!(failed_with(&env.withdraw_usdc(&u, 1_000_000), E::WithdrawWindowClosed));
}

#[test]
fn a_higher_delay_applies_at_once_a_lower_one_only_after_the_current_delay() {
    let mut env = Env::new();
    let u = vault_with_delay(&mut env, 20);
    let o = u.owner.pubkey();

    let ix = env.ix_set_delay(&o, &o, 100); // raise: immediate
    env.as_owner(&u, ix).unwrap();
    assert_eq!(env.vault_state(&o).withdraw_delay_secs, 100);

    let t = env.now();
    let ix = env.ix_set_delay(&o, &o, 10); // lower: waits out the current delay
    env.as_owner(&u, ix).unwrap();
    let v = env.vault_state(&o);
    assert_eq!((v.withdraw_delay_secs, v.pending_delay_secs, v.pending_delay_effective_ts), (100, 10, t + 100));

    // Requesting now still uses the OLD delay, so nobody can shorten it quickly.
    let ix = env.ix_request_withdraw(&o, &o);
    env.as_owner(&u, ix).unwrap();
    assert_eq!(env.vault_state(&o).withdraw_unlock_ts, env.now() + 100);

    // Once the waiting time has passed, the lower delay is in force.
    env.warp(100);
    let ix = env.ix_request_withdraw(&o, &o);
    env.as_owner(&u, ix).unwrap();
    let v = env.vault_state(&o);
    assert_eq!((v.withdraw_delay_secs, v.pending_delay_secs), (10, 0));
    assert_eq!(v.withdraw_unlock_ts, env.now() + 10);
}

#[test]
fn a_delay_above_the_cap_is_refused() {
    let mut env = Env::new();
    let u = env.new_user(1_000_000);
    assert!(failed_with(&env.create_vault_with_delay(&u, 144_000, &[0], MAX_DELAY + 1), E::DelayTooLong));
    env.create_vault_with_delay(&u, 144_000, &[0], MAX_DELAY).unwrap(); // exactly the cap is fine
    let o = u.owner.pubkey();
    let ix = env.ix_set_delay(&o, &o, MAX_DELAY + 1);
    assert!(failed_with(&env.as_owner(&u, ix), E::DelayTooLong));
}
