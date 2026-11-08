import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockHoldings } from '../api';
import { Holdings } from './Holdings';

describe('Holdings', () => {
  it('renders priced holdings with put-in and change', () => {
    render(
      <Holdings summary={mockHoldings} currency="NGN" loading={false} />,
    );
    expect(screen.getByText('SPYx')).toBeInTheDocument();
    expect(screen.getByText(/Put in so far/)).toBeInTheDocument();
    expect(screen.getByText(/Change since the start/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting to be invested/)).toBeInTheDocument();
  });

  it('marks unpriced lines without guessing', () => {
    const summary = {
      ...mockHoldings,
      totalValueUsd: null,
      holdings: mockHoldings.holdings.map((h) =>
        h.symbol === 'SPYx'
          ? { ...h, valueUsd: null, priced: false }
          : h,
      ),
    };
    render(<Holdings summary={summary} currency="NGN" loading={false} />);
    expect(screen.getAllByText('price unavailable').length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByText(/Change since the start/)).toBeInTheDocument();
  });

  it('shows an empty vault calmly', () => {
    render(<Holdings summary={null} currency="NGN" loading={false} />);
    expect(screen.getByText(/vault is empty/)).toBeInTheDocument();
  });

  it('switches display currency with the rate caption', () => {
    const { rerender } = render(
      <Holdings summary={mockHoldings} currency="NGN" loading={false} />,
    );
    expect(screen.getByText(/market rate/)).toBeInTheDocument();
    rerender(
      <Holdings summary={mockHoldings} currency="USD" loading={false} />,
    );
    expect(screen.queryByText(/market rate/)).toBeNull();
    expect(screen.getByText('$12.40')).toBeInTheDocument();
  });

  it('change since the start excludes cash still waiting to be invested', () => {
    // Stocks are worth 10.90 against 10.00 put in: +0.90. The 1.50 of waiting
    // USDC is in the total but must not count as a gain.
    render(
      <Holdings summary={mockHoldings} currency="USD" loading={false} />,
    );
    expect(screen.getByText(/▲ \+\$0\.90/)).toBeInTheDocument();
  });

  it('idle cash alone is no change', () => {
    const summary = {
      ...mockHoldings,
      totalValueUsd: 11.5,
      putInUsd: 10,
      waitingUsdc: 1.5,
      holdings: [
        { symbol: 'USDC' as const, uiAmount: 1.5, valueUsd: 1.5, priced: true },
        { symbol: 'SPYx' as const, uiAmount: 0.01, valueUsd: 10, priced: true },
      ],
    };
    render(<Holdings summary={summary} currency="USD" loading={false} />);
    expect(screen.getByText(/^\$0\.00/)).toBeInTheDocument();
  });

  it('shows a loss with a minus sign and a down arrow', () => {
    const summary = { ...mockHoldings, totalValueUsd: 10.5, putInUsd: 10 };
    render(<Holdings summary={summary} currency="USD" loading={false} />);
    expect(screen.getByText(/▼ −\$1\.00/)).toBeInTheDocument();
  });

  it('shows the total large with the dollar figure underneath in NGN', () => {
    render(<Holdings summary={mockHoldings} currency="NGN" loading={false} />);
    // 12.4 USD at ₦1,385/$ = ₦17,174, with $12.40 underneath.
    expect(screen.getByText('₦17,174')).toBeInTheDocument();
    expect(screen.getByText('$12.40')).toBeInTheDocument();
  });

  it('waiting to be invested follows the display currency', () => {
    // 1.5 USDC waiting at ₦1,385/$ = ₦2,078 with $1.50 underneath in NGN.
    const { rerender } = render(
      <Holdings summary={mockHoldings} currency="NGN" loading={false} />,
    );
    const waiting = screen.getByText(/Waiting to be invested/);
    expect(waiting.textContent).toContain('₦2,078');
    expect(waiting.textContent).toContain('$1.50');
    rerender(<Holdings summary={mockHoldings} currency="USD" loading={false} />);
    expect(screen.getByText(/Waiting to be invested/).textContent).toContain('$1.50');
    expect(screen.getByText(/Waiting to be invested/).textContent).not.toContain('USDC');
  });

  it('names each line with its ticker, name, amount and value', () => {
    render(<Holdings summary={mockHoldings} currency="USD" loading={false} />);
    expect(screen.getByText('SPYx')).toBeInTheDocument();
    expect(screen.getByText(/S&P 500 · 0\.011/)).toBeInTheDocument();
    expect(screen.getByText('$8.40')).toBeInTheDocument();
  });
});
