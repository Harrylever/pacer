//! Pure integer maths for the pace and the quote. No accounts, no clock: every
//! function here is tested against the vectors in CONTRACT.md.
use crate::constants::BPS_DENOMINATOR;
use crate::errors::VaultError;
use anchor_lang::prelude::*;

/// Whole periods elapsed since the checkpoint (integer division; partial periods are kept).
pub fn whole_periods(now: i64, last_checkpoint_ts: i64, period_seconds: u32) -> u64 {
    if period_seconds == 0 || now <= last_checkpoint_ts {
        return 0;
    }
    (now.saturating_sub(last_checkpoint_ts) as u64) / u64::from(period_seconds)
}

/// `min(stored + rate * periods, 2 * max(rate, min_trade))`, in u128 so a long
/// idle period can never overflow or build up a lump sum.
pub fn settled_allowance(stored: u64, rate: u64, min_trade: u64, periods: u64) -> Result<u64> {
    let cap = 2u128 * u128::from(rate.max(min_trade));
    let accrued = u128::from(stored).saturating_add(u128::from(rate).saturating_mul(u128::from(periods)));
    u64::try_from(accrued.min(cap)).map_err(|_| error!(VaultError::MathOverflow))
}

/// Raw stock units for `usdc_in`: `usdc_in * 10^decimals / price`, in u128.
/// `price` is micro-USDC per whole raw token; `decimals` comes from the stock mint.
pub fn quote_out(usdc_in: u64, price: u64, stock_decimals: u8) -> Result<u64> {
    require!(price > 0, VaultError::InvalidPrice);
    let scale = 10u128.checked_pow(u32::from(stock_decimals)).ok_or(VaultError::MathOverflow)?;
    let quoted = u128::from(usdc_in).checked_mul(scale).ok_or(VaultError::MathOverflow)? / u128::from(price);
    u64::try_from(quoted).map_err(|_| error!(VaultError::MathOverflow))
}

/// The lowest `min_out` the program accepts: the quote less `max_slippage_bps`.
/// A result of 0 is itself rejected by `buy` (it would allow `min_out = 0`).
pub fn slippage_floor(quoted_out: u64, max_slippage_bps: u16) -> u64 {
    let keep = BPS_DENOMINATOR.saturating_sub(u128::from(max_slippage_bps));
    (u128::from(quoted_out) * keep / BPS_DENOMINATOR) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: u64 = 1_000_000;

    #[test]
    fn settle_matches_contract_vectors() {
        // (stored, rate, min_trade, periods, expected)
        let cases: [(u64, u64, u64, u64, u64); 9] = [
            (0, 144_000, MIN, 0, 0),
            (0, 144_000, MIN, 3, 432_000),
            (0, 144_000, MIN, 6, 864_000),
            (0, 144_000, MIN, 7, 1_008_000),
            (0, 144_000, MIN, 365, 2_000_000),
            (900_000, 144_000, MIN, 1, 1_044_000),
            (0, 5_000_000, MIN, 1, 5_000_000),
            (0, 5_000_000, MIN, 365, 10_000_000),
            (0, 100_000, 100_000, 1, 100_000),
        ];
        for (stored, rate, min_trade, periods, want) in cases {
            assert_eq!(settled_allowance(stored, rate, min_trade, periods).unwrap(), want, "{stored} {rate} {periods}");
        }
    }

    #[test]
    fn huge_idle_period_cannot_overflow() {
        // cap = 2 * max(rate, min_trade); the huge idle period saturates instead of overflowing.
        assert_eq!(settled_allowance(0, u64::MAX / 4, MIN, u64::MAX).unwrap(), 2 * (u64::MAX / 4));
    }

    #[test]
    fn periods_ignore_the_partial_one() {
        assert_eq!(whole_periods(1_000 + 86_399, 1_000, 86_400), 0);
        assert_eq!(whole_periods(1_000 + 86_400, 1_000, 86_400), 1);
        assert_eq!(whole_periods(1_000 + 3 * 86_400 + 500, 1_000, 86_400), 3);
        assert_eq!(whole_periods(500, 1_000, 86_400), 0);
    }

    #[test]
    fn quote_and_floor_match_contract_vectors() {
        // (usdc_in, price, decimals, quoted_out, floor@100bps)
        let cases: [(u64, u64, u8, u64, u64); 6] = [
            (1_000_000, 336_470_000, 8, 297_203, 294_230),
            (1_000_000, 768_064_352, 8, 130_197, 128_895),
            (250_000, 336_470_000, 8, 74_300, 73_557),
            (100_000, 750_000_000, 8, 13_333, 13_199),
            (1_000_000, 1_000_000_000_000, 8, 100, 99),
            (1, 336_470_000, 8, 0, 0),
        ];
        for (usdc_in, price, dec, quoted, floor) in cases {
            let q = quote_out(usdc_in, price, dec).unwrap();
            assert_eq!(q, quoted);
            assert_eq!(slippage_floor(q, 100), floor);
        }
    }

    #[test]
    fn zero_price_is_rejected() {
        assert!(quote_out(1_000_000, 0, 8).is_err());
    }
}
