import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DisplayCurrency } from '../api';
import { Header } from './Header';

function Harness({ onChange }: { onChange?: (c: DisplayCurrency) => void }) {
  const [currency, setCurrency] = useState<DisplayCurrency>('NGN');
  return (
    <Header
      currency={currency}
      onCurrencyChange={(c) => {
        setCurrency(c);
        onChange?.(c);
      }}
    />
  );
}

describe('Header', () => {
  it('shows the Pacer wordmark and a pressed NGN segment by default', () => {
    render(<Harness />);
    expect(screen.getByRole('heading', { name: 'Pacer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '₦ NGN' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '$ USD' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('toggles the display currency', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '$ USD' }));
    expect(onChange).toHaveBeenCalledWith('USD');
    expect(screen.getByRole('button', { name: '$ USD' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '₦ NGN' }).getAttribute('aria-pressed')).toBe('false');
  });
});
