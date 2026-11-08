//! Devnet stand-in for Jupiter. Takes USDC-dev, mints the stand-in stock at the
//! oracle price. Permissionless and devnet-only: it mints, so it never runs out
//! of liquidity. See CONTRACT.md "mock_swap".
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked};

declare_id!("E3fu6bCTnhotjprKFa5kaCgF1avv3n7J1nuB9iPrUFgY");

/// pacer_vault's program id. Hard-coded so mock_swap does not depend on pacer_vault.
pub const PACER_VAULT_ID: Pubkey = pubkey!("Bj6PUUzuupGFKhLdDpVEakW4NQp3z9VXjSmekmx1yHC4");
pub const PRICE_SEED: &[u8] = b"price";
pub const MOCK_AUTHORITY_SEED: &[u8] = b"mock_authority";
/// `sha256("account:PriceAccount")[..8]`; a test asserts this equals pacer_vault's IDL.
pub const PRICE_ACCOUNT_DISCRIMINATOR: [u8; 8] = [85, 228, 226, 113, 218, 91, 116, 92];
/// Byte offsets inside pacer_vault's `PriceAccount` (CONTRACT.md "PriceAccount").
const PRICE_OFFSET: usize = 8;
const MINT_OFFSET: usize = 24;
const PRICE_MIN_LEN: usize = MINT_OFFSET + 32;

#[error_code]
pub enum MockSwapError {
    #[msg("Price account is not pacer_vault's price account for this mint")]
    WrongPriceAccount,
    #[msg("Price is zero")]
    InvalidPrice,
    #[msg("Swap output is zero")]
    ZeroOutput,
    #[msg("Output is below min_out")]
    SlippageExceeded,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}

#[program]
pub mod mock_swap {
    use super::*;

    /// Swap `usdc_in` USDC for stand-in stock at the oracle price.
    pub fn swap(ctx: Context<Swap>, usdc_in: u64, min_out: u64) -> Result<()> {
        let stock_mint = ctx.accounts.stock_mint.key();
        let price = read_price(&ctx.accounts.price, &stock_mint)?;
        let out = quote_out(usdc_in, price, ctx.accounts.stock_mint.decimals)?;
        require!(out > 0, MockSwapError::ZeroOutput);
        require!(out >= min_out, MockSwapError::SlippageExceeded);

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.usdc_token_program.key(),
                TransferChecked {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.treasury_usdc.to_account_info(),
                    authority: ctx.accounts.user_authority.to_account_info(),
                },
            ),
            usdc_in,
            ctx.accounts.usdc_mint.decimals,
        )?;

        let seeds: &[&[u8]] = &[MOCK_AUTHORITY_SEED, &[ctx.bumps.mock_authority]];
        token_interface::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.stock_token_program.key(),
                MintTo {
                    mint: ctx.accounts.stock_mint.to_account_info(),
                    to: ctx.accounts.user_stock.to_account_info(),
                    authority: ctx.accounts.mock_authority.to_account_info(),
                },
                &[seeds],
            ),
            out,
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Swap<'info> {
    /// The party paying USDC. In practice the vault PDA, signing through a CPI.
    pub user_authority: Signer<'info>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    /// The stand-in stock mint; this program's PDA must be its mint authority.
    #[account(mut, mint::authority = mock_authority)]
    pub stock_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = usdc_mint, token::authority = user_authority, token::token_program = usdc_token_program)]
    pub user_usdc: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, token::mint = stock_mint, token::authority = user_authority, token::token_program = stock_token_program)]
    pub user_stock: InterfaceAccount<'info, TokenAccount>,
    /// Fixed to this program's own associated token account, so a caller cannot redirect the USDC.
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = mock_authority, associated_token::token_program = usdc_token_program)]
    pub treasury_usdc: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: PDA that is the mint authority of every stand-in stock and owns the treasury.
    #[account(seeds = [MOCK_AUTHORITY_SEED], bump)]
    pub mock_authority: UncheckedAccount<'info>,
    /// CHECK: pacer_vault's `PriceAccount`, validated by hand in `read_price`.
    pub price: UncheckedAccount<'info>,
    pub usdc_token_program: Interface<'info, TokenInterface>,
    pub stock_token_program: Interface<'info, TokenInterface>,
}

/// Reads `price_micro_usdc` from pacer_vault's `PriceAccount` by raw bytes, after
/// checking owner, address, discriminator and the mint stored inside it.
fn read_price(price: &UncheckedAccount, stock_mint: &Pubkey) -> Result<u64> {
    require_keys_eq!(*price.owner, PACER_VAULT_ID, MockSwapError::WrongPriceAccount);
    let (expected, _) =
        Pubkey::find_program_address(&[PRICE_SEED, stock_mint.as_ref()], &PACER_VAULT_ID);
    require_keys_eq!(price.key(), expected, MockSwapError::WrongPriceAccount);
    let data = price.try_borrow_data()?;
    require!(data.len() >= PRICE_MIN_LEN, MockSwapError::WrongPriceAccount);
    require!(data[..8] == PRICE_ACCOUNT_DISCRIMINATOR, MockSwapError::WrongPriceAccount);
    require!(data[MINT_OFFSET..MINT_OFFSET + 32] == stock_mint.to_bytes(), MockSwapError::WrongPriceAccount);
    let mut raw = [0u8; 8];
    raw.copy_from_slice(&data[PRICE_OFFSET..PRICE_OFFSET + 8]);
    let value = u64::from_le_bytes(raw);
    require!(value > 0, MockSwapError::InvalidPrice);
    Ok(value)
}

/// Same maths as pacer_vault's quote: `usdc_in * 10^decimals / price`, in u128.
pub fn quote_out(usdc_in: u64, price: u64, stock_decimals: u8) -> Result<u64> {
    require!(price > 0, MockSwapError::InvalidPrice);
    let scale = 10u128.checked_pow(stock_decimals as u32).ok_or(MockSwapError::MathOverflow)?;
    let quoted = (usdc_in as u128)
        .checked_mul(scale)
        .ok_or(MockSwapError::MathOverflow)?
        / (price as u128);
    u64::try_from(quoted).map_err(|_| error!(MockSwapError::MathOverflow))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quote_matches_contract_vectors() {
        assert_eq!(quote_out(1_000_000, 336_470_000, 8).unwrap(), 297_203);
        assert_eq!(quote_out(250_000, 336_470_000, 8).unwrap(), 74_300);
        assert_eq!(quote_out(1, 336_470_000, 8).unwrap(), 0);
    }
}
