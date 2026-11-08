import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockComparison, type HistoryComparison } from '../api';
import realLump from '../__fixtures__/compare-lump.json';
import { Comparison } from './Comparison';

const data = mockComparison('lump');

describe('Comparison', () => {
  it('renders the ₦20,000 fixture figures and the exact disclaimer', () => {
    render(<Comparison data={data} currency="NGN" ngnPerUsd={1385} />);
    const rows = screen.getAllByTestId('asset-row');
    expect(within(rows[0]).getByText(/₦20,000/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/₦49,027/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/22\.4%/)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/₦86,256/)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/19\.8%/)).toBeInTheDocument();
    expect(screen.getByText('Past performance. Not a prediction or a promise.')).toBeInTheDocument();
  });

  it('shows Apple and Nvidia result rows with their worst drops', () => {
    render(<Comparison data={data} currency="NGN" ngnPerUsd={1385} />);
    const rows = screen.getAllByTestId('asset-row');
    expect(rows.length).toBe(5);
    expect(within(rows[3]).getByText(/In Apple/)).toBeInTheDocument();
    expect(within(rows[3]).getByText(/₦115,639/)).toBeInTheDocument();
    expect(within(rows[3]).getByText(/▼ −26\.3%/)).toBeInTheDocument();
    expect(within(rows[4]).getByText(/In Nvidia/)).toBeInTheDocument();
    expect(within(rows[4]).getByText(/₦394,140/)).toBeInTheDocument();
    expect(within(rows[4]).getByText(/▼ −51\.2%/)).toBeInTheDocument();
  });

  it('shows a worst drop next to every gain, with no arrow on the row that never dropped', () => {
    render(<Comparison data={data} currency="NGN" ngnPerUsd={1385} />);
    const rows = screen.getAllByTestId('asset-row');
    expect(rows.length).toBe(5);
    for (const row of rows) {
      expect(within(row).getByText(/Worst drop/)).toBeInTheDocument();
      expect(within(row).getByText(/\d+\.\d%|0%/)).toBeInTheDocument();
    }
    // Naira never dropped: "0%" and no arrow (AGENTS.md rule 3).
    expect(within(rows[0]).getByText('0%')).toBeInTheDocument();
    expect(within(rows[0]).queryByText(/▼/)).toBeNull();
    expect(within(rows[1]).getByText(/▼ −22\.4%/)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/▼ −19\.8%/)).toBeInTheDocument();
  });

  it('renders the real backend response (captured Nov 5, 2026) with the §9 figures', () => {
    const real = realLump as unknown as HistoryComparison;
    render(<Comparison data={real} currency="NGN" ngnPerUsd={1385} />);
    const rows = screen.getAllByTestId('asset-row');
    expect(within(rows[1]).getByText(/₦49,027/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/▼ −22\.4%/)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/₦86,256/)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/▼ −19\.8%/)).toBeInTheDocument();
    expect(screen.getByText(real.disclaimer)).toBeInTheDocument();
  });

  it('keeps a hidden data table with the monthly figures', () => {
    render(<Comparison data={data} currency="NGN" ngnPerUsd={1385} />);
    const table = screen.getByRole('table', { hidden: true });
    expect(within(table).getByText('Oct 2021')).toBeInTheDocument();
    expect(within(table).getByText('Oct 2026')).toBeInTheDocument();
  });

  it('scrubs with the arrow keys', () => {
    render(<Comparison data={data} currency="NGN" ngnPerUsd={1385} />);
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuenow')).toBe('60');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(slider.getAttribute('aria-valuenow')).toBe('59');
    expect(slider.getAttribute('aria-valuetext')).toContain('Sep 2026');
    fireEvent.keyDown(slider, { key: 'Home' });
    expect(slider.getAttribute('aria-valuenow')).toBe('0');
  });

  it('shows dollar figures when the display currency is USD', () => {
    render(<Comparison data={data} currency="USD" ngnPerUsd={1385} />);
    // 49,027 / 1,385 = $35.40 at the final month.
    expect(screen.getByText('$35.40')).toBeInTheDocument();
  });

  it('hides the data table inside a wrapper, so it can never widen the page', () => {
    // A table ignores the 1px width of .sr-only; on a 360px phone the page
    // scrolled sideways to 470px until the wrapper took the class instead.
    const { container } = render(
      <Comparison data={realLump as HistoryComparison} currency="NGN" ngnPerUsd={1385} />,
    );
    expect(container.querySelector('div.sr-only > table')).not.toBeNull();
    expect(container.querySelector('table.sr-only')).toBeNull();
  });
});
