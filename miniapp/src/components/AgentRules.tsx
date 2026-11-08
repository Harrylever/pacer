'use client';

import type { DisplayCurrency, VaultRules } from '../api';
import { copy } from '../copy';
import { formatDisplay, shortenAddress } from '../format';
import { openExternalLink } from '../telegram/useTelegram';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rule-row">
      <div className="mono rule-label">{label}</div>
      <div className="rule-value">{children}</div>
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
    <section aria-label={copy.agentRulesTitle} className="card fade-in rules-section">
      <div className="rules-head">
        <h2 className="rules-title">{copy.agentRulesTitle}</h2>
        {vault.paused ? (
          <span
            className="mono paused-badge"
          >
            <span aria-hidden="true" className="paused-dot" />
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
          <span className="demo-note">
            {' '}
            {copy.demoPeriodNote(vault.periodSeconds)}
          </span>
        ) : null}
      </Row>

      <Row label={copy.stocksItCanBuy}>
        {vault.stocks.map((s) => copy.stockName(s)).join(', ')}
      </Row>

      <Row label={copy.agentCanDoLabel}>{copy.agentCanDo}</Row>

      <p className="rules-link">
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
