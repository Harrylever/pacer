pub const CONFIG_SEED: &[u8] = b"config";
pub const PRICE_SEED: &[u8] = b"price";
pub const VAULT_SEED: &[u8] = b"vault";

/// Size of the stock allowlist, and the most mints a vault can choose.
pub const MAX_STOCKS: usize = 10;
pub const BPS_DENOMINATOR: u128 = 10_000;
/// USDC is always 6 decimals (checked at `init_config`).
pub const USDC_DECIMALS: u8 = 6;
