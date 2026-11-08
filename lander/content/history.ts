import snapshot from "./history.json";

export type SeriesKey = "naira" | "usdc" | "sp500";

export type Month = {
  month: string;
  naira: number;
  usdc: number;
  sp500: number;
};

type Result = { endNgn: number; maxDrawdownPct: number };

/**
 * The real comparison from the Mini App's test snapshot: ₦20,000 put in at
 * the end of Oct 2021 and valued month by month to Oct 2026 (61 months).
 * The page never calls the backend; this file is the only source of figures.
 */
export const history: {
  months: Month[];
  results: Record<SeriesKey, Result>;
  disclaimer: string;
  source: string;
} = {
  months: snapshot.series,
  results: {
    naira: snapshot.naira,
    usdc: snapshot.usdc,
    sp500: snapshot.sp500,
  },
  disclaimer: snapshot.disclaimer,
  source:
    "NGN/USD: parallel-market rate from news reports (Nairametrics and others). S&P 500 with dividends reinvested.",
};
