/** SPEC slippage floor, mirrored in bigint (Rust u128 equivalent). */
export function slippageFloor(args: {
  usdcIn: bigint;
  priceMicroUsdc: bigint;
  stockDecimals: number;
  maxSlippageBps: number;
}): bigint {
  if (args.priceMicroUsdc <= 0n) return 0n;
  const scale = 10n ** BigInt(args.stockDecimals);
  const quotedOut = (args.usdcIn * scale) / args.priceMicroUsdc;
  if (quotedOut === 0n) return 0n;
  return (quotedOut * BigInt(10_000 - args.maxSlippageBps)) / 10_000n;
}

/** ScaledUiAmount display: raw / 10^decimals * multiplier. Vault maths stays raw. */
export function toUiAmount(
  raw: bigint,
  decimals: number,
  multiplier = 1,
): number {
  return (Number(raw) / 10 ** decimals) * multiplier;
}

export type DisplayCurrency = 'NGN' | 'USD';

export function formatMoney(
  usd: number,
  displayCurrency: DisplayCurrency,
  ngnPerUsd: number,
): string {
  const usdPart = `$${usd.toFixed(2)}`;
  if (displayCurrency === 'USD') return usdPart;
  const ngn = Math.round(usd * ngnPerUsd).toLocaleString('en-NG');
  return `₦${ngn} (${usdPart})`;
}
