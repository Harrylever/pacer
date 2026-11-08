//! Everything the contract says must be REFUSED, and that a refusal changes nothing.
use crate::common::*;
use pacer_vault::errors::VaultError as E;
use solana_keypair::Keypair;
use solana_signer::Signer;

fn usdc_in_vault(env: &Env, o: &anchor_lang::prelude::Pubkey) -> u64 {
    env.balance(&env.usdc_ata(&vault_pda(o)))
}

// ---- the keeper can never withdraw -------------------------------------------------

#[test]
fn the_keeper_cannot_withdraw_to_itself() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 2);
    let o = u.owner.pubkey();
    let keeper = env.keeper.insecure_clone();
    let usdc = env.usdc;
    // The keeper signs as "owner" and names its own wallet as the destination.
    let ix = env.ix_withdraw(&keeper.pubkey(), &o, &keeper.pubkey(), &usdc, &TOKEN, 1_000_000);
    let r = env.send_gas(&[ix], &[&keeper]);
    assert!(failed_with(&r, E::NotOwner), "{r:?}");
    assert_eq!(usdc_in_vault(&env, &o), 5_000_000);
    assert_eq!(env.balance(&env.usdc_ata(&keeper.pubkey())), 0);
}

#[test]
fn the_keeper_cannot_touch_the_withdrawal_delay_either() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 1_000_000, 1);
    let o = u.owner.pubkey();
    let keeper = env.keeper.insecure_clone();
    for ix in [
        env.ix_request_withdraw(&keeper.pubkey(), &o),
        env.ix_cancel_withdraw(&keeper.pubkey(), &o),
        env.ix_set_delay(&keeper.pubkey(), &o, 0),
        env.ix_set_rules(&keeper.pubkey(), &o, 100_000, &[0], true),
    ] {
        let r = env.send_gas(&[ix], &[&keeper]);
        assert!(failed_with(&r, E::NotOwner), "{r:?}");
    }
    assert!(!env.vault_state(&o).paused);
}

#[test]
fn the_owner_cannot_withdraw_to_any_other_address() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 2);
    let o = u.owner.pubkey();
    let other = Keypair::new().pubkey();
    let usdc = env.usdc;
    let ix = env.ix_withdraw(&o, &o, &other, &usdc, &TOKEN, 1_000_000);
    let r = env.as_owner(&u, ix);
    assert!(failed_with(&r, E::InvalidDestination), "{r:?}");
    assert_eq!(usdc_in_vault(&env, &o), 5_000_000);
}

#[test]
fn withdrawing_a_mint_outside_the_allowlist_is_refused() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 1_000_000, 1);
    let o = u.owner.pubkey();
    let spam = env.spam_mint_for_vault(&o);
    let ix = env.ix_withdraw(&o, &o, &u.destination.pubkey(), &spam, &TOKEN, 1);
    assert!(failed_with(&env.as_owner(&u, ix), E::MintNotAllowed));
}

// ---- buying within limits ----------------------------------------------------------

#[test]
fn a_buy_beyond_the_allowance_is_refused() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7); // allowance capped at 288_000
    let o = u.owner.pubkey();
    assert!(failed_with(&env.buy(&o, 0, 288_001), E::ExceedsAllowance));
    assert_eq!(env.vault_state(&o).total_invested, 0);
}

#[test]
fn a_buy_below_min_trade_is_refused() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7);
    assert!(failed_with(&env.buy(&u.owner.pubkey(), 0, MIN_TRADE - 1), E::BelowMinTrade));
}

#[test]
fn min_out_below_the_slippage_floor_is_refused() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7);
    let o = u.owner.pubkey();
    let floor = env.floor_for(0, 100_000);
    assert!(failed_with(&env.buy_raw(&o, 0, 100_000, floor - 1), E::SlippageTooHigh));
    assert!(failed_with(&env.buy_raw(&o, 0, 100_000, 0), E::SlippageTooHigh)); // the min_out = 0 exploit
    env.buy_raw(&o, 0, 100_000, floor).unwrap(); // exactly the floor is fine
}

#[test]
fn a_quote_whose_floor_rounds_to_zero_is_refused() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7);
    env.set_price(0, 1_000_000_000_000_000).unwrap(); // $1e9 per token: the quote for $0.10 is 0
    let r = env.buy_raw(&u.owner.pubkey(), 0, 100_000, 0);
    assert!(failed_with(&r, E::SlippageTooHigh), "{r:?}");
}

#[test]
fn a_stale_price_is_refused() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7);
    env.warp(MAX_AGE + 1); // no refresh
    assert!(failed_with(&env.buy(&u.owner.pubkey(), 0, 100_000), E::StalePrice));
}

#[test]
fn a_price_that_was_never_written_is_stale() {
    let mut env = Env::bare();
    env.init_config();
    let ix = env.ix_init_price(env.stocks[0].mint);
    env.send_gas(&[ix], &[&env.admin.insecure_clone()]).unwrap(); // price 0, updated_at 0
    let u = env.ready_vault_bare(144_000, &[0], 5_000_000, 7);
    assert!(failed_with(&env.buy_raw(&u.owner.pubkey(), 0, 100_000, 1), E::StalePrice));
}

