use crate::common::*;
use solana_signer::Signer;

#[test]
fn happy_path_deposit_wait_buy() {
    let mut env = Env::new();
    let user = env.new_user(10_000_000);
    env.create_vault(&user, 144_000, &[0]).unwrap();
    env.deposit(&user, 10_000_000).unwrap();
    let owner = user.owner.pubkey();
    // Demo config: min_trade is $0.10, so the allowance cap is 2 * max(144_000, 100_000) = 288_000.
    env.advance_periods(7);
    env.buy(&owner, 0, 250_000).unwrap();
    let vault = vault_pda(&owner);
    assert_eq!(env.balance(&env.stock_ata(&vault, 0)), 74_300); // 250_000 * 1e8 / 336_470_000
    assert_eq!(env.balance(&env.usdc_ata(&vault)), 9_750_000);
    assert_eq!(env.vault_state(&owner).total_invested, 250_000);
    assert_eq!(env.vault_state(&owner).allowance, 38_000); // 288_000 - 250_000
}
