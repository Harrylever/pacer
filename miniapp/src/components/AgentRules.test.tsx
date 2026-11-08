import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VaultRules } from '../api';
import { AgentRules } from './AgentRules';

const vault: VaultRules = {
  address: 'VaultPda1111111111111111111111111111111111',
  explorerUrl: 'https://explorer.solana.com/address/VaultPda1111111111111111111111111111111111?cluster=devnet',
  withdrawalAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosg9fQp',
  paceUsdPerPeriod: 1.05,
  periodSeconds: 86400,
  stocks: ['SPYx', 'AAPLx'],
  paused: false,
};

afterEach(() => {
  (window as unknown as { Telegram?: unknown }).Telegram = undefined;
  vi.unstubAllGlobals();
});

describe('AgentRules', () => {
  it('shows every rule row from the vault', () => {
    render(<AgentRules vault={vault} currency="NGN" ngnPerUsd={1385} />);
    expect(screen.getByText("What the AI agent can and can't do")).toBeInTheDocument();
    expect(screen.getByText('Withdrawals only go to')).toBeInTheDocument();
    expect(screen.getByText('7xKX…9fQp')).toBeInTheDocument();
    expect(screen.getByText('Your pace')).toBeInTheDocument();
    // $1.05 at ₦1,385/$ = ₦1,454 a day.
    expect(screen.getByText(/₦1,454 a day/)).toBeInTheDocument();
    expect(screen.getByText('Stocks it can buy')).toBeInTheDocument();
    expect(screen.getByText(/S&P 500 \(SPYx\), Apple \(AAPLx\)/)).toBeInTheDocument();
    expect(screen.getByText(/Only buy, at your pace/)).toBeInTheDocument();
    expect(screen.getByText(/The vault program enforces this/)).toBeInTheDocument();
  });

  it('shows the pace in dollars when the display currency is USD', () => {
    render(<AgentRules vault={vault} currency="USD" ngnPerUsd={1385} />);
    expect(screen.getByText(/\$1\.05 a day/)).toBeInTheDocument();
  });

  it('adds the demo-period note only when a period is not a day', () => {
    const { rerender } = render(<AgentRules vault={vault} currency="NGN" ngnPerUsd={1385} />);
    expect(screen.queryByText(/demo: one day/)).toBeNull();
    rerender(<AgentRules vault={{ ...vault, periodSeconds: 10 }} currency="NGN" ngnPerUsd={1385} />);
    expect(screen.getByText(/\(demo: one day = 10 s\)/)).toBeInTheDocument();
  });

  it('shows a Paused badge only when paused', () => {
    const { rerender } = render(<AgentRules vault={vault} currency="NGN" ngnPerUsd={1385} />);
    expect(screen.queryByText('Paused')).toBeNull();
    rerender(<AgentRules vault={{ ...vault, paused: true }} currency="NGN" ngnPerUsd={1385} />);
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('hides when there is no vault', () => {
    const { container } = render(<AgentRules vault={null} currency="NGN" ngnPerUsd={1385} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('recommends nothing', () => {
    render(<AgentRules vault={vault} currency="NGN" ngnPerUsd={1385} />);
    expect(screen.queryByText(/best|recommend|should (buy|pick)/i)).toBeNull();
  });

  it('opens the Explorer link through Telegram when inside Telegram', () => {
    const openLink = vi.fn();
    (window as unknown as { Telegram?: unknown }).Telegram = { WebApp: { openLink } };
    render(<AgentRules vault={vault} currency="NGN" ngnPerUsd={1385} />);
    const link = screen.getByRole('link', { name: /Check your vault on Solana Explorer/ });
    expect(link.getAttribute('href')).toBe(vault.explorerUrl);
    fireEvent.click(link);
    expect(openLink).toHaveBeenCalledWith(vault.explorerUrl);
  });
});
