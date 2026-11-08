import type { DisplayCurrency } from './api';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "2026-10" becomes "Oct 2026" (from ../lander/lib/format.ts). */
export function formatMonth(month: string): string {
  const [year, m] = month.split('-');
  return `${MONTHS[Number(m) - 1]} ${year}`;
}

/** ₦13,850 — no decimals, thousands separators, tabular figures via CSS. */
export function formatNGN(naira: number): string {
  const r = Math.round(naira);
  return `${r < 0 ? '−' : ''}₦${Math.abs(r).toLocaleString('en-NG')}`;
}

/** $10.00 — always two decimals. */
export function formatUSD(usd: number): string {
  const fixed = Math.abs(usd).toFixed(2);
  return `${usd < 0 && fixed !== '0.00' ? '−' : ''}$${fixed}`;
}

/** "6 Nov 2026" for a plain date. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * "3 min ago" under a week; a plain date past that. No library.
 * Future timestamps (clock skew) read as "just now".
 */
export function formatRelativeTime(iso: string, nowMs: number): string {
  const seconds = Math.floor((nowMs - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return formatDate(iso);
}

/** "7xKX…9fQp": first and last four characters of a long address. */
export function shortenAddress(address: string): string {
  return address.length > 8 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

/**
 * NGN first with USD underneath (primary line + sub line), USD alone
 * when the display currency is USD. Rates are the parallel-market rate.
 */
export function formatDisplay(
  usd: number,
  currency: DisplayCurrency,
  ngnPerUsd: number,
): { primary: string; sub?: string } {
  if (currency === 'USD') return { primary: formatUSD(usd) };
  return { primary: formatNGN(usd * ngnPerUsd), sub: formatUSD(usd) };
}
