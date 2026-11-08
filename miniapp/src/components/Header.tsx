'use client';

import type { DisplayCurrency } from '../api';
import { copy } from '../copy';
import { LaneDivider } from './LaneDivider';

/** The Pacer mark (from ../lander/public/brand/pacer-mark.svg), drawn in tokens. */
export function PacerMark() {
  return (
    <svg viewBox="0 0 64 64" width={36} height={36} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" className="mark-bg" />
      <path
        d="M13 48 H24 V38 H35 V28 H46"
        fill="none"
        className="mark-line"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="18" r="4.5" className="mark-dot" />
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
      <div className="header-row">
        <div className="header-brand">
          <PacerMark />
          <h1 className="app-title">{copy.appTitle}</h1>
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
