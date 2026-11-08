/**
 * The one place that knows the backend's shapes. Everything visual reads
 * through here. Switch to the mock with `?mock=1` (or NEXT_PUBLIC_MOCK=1).
 */
import compareLumpFixture from './__fixtures__/compare-lump.json';

export interface AssetResult {
  endNgn: number;
  maxDrawdownPct: number;
}

export interface HistoryComparison {
  disclaimer: string;
  /** Latest parallel-market rate from the backend (B1); absent in old fixtures. */
  ngnPerUsd?: number;
  /** Last month in series, e.g. "2026-10" (B1); absent in old fixtures. */
  asOf?: string;
  months: number;
  series: { month: string; naira: number; usdc: number; sp500: number }[];
  naira: AssetResult;
  usdc: AssetResult;
  sp500: AssetResult;
  apple: AssetResult;
  nvidia: AssetResult;
}

export type DisplayCurrency = 'NGN' | 'USD';

export interface HoldingLine {
  symbol: 'USDC' | 'SPYx' | 'AAPLx' | 'NVDAx';
  uiAmount: number;
  valueUsd: number | null;
  priced: boolean;
}

export type StockSymbol = 'SPYx' | 'AAPLx' | 'NVDAx';

/** The vault's rules, read live from Solana by the backend (B2). */
export interface VaultRules {
  address: string;
  explorerUrl: string;
  withdrawalAddress: string;
  paceUsdPerPeriod: number;
  periodSeconds: number;
  stocks: StockSymbol[];
  paused: boolean;
}

export interface RecentBuy {
  symbol: StockSymbol;
  usdcIn: number;
  at: string;
}

/** Built by the backend team after this round (brief §"What the backend still owes you"). */
export interface HoldingsSummary {
  displayCurrency: DisplayCurrency;
  ngnPerUsd: number;
  totalValueUsd: number | null;
  putInUsd: number;
  waitingUsdc: number;
  holdings: HoldingLine[];
  /** Null when the user has no vault yet (B2); absent from older backends. */
  vault?: VaultRules | null;
  recentBuys?: RecentBuy[];
}

export type ApiErrorKind = 'unauthorized' | 'not-found' | 'network' | 'server';

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = 'ApiError';
  }
}

export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
}

export function useMock(): boolean {
  if (process.env.NEXT_PUBLIC_MOCK === '1') return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('mock');
}

async function getJson(path: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, init);
  } catch {
    throw new ApiError('network', 'Could not reach the server.');
  }
  if (res.status === 401)
    throw new ApiError('unauthorized', 'Open this from the bot.');
  if (res.status === 404)
    throw new ApiError('not-found', 'Nothing here yet.');
  if (!res.ok) throw new ApiError('server', 'Something went wrong.');
  return res.json();
}

export async function fetchComparison(
  mode: 'lump' | 'daily',
): Promise<HistoryComparison> {
  if (useMock()) {
    await new Promise((r) => setTimeout(r, 10));
    return mockComparison(mode);
  }
  const path =
    mode === 'lump'
      ? '/history/compare?amountNgn=20000'
      : '/history/compare?dailyNgn=200&months=12';
  const body = (await getJson(path)) as HistoryComparison;
  if (!body?.disclaimer || !Array.isArray(body.series))
    throw new ApiError('server', 'Unexpected response.');
  return body;
}

export async function fetchHoldings(
  initData: string | null,
): Promise<HoldingsSummary> {
  // The mock is an explicit preview (?mock=1): it needs no Telegram, so a
  // browser preview shows the sample vault as the README promises.
  if (useMock()) {
    await new Promise((r) => setTimeout(r, 10));
    return mockHoldings;
  }
  if (!initData) throw new ApiError('unauthorized', 'Open this from the bot.');
  const body = (await getJson('/vaults/me/holdings', {
    headers: { 'x-telegram-init-data': initData },
  })) as HoldingsSummary;
  if (!Array.isArray(body?.holdings))
    throw new ApiError('server', 'Unexpected response.');
  return body;
}

/** Calm UI copy for each failure; never a stack trace. */
export function calmMessage(kind: ApiErrorKind): string {
  switch (kind) {
    case 'unauthorized':
      return 'Open this from the bot to see your holdings.';
    case 'not-found':
      return 'Nothing here yet — your vault is still being set up.';
    case 'network':
      return 'Could not reach the server. Check your connection and try again.';
    case 'server':
      return 'Something went wrong loading this. Please try again.';
  }
}

/**
 * §9 figures the screen must match: end values with worst drops.
 * The series is the real backend response captured in
 * src/__fixtures__/compare-lump.json, so the mock chart rises and falls
 * like the live one (USDC peaks in 2024, then falls back as the naira
 * recovers; the S&P 500 dips in 2022) instead of three straight lines.
 */
export function mockComparison(mode: 'lump' | 'daily'): HistoryComparison {
  void mode; // the daily view stays hidden; both modes serve the lump sum
  const fixture = compareLumpFixture as unknown as HistoryComparison;
  return { ...fixture, ngnPerUsd: 1385, asOf: '2026-10' };
}

export const mockHoldings: HoldingsSummary = {
  displayCurrency: 'NGN',
  ngnPerUsd: 1385,
  totalValueUsd: 12.4,
  putInUsd: 10,
  waitingUsdc: 1.5,
  holdings: [
    { symbol: 'USDC', uiAmount: 1.5, valueUsd: 1.5, priced: true },
    { symbol: 'SPYx', uiAmount: 0.011, valueUsd: 8.4, priced: true },
    { symbol: 'AAPLx', uiAmount: 0.0074, valueUsd: 2.5, priced: true },
  ],
  vault: {
    address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    explorerUrl:
      'https://explorer.solana.com/address/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU?cluster=devnet',
    withdrawalAddress: '9fQpLm3N8sTuVwXyZ1aBcDeFgHiJkLmNoPqRsTuVwX',
    paceUsdPerPeriod: 1.05,
    periodSeconds: 10,
    stocks: ['SPYx', 'AAPLx'],
    paused: false,
  },
  recentBuys: [
    { symbol: 'AAPLx', usdcIn: 1.05, at: new Date(Date.now() - 3 * 60_000).toISOString() },
    { symbol: 'SPYx', usdcIn: 1.05, at: new Date(Date.now() - 26 * 3_600_000).toISOString() },
  ],
};
