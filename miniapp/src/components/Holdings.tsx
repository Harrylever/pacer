'use client';

import type { DisplayCurrency, HoldingsSummary } from '../api';
import { copy } from '../copy';
import { formatDisplay } from '../format';

const BAR_COLORS: Record<string, string> = {
  USDC: 'var(--primary)',
  SPYx: 'var(--mint)',
  AAPLx: 'var(--accent)',
  NVDAx: 'var(--gain)',
};

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
    const block = (style: React.CSSProperties): React.CSSProperties => ({
      background: 'var(--divider)',
      borderRadius: 8,
      ...style,
    });
    return (
      <section aria-label={copy.holdingsTitle} aria-busy="true">
        <h2>{copy.holdingsTitle}</h2>
        <div style={block({ height: 44, width: '55%' })} />
        <div style={block({ height: 14, width: '70%', marginTop: 16 })} />
        <div style={block({ height: 14, width: '50%', marginTop: 8 })} />
        <div style={block({ height: 18, width: '100%', marginTop: 20, borderRadius: 999 })} />
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
          <div
            className="tnum"
            style={{
              fontFamily: 'var(--font-fraunces), serif',
              fontSize: 44,
              fontWeight: 380,
              lineHeight: 1,
              letterSpacing: '-0.02em',
            }}
          >
            {totalDisplay.primary}
          </div>
          {totalDisplay.sub ? (
            <div style={{ fontSize: 14, color: 'var(--fg-muted)', marginTop: 4 }}>
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
        {copy.waiting}: <span>{summary.waitingUsdc} USDC</span>
      </p>

      <div
        role="img"
        aria-label={
          totalKnown === null
            ? 'Holdings allocation bar, some prices unavailable.'
            : `Allocation of ${totalKnown.toFixed(2)} dollars across ${summary.holdings.length} positions.`
        }
        style={{
          display: 'flex',
          height: 18,
          borderRadius: 999,
          overflow: 'hidden',
          marginTop: 16,
        }}
      >
        {summary.holdings.map((h) => (
          <div
            key={h.symbol}
            title={h.symbol}
            style={{
              width: `${
                barTotal > 0 && h.valueUsd !== null
                  ? (h.valueUsd / barTotal) * 100
                  : 100 / Math.max(summary.holdings.length, 1)
              }%`,
              background: BAR_COLORS[h.symbol] ?? 'var(--ink-muted)',
              opacity: h.priced ? 1 : 0.35,
            }}
          />
        ))}
      </div>
      <ul style={{ padding: 0, margin: '12px 0' }}>
        {summary.holdings.map((h) => {
          const v = h.valueUsd === null ? null : money(h.valueUsd);
          return (
            <li
              key={h.symbol}
              style={{
                listStyle: 'none',
                marginBottom: 8,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span>
                <span className="mono" style={{ fontWeight: 500 }}>
                  {h.symbol}
                </span>{' '}
                <span style={{ color: 'var(--fg-muted)' }}>
                  {LINE_NAME[h.symbol] ?? h.symbol} · {h.uiAmount}
                </span>
              </span>
              {v ? (
                <span>
                  {v.primary}
                  {v.sub ? <span style={{ color: 'var(--fg-muted)' }}> ({v.sub})</span> : null}
                </span>
              ) : (
                <span>{copy.priceUnavailable}</span>
              )}
            </li>
          );
        })}
      </ul>
      {currency === 'NGN' ? (
        <p style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
          {copy.marketRateCaption(summary.ngnPerUsd)}
        </p>
      ) : null}
    </section>
  );
}
