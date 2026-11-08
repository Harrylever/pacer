//! First-hour check from CONTRACT.md: do `litesvm` and `anchor-lang` agree on
//! Solana types? If this compiles and passes, they do.
use anchor_lang::prelude::Pubkey;
use litesvm::LiteSVM;

#[test]
fn litesvm_and_anchor_share_types() {
    let mut svm = LiteSVM::new();
    let payer = Pubkey::new_unique();
    svm.airdrop(&payer, 1_000_000_000).unwrap();
    assert_eq!(svm.get_balance(&payer), Some(1_000_000_000));
}
