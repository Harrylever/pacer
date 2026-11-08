'use client';

import type { DisplayCurrency } from '../api';
import { copy } from '../copy';
import { LaneDivider } from './LaneDivider';

/** The Pacer mark (from ../lander/public/brand/pacer-mark.svg), drawn in tokens. */
export function PacerMark() {
  return (
    <svg viewBox="0 0 64 64" width={36} height={36} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" style={{ fill: 'var(--primary)' }} />
      <path
        d="M13 48 H24 V38 H35 V28 H46"
        fill="none"
        style={{ stroke: 'var(--surface)' }}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="18" r="4.5" style={{ fill: 'var(--accent)' }} />
    </svg>
  );
}

export function Header({
  currency,
  onCurrencyChange,
}: {
  currency: DisplayCurrency;
  onCurrencyChange: (c: DisplayCurrency) => void;
}) {
  return (
    <header>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PacerMark />
          <h1 style={{ margin: 0, fontSize: 28 }}>{copy.appTitle}</h1>
        </div>
        <div role="group" aria-label="Display currency" className="segmented">
          <span aria-hidden="true" className="segmented-thumb" data-active={currency} />
          {(['NGN', 'USD'] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={currency === c}
              onClick={() => onCurrencyChange(c)}
            >
              {c === 'NGN' ? '₦ NGN' : '$ USD'}
            </button>
          ))}
        </div>
      </div>
      <LaneDivider />
    </header>
  );
}
