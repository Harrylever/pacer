import { settledAllowance } from './pace';

const DAY = 86_400;
const MIN = 1_000_000n; // $1
const base = {
  allowance: 0n,
  ratePerPeriod: 144_000n, // ~₦200/day at ₦1,385/$
  lastCheckpointTs: 1_000_000,
  paused: false,
};

describe('settledAllowance (mirror of on-chain settle)', () => {
  it('gives nothing in period 0', () => {
    expect(settledAllowance(base, base.lastCheckpointTs + DAY - 1, DAY, MIN)).toBe(0n);
  });

  it('accrues rate per whole period, ignoring the partial one', () => {
    expect(settledAllowance(base, base.lastCheckpointTs + 3 * DAY + 500, DAY, MIN)).toBe(432_000n);
  });

  it('reaches a $1 buy after 7 days at ₦200/day', () => {
    expect(settledAllowance(base, base.lastCheckpointTs + 6 * DAY, DAY, MIN) < MIN).toBe(true);
    expect(settledAllowance(base, base.lastCheckpointTs + 7 * DAY, DAY, MIN) >= MIN).toBe(true);
  });

  it('caps at 2 × max(rate, min_trade) after a long idle period', () => {
    expect(settledAllowance(base, base.lastCheckpointTs + 365 * DAY, DAY, MIN)).toBe(2n * MIN);
    const fast = { ...base, ratePerPeriod: 5_000_000n };
    expect(settledAllowance(fast, fast.lastCheckpointTs + 365 * DAY, DAY, MIN)).toBe(10_000_000n);
  });

  it('does not accrue while paused', () => {
    const paused = { ...base, allowance: 50n, paused: true };
    expect(settledAllowance(paused, paused.lastCheckpointTs + 30 * DAY, DAY, MIN)).toBe(50n);
  });

  it('adds to an existing stored allowance', () => {
    const v = { ...base, allowance: 900_000n };
    expect(settledAllowance(v, v.lastCheckpointTs + DAY, DAY, MIN)).toBe(1_044_000n);
  });
});
