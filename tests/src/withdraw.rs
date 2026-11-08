//! The user can always get their money out: everything, in one transaction, to their own wallet.
use crate::common::*;
use anchor_lang::prelude::Pubkey;
use solana_signer::Signer;

fn dest_balance_usdc(env: &Env, u: &User) -> u64 {
    env.balance(&env.usdc_ata(&u.destination.pubkey()))
}
fn dest_balance_stock(env: &Env, u: &User, i: usize) -> u64 {
    env.balance(&env.stock_ata(&u.destination.pubkey(), i))
}

#[test]
fn withdrawing_everything_to_a_fresh_wallet_in_one_transaction() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0, 1], 5_000_000, 7);
    let o = u.owner.pubkey();
    env.buy(&o, 0, 100_000).unwrap();
    env.buy(&o, 1, 100_000).unwrap();
    // The user stops choosing the first two stocks. What they hold must still come out.
    env.set_rules(&u, 144_000, &[2], false).unwrap();

    let v = vault_pda(&o);
    let (usdc, s0, s1) = (env.balance(&env.usdc_ata(&v)), env.balance(&env.stock_ata(&v, 0)), env.balance(&env.stock_ata(&v, 1)));
    assert!(usdc > 0 && s0 > 0 && s1 > 0);

    // The destination wallet has nothing: no SOL, no token accounts. The gas wallet creates them.
    assert!(env.svm.get_account(&u.destination.pubkey()).is_none());
    let ixs = env.withdraw_all_ixs(&u);
    assert_eq!(ixs.len(), 3, "USDC plus both stocks, including the one no longer chosen");
    env.withdraw_everything(&u).unwrap();

    assert_eq!(dest_balance_usdc(&env, &u), usdc);
    assert_eq!(dest_balance_stock(&env, &u, 0), s0);
    assert_eq!(dest_balance_stock(&env, &u, 1), s1);
    assert_eq!(env.balance(&env.usdc_ata(&v)), 0);
    assert_eq!(env.balance(&env.stock_ata(&v, 0)), 0);
    assert_eq!(env.balance(&env.stock_ata(&v, 1)), 0);
}

#[test]
fn four_withdraw_legs_fit_in_one_transaction() {
    let mut env = Env::new();
    let u = env.ready_vault(300_000, &[0, 1, 2], 5_000_000, 7); // allowance caps at 600_000
    let o = u.owner.pubkey();
    for i in 0..3 {
        env.buy(&o, i, 100_000).unwrap();
        env.refresh_prices();
    }
    let ixs = env.withdraw_all_ixs(&u);
    assert_eq!(ixs.len(), 4);
    let size = env.tx_size(&ixs, &[&u.owner.insecure_clone()]);
    assert!(size <= 1232, "withdraw-everything with 4 legs is {size} bytes, over the 1,232-byte limit");
    println!("4-leg withdraw-everything transaction: {size} bytes");
    env.withdraw_everything(&u).unwrap();
    for i in 0..3 {
        assert!(dest_balance_stock(&env, &u, i) > 0);
    }
}

#[test]
fn a_buy_transaction_fits_in_one_packet() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7);
    let keeper = env.keeper.insecure_clone();
    let ix = env.ix_buy(&keeper.pubkey(), &u.owner.pubkey(), 0, 100_000, env.floor_for(0, 100_000));
    let size = env.tx_size(&[ix], &[&keeper]);
    assert!(size <= 1232, "buy is {size} bytes, over the 1,232-byte limit");
    println!("buy transaction: {size} bytes");
}

#[test]
fn withdrawing_works_while_paused_and_while_halted() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 2);
    env.set_rules(&u, 144_000, &[0], true).unwrap();
    env.set_halt(true).unwrap();
    env.withdraw_usdc(&u, 1_000_000).unwrap();
    assert_eq!(dest_balance_usdc(&env, &u), 1_000_000);
}

#[test]
fn a_partial_withdrawal_leaves_the_rest() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 2);
    env.withdraw_usdc(&u, 2_000_000).unwrap();
    assert_eq!(env.balance(&env.usdc_ata(&vault_pda(&u.owner.pubkey()))), 3_000_000);
    assert_eq!(dest_balance_usdc(&env, &u), 2_000_000);
}

// ---- a paused stock mint (the issuer can pause the real xStocks) ---------------------

#[test]
fn buy_fails_cleanly_when_the_stock_mint_is_paused() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7);
    let o = u.owner.pubkey();
    env.pause_mint(0).unwrap();
    let r = env.buy(&o, 0, 100_000);
    assert!(r.is_err(), "minting into a paused mint must fail");
    // Nothing moved and nothing was booked.
    assert_eq!(env.balance(&env.usdc_ata(&vault_pda(&o))), 5_000_000);
    assert_eq!(env.vault_state(&o).total_invested, 0);
    assert_eq!(env.balance(&env.treasury), 0);
}

#[test]
fn withdrawing_a_paused_stock_fails_cleanly_but_usdc_still_comes_out() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7);
    let o = u.owner.pubkey();
    env.buy(&o, 0, 100_000).unwrap();
    let v = vault_pda(&o);
    let held = env.balance(&env.stock_ata(&v, 0));
    assert!(held > 0);

    env.pause_mint(0).unwrap();
    let r = env.withdraw_stock(&u, 0, held);
    assert!(r.is_err(), "transfers of a paused mint must fail");
    assert_eq!(env.balance(&env.stock_ata(&v, 0)), held); // nothing moved

    env.withdraw_usdc(&u, 1_000_000).unwrap(); // the USDC leg is unaffected
}

#[test]
fn only_the_destination_ever_receives_funds() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 2);
    env.withdraw_usdc(&u, 5_000_000).unwrap();
    let everyone_else: [Pubkey; 3] = [env.keeper.pubkey(), env.gas.pubkey(), env.oracle.pubkey()];
    for k in everyone_else {
        assert_eq!(env.balance(&env.usdc_ata(&k)), 0);
    }
    assert_eq!(dest_balance_usdc(&env, &u), 5_000_000);
}
