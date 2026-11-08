'use client';

import type { DisplayCurrency, VaultRules } from '../api';
import { copy } from '../copy';
import { formatDisplay, shortenAddress } from '../format';
import { openExternalLink } from '../telegram/useTelegram';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: 15 }}>{children}</div>
    </div>
  );
}

/**
 * The AI-track card: the rules the agent can't break, read live from
 * Solana by the backend (B2). Hides entirely when there is no vault.
 */
export function AgentRules({
  vault,
  currency,
  ngnPerUsd,
}: {
  vault: VaultRules | null | undefined;
  currency: DisplayCurrency;
  ngnPerUsd: number;
}) {
  if (!vault) return null;
  const pace = formatDisplay(vault.paceUsdPerPeriod, currency, ngnPerUsd);
  return (
    <section aria-label={copy.agentRulesTitle} className="card fade-in" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{copy.agentRulesTitle}</h2>
        {vault.paused ? (
          <span
            className="mono"
            style={{
              fontSize: 11,
              border: '1px solid var(--divider)',
              borderRadius: 999,
              padding: '2px 8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)', display: 'inline-block' }} />
            {copy.pausedBadge}
          </span>
        ) : null}
      </div>

      <Row label={copy.withdrawalsOnlyTo}>
        <span className="mono">{shortenAddress(vault.withdrawalAddress)}</span>
      </Row>

      <Row label={copy.yourPace}>
        <span>{copy.pacePerDay(pace.primary)}</span>
        {vault.periodSeconds !== 86400 ? (
          <span style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
            {' '}
            {copy.demoPeriodNote(vault.periodSeconds)}
          </span>
        ) : null}
      </Row>

      <Row label={copy.stocksItCanBuy}>
        {vault.stocks.map((s) => copy.stockName(s)).join(', ')}
      </Row>

      <Row label={copy.agentCanDoLabel}>{copy.agentCanDo}</Row>

      <p style={{ marginTop: 16 }}>
        <a
          href={vault.explorerUrl}
          onClick={(e) => {
            e.preventDefault();
            openExternalLink(vault.explorerUrl);
          }}
        >
          {copy.explorerLink}
        </a>
      </p>
    </section>
  );
}
