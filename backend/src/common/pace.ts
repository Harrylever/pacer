import type { VaultState } from '../solana/vault-client';

/**
 * Off-chain mirror of the vault program's `settle(now)` (SPEC "Pace math").
 *
 * The on-chain `allowance` field only grows when `settle` runs, which happens
 * inside `buy` and `set_rules`. Reading the stored field directly therefore
 * shows 0 for a fresh vault forever, and the keeper would never trigger.
 * The keeper uses this view instead; the program still re-settles and
 * enforces every limit when the buy lands.
 */
export function settledAllowance(
  vault: Pick<
    VaultState,
    'allowance' | 'ratePerPeriod' | 'lastCheckpointTs' | 'paused'
  >,
  now: number,
  periodSeconds: number,
  minTrade: bigint,
): bigint {
  if (vault.paused || periodSeconds <= 0) return vault.allowance;
  const elapsed = Math.max(0, now - vault.lastCheckpointTs);
  const periods = BigInt(Math.floor(elapsed / periodSeconds));
  const accrued = vault.allowance + vault.ratePerPeriod * periods;
  const base = vault.ratePerPeriod > minTrade ? vault.ratePerPeriod : minTrade;
  const cap = 2n * base;
  return accrued < cap ? accrued : cap;
}
