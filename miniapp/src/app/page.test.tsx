import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './page';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubComparison() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          disclaimer: 'Past performance. Not a prediction or a promise.',
          ngnPerUsd: 1385,
          asOf: '2026-10',
          months: 61,
          series: [
            { month: '2021-10', naira: 20000, usdc: 20000, sp500: 20000 },
            { month: '2026-10', naira: 20000, usdc: 49027, sp500: 86256 },
          ],
          naira: { endNgn: 20000, maxDrawdownPct: 0 },
          usdc: { endNgn: 49027, maxDrawdownPct: 22.4 },
          sp500: { endNgn: 86256, maxDrawdownPct: 19.8 },
          apple: { endNgn: 74113, maxDrawdownPct: 31.2 },
          nvidia: { endNgn: 502481, maxDrawdownPct: 52.8 },
        }),
        { status: 200 },
      ),
    ),
  );
}

describe('page', () => {
  it('renders Pacer with the comparison behind a toggle', async () => {
    stubComparison();
    render(<Page />);
    expect(screen.getByRole('heading', { name: 'Pacer' })).toBeInTheDocument();
    expect(
      await screen.findByText('What ₦20,000 would have become'),
    ).toBeInTheDocument();
  });

  it('outside Telegram the holdings section stays calm', async () => {
    stubComparison();
    render(<Page />);
    await waitFor(() =>
      expect(
        screen.getByText('Open this from the bot to see your holdings.'),
      ).toBeInTheDocument(),
    );
  });

  it('toggles the figures between NGN and USD using ngnPerUsd from the backend', async () => {
    stubComparison();
    render(<Page />);
    const rows = await screen.findAllByTestId('asset-row');
    expect(rows[1].textContent).toContain('₦49,027');
    await userEvent.click(screen.getByRole('button', { name: '$ USD' }));
    // 49,027 / 1,385 (the B1 rate) = $35.40.
    expect(rows[1].textContent).toContain('$35.40');
    await userEvent.click(screen.getByRole('button', { name: '₦ NGN' }));
    expect(rows[1].textContent).toContain('₦49,027');
  });

  it('offers the ₦20,000 comparison only, until the backend daily data is coherent', async () => {
    stubComparison();
    render(<Page />);
    await screen.findByText('What ₦20,000 would have become');
    expect(
      screen.queryByRole('button', { name: /₦200 a day/ }),
    ).not.toBeInTheDocument();
  });
});
