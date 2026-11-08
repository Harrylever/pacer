import { Inject, Injectable, Optional } from '@nestjs/common';

export const HISTORY_DIR = 'HISTORY_DIR';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PAST_PERFORMANCE_LABEL =
  'Past performance. Not a prediction or a promise.';

export interface AssetResult {
  endNgn: number;
  maxDrawdownPct: number;
}
export interface HistoryComparison {
  disclaimer: string;
  ngnPerUsd: number;
  /** Last month in `series` (e.g. "2026-10"): the "as of" date for the screen. */
  asOf: string;
  months: number;
  series: { month: string; naira: number; usdc: number; sp500: number }[];
  naira: AssetResult;
  usdc: AssetResult;
  sp500: AssetResult;
  apple: AssetResult;
  nvidia: AssetResult;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    // Source URLs contain no commas in our shipped files' numeric prefix;
    // split only the first (headers.length - 2) commas, keep rest joined.
    const parts = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] =
        i < headers.length - 1 ? (parts[i] ?? '') : parts.slice(i).join(',');
    });
    return row;
  });
}

function drawdownPct(series: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of series) {
    peak = Math.max(peak, v);
    if (peak > 0) worst = Math.min(worst, (v - peak) / peak);
  }
  return Math.abs(worst) * 100;
}

@Injectable()
export class HistoryService {
  private fx: { month: string; ngnPerUsd: number }[];
  private stocks: {
    month: string;
    spy: number;
    aapl: number;
    nvda: number;
  }[];

  constructor(
    @Optional() @Inject(HISTORY_DIR) historyDir?: string,
  ) {
    const dir =
      historyDir ||
      process.env.HISTORY_DIR || // blank in .env means "use the default"
      join(__dirname, '..', '..', '..', 'data', 'history');
    const fxRows = parseCsv(
      readFileSync(join(dir, 'ngn_usd_monthly.csv'), 'utf8'),
    );
    const stockRows = parseCsv(
      readFileSync(join(dir, 'us_stocks_monthly.csv'), 'utf8'),
    );
    this.fx = fxRows.map((r) => ({
      month: r.month,
      ngnPerUsd: Number(r.ngn_per_usd),
    }));
    const stockByMonth = new Map(
      stockRows.map((r) => [
        r.month,
        {
          month: r.month,
          spy: Number(r.spy_adj_close),
          aapl: Number(r.aapl_adj_close),
          nvda: Number(r.nvda_adj_close),
        },
      ]),
    );
    this.stocks = this.fx
      .map((f) => stockByMonth.get(f.month))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    if (this.fx.length === 0 || this.stocks.length === 0)
      throw new Error('history CSVs are empty');
  }

  /** Latest parallel-market rate shipped in the CSVs (display only). */
  latestNgnPerUsd(): number {
    return this.fx[this.fx.length - 1].ngnPerUsd;
  }

  compareLumpSum(args: { amountNgn: number }): HistoryComparison {
    const n = this.stocks.length;
    const fx0 = this.fx[0].ngnPerUsd;
    const usd0 = args.amountNgn / fx0;
    const path = (key: 'spy' | 'aapl' | 'nvda') =>
      this.stocks.map(
        (s, i) => usd0 * (s[key] / this.stocks[0][key]) * this.fx[i].ngnPerUsd,
      );
    const usdcPath = this.fx.map((f) => usd0 * f.ngnPerUsd);
    const sp = path('spy');
    const result = (series: number[]): AssetResult => ({
      endNgn: Math.round(series[series.length - 1]),
      maxDrawdownPct: drawdownPct(series),
    });
    return {
      disclaimer: PAST_PERFORMANCE_LABEL,
      ngnPerUsd: this.latestNgnPerUsd(),
      asOf: this.stocks[n - 1].month,
      months: n,
      series: this.stocks.map((s, i) => ({
        month: s.month,
        naira: args.amountNgn,
        usdc: usdcPath[i],
        sp500: sp[i],
      })),
      naira: { endNgn: args.amountNgn, maxDrawdownPct: 0 },
      usdc: result(usdcPath),
      sp500: result(sp),
      apple: result(path('aapl')),
      nvidia: result(path('nvda')),
    };
  }

  /**
   * Daily-buy path over the last `months` months.
   * Rule: one month = 30 days, so each month buys `dailyNgn * 30` worth
   * and the total invested is `dailyNgn * 30 * months`. Data is monthly,
   * so each month's buy happens at that month's price and FX rate; the
   * series is the cumulative value of everything bought so far, valued
   * at that month's price/FX, so its last point is each asset's endNgn.
   */
  compareDaily(args: { dailyNgn: number; months: number }): HistoryComparison {
    const months = Math.max(
      1,
      Math.min(Math.floor(args.months) || 1, this.stocks.length),
    );
    const start = this.stocks.length - months;
    const monthlyNgn = args.dailyNgn * 30; // rule: 30 days per month
    let usdcUnits = 0;
    let spyUnits = 0;
    let aaplUnits = 0;
    let nvdaUnits = 0;
    const series: HistoryComparison['series'] = [];
    const usdcPath: number[] = [];
    const spyPath: number[] = [];
    const aaplPath: number[] = [];
    const nvdaPath: number[] = [];
    for (let i = start; i < this.stocks.length; i++) {
      const usd = monthlyNgn / this.fx[i].ngnPerUsd;
      usdcUnits += usd;
      spyUnits += usd / this.stocks[i].spy;
      aaplUnits += usd / this.stocks[i].aapl;
      nvdaUnits += usd / this.stocks[i].nvda;
      const fx = this.fx[i].ngnPerUsd;
      const row = {
        month: this.stocks[i].month,
        naira: monthlyNgn * (i - start + 1),
        usdc: usdcUnits * fx,
        sp500: spyUnits * this.stocks[i].spy * fx,
      };
      series.push(row);
      usdcPath.push(row.usdc);
      spyPath.push(row.sp500);
      aaplPath.push(aaplUnits * this.stocks[i].aapl * fx);
      nvdaPath.push(nvdaUnits * this.stocks[i].nvda * fx);
    }
    const invested = monthlyNgn * months;
    const end = (path: number[]): AssetResult => ({
      endNgn: Math.round(path[path.length - 1]),
      maxDrawdownPct: drawdownPct(path),
    });
    return {
      disclaimer: PAST_PERFORMANCE_LABEL,
      ngnPerUsd: this.latestNgnPerUsd(),
      asOf: series[series.length - 1].month,
      months,
      series,
      naira: { endNgn: invested, maxDrawdownPct: 0 },
      usdc: end(usdcPath),
      sp500: end(spyPath),
      apple: end(aaplPath),
      nvidia: end(nvdaPath),
    };
  }
}
