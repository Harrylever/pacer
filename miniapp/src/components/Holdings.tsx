'use client';

import type { DisplayCurrency, HoldingsSummary } from '../api';
import { copy } from '../copy';
import { formatDisplay } from '../format';

const LINE_NAME: Record<string, string> = {
  USDC: 'USDC',
  SPYx: 'S&P 500',
  AAPLx: 'Apple',
  NVDAx: 'Nvidia',
};

export function Holdings({
  summary,
  currency,
  loading,
}: {
  summary: HoldingsSummary | null;
  currency: DisplayCurrency;
  loading: boolean;
}) {
  if (loading) {
    return (
      <section aria-label={copy.holdingsTitle} aria-busy="true">
        <h2>{copy.holdingsTitle}</h2>
        <div className="skeleton-block skel-total" />
        <div className="skeleton-block skel-line-a" />
        <div className="skeleton-block skel-line-b" />
        <div className="skeleton-block skel-bar" />
        <p>Loading…</p>
      </section>
    );
  }
  if (!summary || summary.holdings.length === 0) {
    return (
      <section aria-label={copy.holdingsTitle}>
        <h2>{copy.holdingsTitle}</h2>
        <p>{copy.holdingsEmpty}</p>
      </section>
    );
  }
  const totalKnown = summary.totalValueUsd;
  const money = (usd: number) => formatDisplay(usd, currency, summary.ngnPerUsd);
  const totalDisplay = totalKnown === null ? null : money(totalKnown);
  // "Put in" counts only what the agent bought, and the total also includes
  // USDC still waiting to be invested, so take that cash out before comparing.
  // Otherwise idle cash would show up as a gain.
  const change =
    totalKnown === null ? null : totalKnown - summary.waitingUsdc - summary.putInUsd;
  const barTotal = summary.holdings.reduce((a, h) => a + (h.valueUsd ?? 0), 0);
  return (
    <section aria-label={copy.holdingsTitle} className="fade-in">
      <h2>{copy.holdingsTitle}</h2>
      {totalDisplay ? (
        <div>
          <div className="tnum holdings-total">
            {totalDisplay.primary}
          </div>
          {totalDisplay.sub ? (
            <div className="holdings-sub">
              {totalDisplay.sub}
            </div>
          ) : null}
        </div>
      ) : (
        <p>{copy.priceUnavailable}</p>
      )}

      <p>
        {copy.putIn}: <span>{money(summary.putInUsd).primary}</span>
        {currency === 'NGN' ? ` (${money(summary.putInUsd).sub})` : ''}
      </p>
      <p>
        {copy.change}:{' '}
        {change === null ? (
          copy.priceUnavailable
        ) : (
          <span
            className={change > 0 ? 'gain-text' : change < 0 ? 'loss-text' : undefined}
          >
            {change > 0 ? '▲ +' : change < 0 ? '▼ ' : ''}
            {money(change).primary}
            {currency === 'NGN' ? ` (${money(change).sub})` : ''}
          </span>
        )}
      </p>
      <p>
        {copy.waiting}: <span>{money(summary.waitingUsdc).primary}</span>
        {currency === 'NGN' ? ` (${money(summary.waitingUsdc).sub})` : ''}
      </p>

      <div
        role="img"
        aria-label={
          totalKnown === null
            ? 'Holdings allocation bar, some prices unavailable.'
            : `Allocation of ${totalKnown.toFixed(2)} dollars across ${summary.holdings.length} positions.`
        }
        className="alloc-bar"
      >
        {summary.holdings.map((h) => (
          <div
            key={h.symbol}
            title={h.symbol}
            className={`bar-${h.symbol} ${h.priced ? '' : 'alloc-seg-unpriced'}`}
            style={{
              width: `${
                barTotal > 0 && h.valueUsd !== null
                  ? (h.valueUsd / barTotal) * 100
                  : 100 / Math.max(summary.holdings.length, 1)
              }%`,
            }}
          />
        ))}
      </div>
      <ul className="holdings-list">
        {summary.holdings.map((h) => {
          const v = h.valueUsd === null ? null : money(h.valueUsd);
          return (
            <li
              key={h.symbol}
              className="holding-row"
            >
              <span>
                <span className="mono holding-ticker">
                  {h.symbol}
                </span>{' '}
                <span className="muted">
                  {LINE_NAME[h.symbol] ?? h.symbol} · {h.uiAmount}
                </span>
              </span>
              {v ? (
                <span>
                  {v.primary}
                  {v.sub ? <span className="muted"> ({v.sub})</span> : null}
                </span>
              ) : (
                <span>{copy.priceUnavailable}</span>
              )}
            </li>
          );
        })}
      </ul>
      {currency === 'NGN' ? (
        <p className="muted-sm">
          {copy.marketRateCaption(summary.ngnPerUsd)}
        </p>
      ) : null}
    </section>
  );
}
