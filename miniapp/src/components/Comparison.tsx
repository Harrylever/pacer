'use client';

// Rebuilt from ../lander/components/islands/ComparisonChart.tsx and CountUp
// (Pacer Mini App round 2, M3): the hand-built SVG replaces Recharts, fed by
// the API series instead of the bundled JSON. Figures come from the backend;
// this file only computes where they sit on the chart.

import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { DisplayCurrency, HistoryComparison } from '../api';
import { copy } from '../copy';
import { formatMonth, formatNGN, formatUSD } from '../format';
import { chartGeometry, indexFromPointer, stepIndex, type SeriesKey } from '../lib/chart';
import { CountUp } from './CountUp';

const SERIES: SeriesKey[] = ['naira', 'usdc', 'sp500'];
const ROW_LABEL: Record<SeriesKey, string> = {
  naira: copy.nairaRow,
  usdc: copy.usdcRow,
  sp500: copy.spRow,
};
const SHORT_LABEL: Record<SeriesKey, string> = {
  naira: 'Naira',
  usdc: 'USDC',
  sp500: 'S&P 500',
};

// Chart box in SVG units; the plot ends at PLOT_WIDTH, the rest holds line labels.
const WIDTH = 248;
const HEIGHT = 230;
const PLOT_WIDTH = 188;
const PAD = 10;

export function Comparison({
  data,
  currency,
  ngnPerUsd,
}: {
  data: HistoryComparison;
  currency: DisplayCurrency;
  ngnPerUsd?: number;
}) {
  const months = data.series;
  const last = months.length - 1;
  const [index, setIndex] = useState(last);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  if (months.length === 0) return null;
  const shownIndex = Math.min(index, last);
  const month = months[shownIndex];
  const geometry = chartGeometry(months, { width: PLOT_WIDTH, height: HEIGHT, pad: PAD });

  const formatValue = (ngn: number): string =>
    currency === 'USD' && ngnPerUsd
      ? formatUSD(ngn / ngnPerUsd)
      : formatNGN(ngn);

  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = box.current!.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
    setIndex(indexFromPointer(px, PLOT_WIDTH, PAD, months.length));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = stepIndex(event.key, shownIndex, months.length);
    if (next !== shownIndex || ['Home', 'End'].includes(event.key)) {
      event.preventDefault();
      setIndex(next);
    }
  };

  const valueText = (i: number): string => {
    const m = months[i];
    return `${formatMonth(m.month)}: naira ${formatNGN(m.naira)}, USDC ${formatNGN(m.usdc)}, S&P 500 ${formatNGN(m.sp500)}`;
  };

  const resultFor = (key: SeriesKey) =>
    key === 'naira' ? data.naira : key === 'usdc' ? data.usdc : data.sp500;

  // Apple and Nvidia have no monthly series (the chart stays three lines),
  // so their rows show the end value the API returns, with its worst drop.
  const extraRows = [
    { key: 'apple', label: copy.appleRow, result: data.apple },
    { key: 'nvidia', label: copy.nvidiaRow, result: data.nvidia },
  ].filter((r) => r.result);

  return (
    <section aria-label="Past comparison">
      <div
        ref={box}
        role="slider"
        aria-label={copy.chartLabel}
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={shownIndex}
        aria-valuetext={valueText(shownIndex)}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' || dragging.current) fromPointer(e);
        }}
        onPointerUp={() => {
          dragging.current = false;
          setIndex(last);
        }}
        onPointerCancel={() => {
          dragging.current = false;
          setIndex(last);
        }}
        onPointerLeave={() => {
          if (!dragging.current) setIndex(last);
        }}
        onBlur={() => setIndex(last)}
        className="chart-slider"
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="chart-svg" aria-hidden="true" focusable="false">
          <line x1={PAD} x2={PLOT_WIDTH - PAD} y1={geometry.y(0)} y2={geometry.y(0)} className="chart-baseline" strokeWidth={1} />
          {SERIES.map((key) => (
            <path key={key} d={geometry.paths[key]} fill="none" className={`chart-line-${key}`} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {/* labels sit on the line ends, so the chart needs no separate legend */}
          {SERIES.map((key) => (
            <text key={key} x={PLOT_WIDTH - PAD + 8} y={geometry.y(months[last][key]) + 3.5} className={`chart-fill-${key} mono`} fontSize={10}>
              {SHORT_LABEL[key]}
            </text>
          ))}
          <line x1={geometry.x(shownIndex)} x2={geometry.x(shownIndex)} y1={PAD} y2={geometry.y(0)} className="chart-cursor" strokeWidth={1} />
          {SERIES.map((key) => (
            <circle key={key} cx={geometry.x(shownIndex)} cy={geometry.y(month[key])} r={3.5} className={`chart-fill-${key} chart-dot`} strokeWidth={1.5} />
          ))}
        </svg>
        <p className="mono tnum chart-month">
          {formatMonth(month.month)}
        </p>
      </div>

      <ul className="result-list">
        {SERIES.map((key) => {
          const result = resultFor(key);
          return (
            <li key={key} data-testid="asset-row" className="fade-in result-row">
              <div className="result-label">
                <span aria-hidden="true" className={`chart-swatch-${key} swatch`} />
                {ROW_LABEL[key]}
              </div>
              <div className="tnum result-value">
                <CountUp value={month[key]} format={formatValue} />
              </div>
              <p className="result-drop">
                {copy.worstDropLabel}{' '}
                {result.maxDrawdownPct === 0 ? (
                  <span className="drop-zero">0%</span>
                ) : (
                  <span className="drop-loss drop-value">
                    ▼ −{result.maxDrawdownPct.toFixed(1)}%
                  </span>
                )}
              </p>
            </li>
          );
        })}
        {extraRows.map(({ key, label, result }) => (
          <li key={key} data-testid="asset-row" className="fade-in result-row">
            <div className="result-label">
              {label}
            </div>
            <div className="tnum result-value">
              <CountUp value={result.endNgn} format={formatValue} />
            </div>
            <p className="result-drop">
              {copy.worstDropLabel}{' '}
              {result.maxDrawdownPct === 0 ? (
                <span className="drop-zero">0%</span>
              ) : (
                <span className="drop-loss drop-value">
                  ▼ −{result.maxDrawdownPct.toFixed(1)}%
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>

      <p>{data.disclaimer}</p>
      <p className="muted-sm">
        {copy.sourceLine(formatMonth(months[0].month), formatMonth(data.asOf ?? months[last].month))}
        {ngnPerUsd ? <> · {copy.marketRateCaption(ngnPerUsd)}</> : null}
      </p>
      <p className="muted">{copy.honestHook}</p>

      {/* The wrapper is what's visually hidden: a table ignores the 1px width
          of .sr-only and would widen the page (it pushed 360px phones to 470px). */}
      <div className="sr-only">
        <table>
          <caption>Monthly values in naira for ₦20,000 put away in October 2021</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Kept in naira</th>
              <th scope="col">Kept in USDC</th>
              <th scope="col">In the S&P 500</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <th scope="row">{formatMonth(m.month)}</th>
                <td>{formatNGN(m.naira)}</td>
                <td>{formatNGN(m.usdc)}</td>
                <td>{formatNGN(m.sp500)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
