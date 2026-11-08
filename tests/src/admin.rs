//! Setup validation, admin-only controls, intents, and the byte layout other programs rely on.
use crate::common::*;
use anchor_lang::Discriminator;
use pacer_vault::errors::VaultError as E;
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn init_config_stores_what_it_was_given() {
    let mut env = Env::bare();
    env.init_config();
    let c = env.config_state();
    assert_eq!(c.admin, env.admin.pubkey());
    assert_eq!(c.keeper, env.keeper.pubkey());
    assert_eq!(c.oracle_authority, env.oracle.pubkey());
    assert_eq!(c.swap_program, SWAP_ID);
    assert_eq!(c.usdc_mint, env.usdc);
    assert_eq!(c.stock_count, 3);
    assert_eq!(c.stocks(), &env.mints(&[0, 1, 2])[..]);
    assert_eq!((c.period_seconds as i64, c.min_trade, c.max_rate_per_period), (PERIOD, MIN_TRADE, MAX_RATE));
    assert!(!c.halted);
}

#[test]
fn init_config_validates_its_arguments() {
    let cfg = config_pda();
    let try_with = |tweak: &dyn Fn(&mut pacer_vault::InitConfigArgs, &mut Env) -> anchor_lang::prelude::Pubkey| -> TxResult {
        let mut env = Env::bare();
        let mut args = env.good_args();
        let usdc = tweak(&mut args, &mut env);
        env.try_init_config(args, usdc, cfg)
    };
    let keep_usdc = |env: &Env| env.usdc;

    let r = try_with(&|a, e| { a.keeper = e.admin.pubkey(); keep_usdc(e) });
    assert!(failed_with(&r, E::DuplicateKeys), "keeper == admin: {r:?}");
    let r = try_with(&|a, e| { a.oracle_authority = a.keeper; keep_usdc(e) });
    assert!(failed_with(&r, E::DuplicateKeys), "oracle == keeper: {r:?}");
    let r = try_with(&|_, e| e.stocks[0].mint); // a stock mint (8 decimals) as the USDC mint
    assert!(failed_with(&r, E::InvalidDecimals), "{r:?}");
    let r = try_with(&|a, e| { a.stock_mints.clear(); keep_usdc(e) });
    assert!(failed_with(&r, E::InvalidConfig), "empty allowlist: {r:?}");
    let r = try_with(&|a, e| { a.stock_mints.push(a.stock_mints[0]); keep_usdc(e) });
    assert!(failed_with(&r, E::InvalidConfig), "duplicate stock: {r:?}");
    let r = try_with(&|a, e| { a.stock_mints[0] = e.usdc; keep_usdc(e) });
    assert!(failed_with(&r, E::InvalidConfig), "USDC listed as a stock: {r:?}");
    let r = try_with(&|a, e| { a.period_seconds = 0; keep_usdc(e) });
    assert!(failed_with(&r, E::InvalidConfig), "period 0: {r:?}");
    let r = try_with(&|a, e| { a.min_trade = 0; keep_usdc(e) });
    assert!(failed_with(&r, E::InvalidConfig), "min_trade 0: {r:?}");
    let r = try_with(&|a, e| { a.max_slippage_bps = 10_000; keep_usdc(e) });
    assert!(failed_with(&r, E::InvalidConfig), "slippage 100%: {r:?}");
    let r = try_with(&|a, e| { a.swap_program = Default::default(); keep_usdc(e) });
    assert!(failed_with(&r, E::InvalidConfig), "no swap program: {r:?}");
}

#[test]
fn the_config_can_only_be_initialised_once() {
    let mut env = Env::new();
    let (args, usdc, cfg) = (env.good_args(), env.usdc, env.config);
    assert!(env.try_init_config(args, usdc, cfg).is_err());
}

#[test]
fn only_the_admin_can_halt_or_rotate_keys() {
    let mut env = Env::new();
    let keeper = env.keeper.insecure_clone();
    let ix = env.ix_set_halt(&keeper.pubkey(), true);
    assert!(failed_with(&env.send_gas(&[ix], &[&keeper]), E::NotAdmin));
    let ix = env.ix_set_authorities(&keeper.pubkey(), Keypair::new().pubkey(), Keypair::new().pubkey());
    assert!(failed_with(&env.send_gas(&[ix], &[&keeper]), E::NotAdmin));
    assert!(!env.config_state().halted);
}

