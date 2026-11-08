'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import {
  ApiError,
  calmMessage,
  fetchComparison,
  fetchHoldings,
  useMock,
  type DisplayCurrency,
  type HoldingsSummary,
  type HistoryComparison,
} from '../api';
import { copy } from '../copy';
import { useTelegram } from '../telegram/useTelegram';
import { AgentRules } from './AgentRules';
import { Header } from './Header';
import { Holdings } from './Holdings';
import { RecentBuys } from './RecentBuys';

/** Space-reserving placeholder: chart block plus three result-row blocks. */
function ComparisonSkeleton() {
  const block = (style: React.CSSProperties): React.CSSProperties => ({
    background: 'var(--divider)',
    borderRadius: 8,
    ...style,
  });
  return (
    <div aria-busy="true" aria-label="Loading the comparison">
      <div style={block({ height: 230, borderRadius: 16 })} />
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ marginTop: 20, borderTop: '1px solid var(--divider)', paddingTop: 20 }}>
          <div style={block({ height: 14, width: '40%' })} />
          <div style={block({ height: 40, width: '65%', marginTop: 8 })} />
          <div style={block({ height: 12, width: '30%', marginTop: 8 })} />
        </div>
      ))}
    </div>
  );
}

const Comparison = dynamic(
  () => import('./Comparison').then((m) => m.Comparison),
  { ssr: false, loading: () => <ComparisonSkeleton /> },
);

export default function Home() {
  const { initData } = useTelegram();
  // The daily mode is hidden until the backend's compareDaily returns a coherent
  // series and drawdowns (the real response had 0% drops and a lump-sum chart).
  const mode = 'lump' as const;
  const [currency, setCurrency] = useState<DisplayCurrency>('NGN');
  const [comparison, setComparison] = useState<HistoryComparison | null>(null);
  const [holdings, setHoldings] = useState<HoldingsSummary | null>(null);
  const [inited, setInited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holdingsError, setHoldingsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setComparison(null);
    setError(null);
    fetchComparison(mode)
      .then((c) => {
        if (!cancelled) setComparison(c);
      })
      .catch((e: unknown) => {
        if (!cancelled && e instanceof ApiError)
          setError(calmMessage(e.kind));
      });
    return () => {
      cancelled = true;
    };
  }, [inited]);

  useEffect(() => {
    if (!inited) setInited(true);
    if (initData === undefined) return;
    // Outside Telegram only the explicit mock preview loads a vault.
    const effectiveInitData = initData ?? (useMock() ? 'mock-preview' : null);
    if (effectiveInitData === null) return;
    fetchHoldings(effectiveInitData)
      .then((h) => {
        setHoldings(h);
        setCurrency(h.displayCurrency);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError) setHoldingsError(calmMessage(e.kind));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData]);

  const rate = comparison?.ngnPerUsd ?? holdings?.ngnPerUsd;

  return (
    <main>
      <Header currency={currency} onCurrencyChange={setCurrency} />

      <h2>{copy.comparisonTitleOnce}</h2>
      {error ? (
        <p role="alert">{error}</p>
      ) : comparison ? (
        <Comparison data={comparison} currency={currency} ngnPerUsd={rate} />
      ) : (
        <ComparisonSkeleton />
      )}

      {initData === null && inited && !useMock() ? (
        <section aria-label={copy.holdingsTitle}>
          <h2>{copy.holdingsTitle}</h2>
          <p>{copy.holdingsOutsideTelegram}</p>
        </section>
      ) : holdingsError ? (
        <section aria-label={copy.holdingsTitle}>
          <h2>{copy.holdingsTitle}</h2>
          <p role="alert">{holdingsError}</p>
        </section>
      ) : (
        <Holdings
          summary={holdings}
          currency={currency}
          loading={holdings === null && holdingsError === null}
        />
      )}

      {holdings ? (
        <AgentRules
          vault={holdings.vault}
          currency={currency}
          ngnPerUsd={holdings.ngnPerUsd}
        />
      ) : null}

      {holdings ? (
        <RecentBuys
          buys={holdings.recentBuys}
          currency={currency}
          ngnPerUsd={holdings.ngnPerUsd}
        />
      ) : null}

      <footer style={{ marginTop: 32 }}>
        <p>{copy.demoFooter}</p>
        <p>
          <a
            href={process.env.NEXT_PUBLIC_BOT_URL ?? '#'}
            target={initData ? '_self' : '_blank'}
            rel="noreferrer"
          >
            Open the Pacer bot
          </a>
        </p>
      </footer>
    </main>
  );
}