#[test]
fn a_price_of_zero_cannot_be_written() {
    let mut env = Env::new();
    assert!(failed_with(&env.set_price(0, 0), E::InvalidPrice));
}

#[test]
fn the_keeper_cannot_write_a_price() {
    let mut env = Env::new();
    let keeper = env.keeper.insecure_clone();
    let ix = env.ix_update_price(&keeper.pubkey(), 0, 1);
    assert!(failed_with(&env.send_gas(&[ix], &[&keeper]), E::NotOracle));
}

#[test]
fn the_oracle_cannot_buy() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7);
    let oracle = env.oracle.insecure_clone();
    let ix = env.ix_buy(&oracle.pubkey(), &u.owner.pubkey(), 0, 100_000, env.floor_for(0, 100_000));
    assert!(failed_with(&env.send_gas(&[ix], &[&oracle]), E::NotKeeper));
}

#[test]
fn a_stock_the_user_did_not_choose_is_refused() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7);
    assert!(failed_with(&env.buy(&u.owner.pubkey(), 1, 100_000), E::MintNotChosen));
}

#[test]
fn a_buy_while_paused_is_refused() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7);
    env.set_rules(&u, 144_000, &[0], true).unwrap();
    assert!(failed_with(&env.buy(&u.owner.pubkey(), 0, 100_000), E::VaultPaused));
}

#[test]
fn a_buy_while_halted_is_refused_and_works_again_after() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7);
    let o = u.owner.pubkey();
    env.set_halt(true).unwrap();
    assert!(failed_with(&env.buy(&o, 0, 100_000), E::Halted));
    env.set_halt(false).unwrap();
    env.buy(&o, 0, 100_000).unwrap();
}

#[test]
fn a_swap_program_other_than_the_configured_one_is_refused() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7);
    let keeper = env.keeper.insecure_clone();
    let mut ix = env.ix_buy(&keeper.pubkey(), &u.owner.pubkey(), 0, 100_000, env.floor_for(0, 100_000));
    ix.accounts[9].pubkey = TOKEN; // swap_program: an executable program, but not config.swap_program
    assert!(failed_with(&env.send_gas(&[ix], &[&keeper]), E::InvalidSwapProgram));
}

#[test]
fn the_keeper_cannot_redirect_the_usdc_to_its_own_account() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7);
    let o = u.owner.pubkey();
    let keeper = env.keeper.insecure_clone();
    env.fund_usdc(&keeper.pubkey(), 1);
    let mut ix = env.ix_buy(&keeper.pubkey(), &o, 0, 100_000, env.floor_for(0, 100_000));
    ix.accounts[10].pubkey = env.usdc_ata(&keeper.pubkey()); // treasury_usdc
    let r = env.send_gas(&[ix], &[&keeper]);
    assert!(r.is_err(), "the swap must refuse a treasury that is not its own: {r:?}");
    assert_eq!(usdc_in_vault(&env, &o), 5_000_000);
    assert_eq!(env.balance(&env.usdc_ata(&keeper.pubkey())), 1);
}

// ---- vault creation and rules ------------------------------------------------------

#[test]
fn a_rate_above_the_ceiling_or_zero_is_refused() {
    let mut env = Env::new();
    let u = env.new_user(1_000_000);
    assert!(failed_with(&env.create_vault(&u, MAX_RATE + 1, &[0]), E::ExceedsMaxRate));
    assert!(failed_with(&env.create_vault(&u, 0, &[0]), E::ExceedsMaxRate));
    env.create_vault(&u, MAX_RATE, &[0]).unwrap(); // exactly the ceiling is fine
    assert!(failed_with(&env.set_rules(&u, MAX_RATE + 1, &[0], false), E::ExceedsMaxRate));
}

#[test]
fn a_second_vault_for_the_same_owner_is_refused() {
    let mut env = Env::new();
    let u = env.new_user(1_000_000);
    env.create_vault(&u, 144_000, &[0]).unwrap();
    assert!(env.create_vault(&u, 99_000, &[1]).is_err());
    assert_eq!(env.vault_state(&u.owner.pubkey()).rate_per_period, 144_000);
}

#[test]
fn bad_mint_lists_are_refused() {
    let mut env = Env::new();
    let u = env.new_user(1_000_000);
    assert!(failed_with(&env.create_vault(&u, 144_000, &[]), E::NoMintsChosen));
    assert!(failed_with(&env.create_vault(&u, 144_000, &[0, 0]), E::NoMintsChosen));
}

#[test]
fn a_zero_amount_is_refused() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 1_000_000, 1);
    assert!(failed_with(&env.deposit(&u, 0), E::ZeroAmount));
    assert!(failed_with(&env.withdraw_usdc(&u, 0), E::ZeroAmount));
}

#[test]
fn someone_who_is_not_the_owner_cannot_deposit_or_change_rules() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 1_000_000, 1);
    let o = u.owner.pubkey();
    let stranger = env.new_user(1_000_000);
    let s = stranger.owner.pubkey();
    // Sign as the stranger, but point at the victim's vault.
    let ix = env.ix_set_rules(&s, &o, 50_000_000, &[0], false);
    assert!(failed_with(&env.as_owner(&stranger, ix), E::NotOwner));
    assert_eq!(env.vault_state(&o).rate_per_period, 144_000);
}
