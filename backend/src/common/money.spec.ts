import { slippageFloor, toUiAmount, formatMoney } from './money';

describe('slippageFloor (SPEC u128 formula)', () => {
  it('computes the floor for a $1 buy of AAPLx at $336.47', () => {
    const floor = slippageFloor({
      usdcIn: 1_000_000n,
      priceMicroUsdc: 336_470_000n,
      stockDecimals: 8,
      maxSlippageBps: 100,
    });
    const quoted = (1_000_000n * 100_000_000n) / 336_470_000n;
    expect(floor).toBe((quoted * 9_900n) / 10_000n);
    expect(floor).toBeGreaterThan(0n);
  });

  it('returns 0n when the quote rounds down to zero (min_out=0 exploit guard)', () => {
    expect(
      slippageFloor({
        usdcIn: 1n,
        priceMicroUsdc: 999_000_000_000n,
        stockDecimals: 8,
        maxSlippageBps: 100,
      }),
    ).toBe(0n);
  });
});

describe('toUiAmount (ScaledUiAmount)', () => {
  it('applies the multiplier over raw base units', () => {
    expect(toUiAmount(100_300_000n, 8, 1.003)).toBeCloseTo(1.006009, 6);
    expect(toUiAmount(1_000_000n, 6, 1)).toBe(1);
  });
});

describe('formatMoney', () => {
  it('shows NGN first with USD underneath using the parallel rate', () => {
    expect(formatMoney(10, 'NGN', 1385)).toBe('₦13,850 ($10.00)');
  });
  it('shows USD alone when display currency is USD', () => {
    expect(formatMoney(10, 'USD', 1385)).toBe('$10.00');
  });
});
