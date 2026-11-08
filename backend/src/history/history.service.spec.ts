import { HistoryService } from './history.service';

describe('HistoryService lump sum (₦20k, Oct 2021 → Oct 2026)', () => {
  const svc = new HistoryService();

  it('matches the CSV README check values within tolerance', () => {
    const r = svc.compareLumpSum({ amountNgn: 20_000 });
    expect(r.usdc.endNgn).toBeGreaterThan(49_027 * 0.985);
    expect(r.usdc.endNgn).toBeLessThan(49_027 * 1.015);
    expect(r.sp500.endNgn).toBeGreaterThan(86_256 * 0.985);
    expect(r.sp500.endNgn).toBeLessThan(86_256 * 1.015);
    expect(r.naira.endNgn).toBe(20_000);
  });

  it('reports the S&P worst drawdown in naira terms (~19.8%)', () => {
    const r = svc.compareLumpSum({ amountNgn: 20_000 });
    expect(r.sp500.maxDrawdownPct).toBeGreaterThan(18.3);
    expect(r.sp500.maxDrawdownPct).toBeLessThan(21.3);
  });

  it('exposes ngnPerUsd and asOf for amountNgn=20000', () => {
    const r = svc.compareLumpSum({ amountNgn: 20_000 });
    expect(r.ngnPerUsd).toBe(svc.latestNgnPerUsd());
    expect(r.ngnPerUsd).toBe(1385);
    expect(r.asOf).toBe('2026-10');
    expect(r.asOf).toBe(r.series[r.series.length - 1].month);
  });

  it('labels everything as past performance', () => {
    const r = svc.compareLumpSum({ amountNgn: 20_000 });
    expect(r.disclaimer).toBe(
      'Past performance. Not a prediction or a promise.',
    );
    expect(r.series.length).toBe(61);
  });
});

describe('HistoryService daily path', () => {
  it('invests dailyNgn x 30 days x months (₦200 x 30 x 12 = ₦72,000)', () => {
    const r = new HistoryService().compareDaily({ dailyNgn: 200, months: 12 });
    expect(r.naira.endNgn).toBe(72_000);
    expect(r.series).toHaveLength(12);
    expect(r.series[r.series.length - 1].naira).toBe(72_000);
  });

  it('series ends at each asset endNgn', () => {
    const r = new HistoryService().compareDaily({ dailyNgn: 200, months: 12 });
    const last = r.series[r.series.length - 1];
    expect(Math.round(last.usdc)).toBe(r.usdc.endNgn);
    expect(Math.round(last.sp500)).toBe(r.sp500.endNgn);
  });

  it('computes drawdowns (not 0) over a window where assets fell', () => {
    const r = new HistoryService().compareDaily({ dailyNgn: 200, months: 61 });
    expect(r.sp500.maxDrawdownPct).toBeGreaterThan(0);
    expect(r.usdc.maxDrawdownPct).toBeGreaterThan(0);
  });

  it('exposes ngnPerUsd on both modes', () => {
    const svc = new HistoryService();
    expect(svc.compareDaily({ dailyNgn: 200, months: 12 }).ngnPerUsd).toBe(
      svc.latestNgnPerUsd(),
    );
    expect(svc.compareLumpSum({ amountNgn: 20_000 }).ngnPerUsd).toBe(
      svc.latestNgnPerUsd(),
    );
  });

  it('leaves the lump-sum figures unchanged', () => {
    const r = new HistoryService().compareLumpSum({ amountNgn: 20_000 });
    expect(r.usdc.endNgn).toBe(49_027);
    expect(r.sp500.endNgn).toBe(86_256);
    expect(r.usdc.maxDrawdownPct).toBeCloseTo(22.4, 0);
    expect(r.sp500.maxDrawdownPct).toBeCloseTo(19.8, 0);
  });
});
