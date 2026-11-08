'use client';

import type { DisplayCurrency, RecentBuy } from '../api';
import { copy } from '../copy';
import { formatDisplay, formatRelativeTime } from '../format';

/**
 * Up to five recent buys, newest first (the backend caps the list). Hides when empty.
 * Naira amounts convert at `ngnPerUsd` — today's rate from the holdings
 * summary, never a rate from the day of the buy (buys carry no rate).
 */
export function RecentBuys({
  buys,
  currency,
  ngnPerUsd,
  now,
}: {
  buys: RecentBuy[] | undefined;
  currency: DisplayCurrency;
  ngnPerUsd: number;
  now?: number;
}) {
  if (!buys || buys.length === 0) return null;
  const nowMs = now ?? Date.now();
  return (
    <section aria-label={copy.recentBuysTitle} style={{ marginTop: 24 }}>
      <h2>{copy.recentBuysTitle}</h2>
      <ul style={{ padding: 0, margin: 0 }}>
        {buys.slice(0, 5).map((b, i) => (
          <li
            key={`${b.at}-${b.symbol}-${i}`}
            style={{
              listStyle: 'none',
              padding: '10px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--divider)',
              fontSize: 15,
            }}
          >
            <span>{formatDisplay(b.usdcIn, currency, ngnPerUsd).primary}</span>
            {' of '}
            {copy.buyStockName(b.symbol)}
            <span style={{ color: 'var(--fg-muted)' }}>
              {' · '}
              {formatRelativeTime(b.at, nowMs)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
