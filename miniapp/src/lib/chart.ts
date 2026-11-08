// Copied from ../lander/lib/chart.ts and adapted to the API series shape
// (Pacer Mini App round 2, M3). Geometry only: the figures come from the backend.

export type SeriesKey = 'naira' | 'usdc' | 'sp500';
export type ChartMonth = { month: string; naira: number; usdc: number; sp500: number };

const r1 = (v: number) => String(Math.round(v * 10) / 10);

export type ChartSize = { width: number; height: number; pad: number };

/**
 * Geometry for the three-line chart. The y axis runs from 0 to the largest
 * value across the series, rounded up to the next ₦10,000.
 */
export function chartGeometry(months: ChartMonth[], size: ChartSize) {
  const { width, height, pad } = size;
  const count = months.length;
  const largest = Math.max(...months.flatMap((m) => [m.naira, m.usdc, m.sp500]));
  const maxNgn = Math.ceil(largest / 10_000) * 10_000;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (count - 1);
  const y = (ngn: number) => height - pad - (ngn / maxNgn) * (height - 2 * pad);

  const paths = {} as Record<SeriesKey, string>;
  for (const key of ['naira', 'usdc', 'sp500'] as const) {
    paths[key] = months
      .map((m, i) => `${i === 0 ? 'M' : 'L'}${r1(x(i))} ${r1(y(m[key]))}`)
      .join('');
  }
  return { x, y, paths, maxNgn };
}

/** The month under a pointer, clamped to the first and last month. */
export function indexFromPointer(px: number, width: number, pad: number, count: number): number {
  if (Number.isNaN(px)) return count - 1;
  const fraction = (px - pad) / (width - 2 * pad);
  return Math.min(count - 1, Math.max(0, Math.round(fraction * (count - 1))));
}

/** The month a key press moves to; any other key leaves it where it is. */
export function stepIndex(key: string, current: number, count: number): number {
  const clamp = (i: number) => Math.min(count - 1, Math.max(0, i));
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return clamp(current - 1);
    case 'ArrowRight':
    case 'ArrowUp':
      return clamp(current + 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return current;
  }
}
