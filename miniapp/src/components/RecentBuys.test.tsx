import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RecentBuy } from '../api';
import { RecentBuys } from './RecentBuys';

const NOW = new Date('2026-11-06T12:00:00.000Z').getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('RecentBuys', () => {
  it('hides when there are no buys', () => {
    const { container } = render(<RecentBuys buys={[]} currency="USD" ngnPerUsd={1385} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
    const { container: c2 } = render(<RecentBuys buys={undefined} currency="USD" ngnPerUsd={1385} now={NOW} />);
    expect(c2).toBeEmptyDOMElement();
  });

  it('shows one buy with relative time', () => {
    const buys: RecentBuy[] = [{ symbol: 'AAPLx', usdcIn: 1.05, at: ago(3 * 60_000) }];
    render(<RecentBuys buys={buys} currency="USD" ngnPerUsd={1385} now={NOW} />);
    expect(screen.getByRole('listitem').textContent).toContain('$1.05 of Apple · 3 min ago');
  });

  it('shows five buys newest first and no more', () => {
    const buys: RecentBuy[] = Array.from({ length: 6 }, (_, i) => ({
      symbol: 'SPYx' as const,
      usdcIn: 1 + i,
      at: ago((i + 1) * 3_600_000),
    }));
    render(<RecentBuys buys={buys} currency="USD" ngnPerUsd={1385} now={NOW} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toContain('$1.00');
    expect(items[0].textContent).toContain('1 hr ago');
  });

  it('formats hours, days, and plain dates past a week', () => {
    const buys: RecentBuy[] = [
      { symbol: 'NVDAx', usdcIn: 2, at: ago(5 * 3_600_000) },
      { symbol: 'NVDAx', usdcIn: 2, at: ago(2 * 86_400_000) },
      { symbol: 'NVDAx', usdcIn: 2, at: ago(20 * 86_400_000) },
    ];
    render(<RecentBuys buys={buys} currency="USD" ngnPerUsd={1385} now={NOW} />);
    expect(screen.getByText(/5 hr ago/)).toBeInTheDocument();
    expect(screen.getByText(/2 days ago/)).toBeInTheDocument();
    expect(screen.getByText(/17 Oct 2026/)).toBeInTheDocument();
  });

  it('shows naira amounts in NGN', () => {
    const buys: RecentBuy[] = [{ symbol: 'AAPLx', usdcIn: 1.05, at: ago(60_000) }];
    render(<RecentBuys buys={buys} currency="NGN" ngnPerUsd={1385} now={NOW} />);
    expect(screen.getByRole('listitem').textContent).toContain('₦1,454 of Apple · 1 min ago');
  });

  it("converts at today's rate, not a buy-day rate", () => {
    // Same buy, two different current rates: the naira figure must follow
    // the rate passed in today (1.05 x 1000 vs 1.05 x 2000).
    const buys: RecentBuy[] = [{ symbol: 'AAPLx', usdcIn: 1.05, at: ago(60_000) }];
    const { rerender } = render(
      <RecentBuys buys={buys} currency="NGN" ngnPerUsd={1000} now={NOW} />,
    );
    expect(screen.getByRole('listitem').textContent).toContain('₦1,050');
    rerender(<RecentBuys buys={buys} currency="NGN" ngnPerUsd={2000} now={NOW} />);
    expect(screen.getByRole('listitem').textContent).toContain('₦2,100');
  });
});
