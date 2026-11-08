use anchor_lang::prelude::*;

/// Anchor numbers these from 6000 in declaration order. CONTRACT.md lists the
/// codes, and the backend maps errors by name: **only ever append new errors.**
#[error_code]
pub enum VaultError {
    #[msg("Signer is not the config admin")]
    NotAdmin, // 6000
    #[msg("Signer is not the keeper")]
    NotKeeper, // 6001
    #[msg("Signer is not the oracle authority")]
    NotOracle, // 6002
    #[msg("Signer is not the vault owner")]
    NotOwner, // 6003
    #[msg("Invalid config arguments")]
    InvalidConfig, // 6004
    #[msg("Mint is not in the allowlist")]
    MintNotAllowed, // 6005
    #[msg("Stock is not in the vault's chosen mints")]
    MintNotChosen, // 6006
    #[msg("Mint list is empty, has duplicates, or is too long")]
    NoMintsChosen, // 6007
    #[msg("Rate is zero or above the maximum rate per period")]
    ExceedsMaxRate, // 6008
    #[msg("Withdrawal destination is invalid")]
    InvalidDestination, // 6009
    #[msg("Buying is halted")]
    Halted, // 6010
    #[msg("Vault is paused")]
    VaultPaused, // 6011
    #[msg("Amount is below the minimum trade")]
    BelowMinTrade, // 6012
    #[msg("Amount exceeds the unlocked allowance")]
    ExceedsAllowance, // 6013
    #[msg("Price is invalid")]
    InvalidPrice, // 6014
    #[msg("Price is stale")]
    StalePrice, // 6015
    #[msg("min_out is below the slippage floor")]
    SlippageTooHigh, // 6016
    #[msg("Swap spent more USDC than requested")]
    SwapOverspend, // 6017
    #[msg("Swap returned less stock than min_out")]
    SwapShortfall, // 6018
    #[msg("Arithmetic overflow")]
    MathOverflow, // 6019
    #[msg("Amount must be greater than zero")]
    ZeroAmount, // 6020
    #[msg("Withdrawals are locked")]
    WithdrawLocked, // 6021
    #[msg("Withdrawal window is not open")]
    WithdrawWindowClosed, // 6022
    #[msg("This vault has no withdrawal delay")]
    DelayNotEnabled, // 6023
    #[msg("Delay is above the maximum")]
    DelayTooLong, // 6024
    #[msg("USDC mint must have 6 decimals")]
    InvalidDecimals, // 6025
    #[msg("Admin, keeper and oracle must be three different keys")]
    DuplicateKeys, // 6026
    #[msg("Swap program does not match the config")]
    InvalidSwapProgram, // 6027
}