#[test]
fn only_the_admin_can_create_a_price_account() {
    let mut env = Env::bare(); // no prices yet, so the admin check is what stops this
    env.init_config();
    let keeper = env.keeper.insecure_clone();
    let mut ix = env.ix_init_price(env.stocks[0].mint);
    ix.accounts[0].pubkey = keeper.pubkey(); // the admin slot
    assert!(failed_with(&env.send_gas(&[ix], &[&keeper]), E::NotAdmin));
}

#[test]
fn a_price_account_cannot_be_created_for_a_mint_outside_the_allowlist() {
    let mut env = Env::new();
    let u = env.new_user(1);
    let spam = env.spam_mint_for_vault(&u.owner.pubkey());
    let ix = env.ix_init_price(spam);
    let admin = env.admin.insecure_clone();
    assert!(failed_with(&env.send_gas(&[ix], &[&admin]), E::MintNotAllowed));
}

#[test]
fn rotating_the_keeper_locks_the_old_one_out() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 5_000_000, 7);
    let (new_keeper, admin) = (Keypair::new(), env.admin.insecure_clone());
    let ix = env.ix_set_authorities(&admin.pubkey(), new_keeper.pubkey(), env.oracle.pubkey());
    env.send_gas(&[ix], &[&admin]).unwrap();
    assert_eq!(env.config_state().keeper, new_keeper.pubkey());
    assert!(failed_with(&env.buy(&u.owner.pubkey(), 0, 100_000), E::NotKeeper)); // the old keeper
}

#[test]
fn authorities_must_stay_three_different_keys() {
    let mut env = Env::new();
    let admin = env.admin.insecure_clone();
    let ix = env.ix_set_authorities(&admin.pubkey(), admin.pubkey(), env.oracle.pubkey());
    assert!(failed_with(&env.send_gas(&[ix], &[&admin]), E::DuplicateKeys));
}

#[test]
fn record_intent_overwrites_and_counts_and_only_the_keeper_can() {
    let mut env = Env::new();
    let u = env.ready_vault(144_000, &[0], 1_000_000, 1);
    let o = u.owner.pubkey();
    let keeper = env.keeper.insecure_clone();
    for _ in 0..2 {
        let ix = env.ix_record_intent(&keeper.pubkey(), &o);
        env.send_gas(&[ix], &[&keeper]).unwrap();
    }
    let v = env.vault_state(&o);
    assert_eq!((v.intent_count, v.last_intent_hash, v.last_model_id), (2, [7u8; 32], [9u8; 16]));
    let owner = u.owner.insecure_clone();
    let ix = env.ix_record_intent(&owner.pubkey(), &o);
    assert!(failed_with(&env.send_gas(&[ix], &[&owner]), E::NotKeeper));
}

// ---- layout that mock_swap and the backend rely on -----------------------------------

#[test]
fn mock_swaps_price_discriminator_matches_the_vault() {
    assert_eq!(pacer_vault::PriceAccount::DISCRIMINATOR, mock_swap::PRICE_ACCOUNT_DISCRIMINATOR);
}

#[test]
fn the_price_account_has_the_documented_byte_layout() {
    let env = Env::new();
    let a = env.svm.get_account(&env.stocks[0].price).unwrap();
    assert_eq!(&a.data[..8], &mock_swap::PRICE_ACCOUNT_DISCRIMINATOR);
    assert_eq!(u64::from_le_bytes(a.data[8..16].try_into().unwrap()), PRICES[0]); // price_micro_usdc @ 8
    assert_eq!(i64::from_le_bytes(a.data[16..24].try_into().unwrap()), env.now()); // updated_at @ 16
    assert_eq!(&a.data[24..56], env.stocks[0].mint.as_ref()); // mint @ 24
}

#[test]
fn mock_swap_hardcodes_the_vaults_program_id() {
    assert_eq!(mock_swap::PACER_VAULT_ID, pacer_vault::ID);
}
