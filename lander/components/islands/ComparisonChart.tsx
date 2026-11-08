"use client";

import {
  createContext,
  useContext,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { copy } from "@/content/landing";
import { history, type SeriesKey } from "@/content/history";
import { chartGeometry, indexFromPointer, stepIndex } from "@/lib/chart";
import { formatMonth, formatNgn, formatPct } from "@/lib/format";
import { CountUp } from "@/components/islands/CountUp";

const LAST = history.months.length - 1;
const SERIES: SeriesKey[] = ["naira", "usdc", "sp500"];
const STROKES: Record<SeriesKey, string> = {
  naira: "stroke-ink-muted",
  usdc: "stroke-primary",
  sp500: "stroke-accent-ink",
};
const FILLS: Record<SeriesKey, string> = {
  naira: "fill-ink-muted",
  usdc: "fill-primary",
  sp500: "fill-accent-ink",
};
const SWATCHES: Record<SeriesKey, string> = {
  naira: "bg-ink-muted",
  usdc: "bg-primary",
  sp500: "bg-accent-ink",
};

// Chart box in SVG units; the plot ends at PLOT_WIDTH, the rest holds line labels.
const WIDTH = 248;
const HEIGHT = 230;
const PLOT_WIDTH = 188;
const PAD = 10;
const geometry = chartGeometry(history.months, {
  width: PLOT_WIDTH,
  height: HEIGHT,
  pad: PAD,
});

const Ctx = createContext<{ index: number; setIndex: (i: number) => void }>({
  index: LAST,
  setIndex: () => {},
});

/** Shares the month being looked at between the chart and the result rows. */
export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState(LAST);
  return <Ctx.Provider value={{ index, setIndex }}>{children}</Ctx.Provider>;
}

function valueText(index: number): string {
  const m = history.months[index];
  return `${formatMonth(m.month)}: naira ${formatNgn(m.naira)}, USDC ${formatNgn(m.usdc)}, S&P 500 ${formatNgn(m.sp500)}`;
}

export function ComparisonChart() {
  const { index, setIndex } = useContext(Ctx);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const rect = box.current!.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
    setIndex(indexFromPointer(px, PLOT_WIDTH, PAD, history.months.length));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = stepIndex(event.key, index, history.months.length);
    if (next !== index || ["Home", "End"].includes(event.key)) {
      event.preventDefault();
      setIndex(next);
    }
  };

  const month = history.months[index];
  const markerX = geometry.x(index);

  return (
    <div
      ref={box}
      className="touch-pan-y select-none rounded-lg outline-offset-4"
      role="slider"
      aria-label={copy.comparison.chartLabel}
      aria-valuemin={0}
      aria-valuemax={LAST}
      aria-valuenow={index}
      aria-valuetext={valueText(index)}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse" || dragging.current) fromPointer(e);
      }}
      onPointerUp={() => {
        dragging.current = false;
        setIndex(LAST);
      }}
      onPointerCancel={() => {
        dragging.current = false;
        setIndex(LAST);
      }}
      onPointerLeave={() => {
        if (!dragging.current) setIndex(LAST);
      }}
      onBlur={() => setIndex(LAST)}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        aria-hidden="true"
        focusable="false"
      >
        <line
          x1={PAD}
          x2={PLOT_WIDTH - PAD}
          y1={geometry.y(0)}
          y2={geometry.y(0)}
          className="stroke-divider"
          strokeWidth={1}
        />
        {SERIES.map((key) => (
          <path
            key={key}
            d={geometry.paths[key]}
            fill="none"
            className={STROKES[key]}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {/* labels sit on the line ends, so the chart needs no separate legend */}
        {SERIES.map((key) => (
          <text
            key={key}
            x={PLOT_WIDTH - PAD + 8}
            y={geometry.y(history.months[LAST][key]) + 3.5}
            className={`${FILLS[key]} font-mono`}
            fontSize={10}
          >
            {copy.comparison.rows
              .find((r) => r.key === key)!
              .label.replace(/^(Kept in|In the) /, "")}
          </text>
        ))}
        <line
          x1={markerX}
          x2={markerX}
          y1={PAD}
          y2={geometry.y(0)}
          className="stroke-ink"
          strokeOpacity={0.35}
          strokeWidth={1}
        />
        {SERIES.map((key) => (
          <circle
            key={key}
            cx={markerX}
            cy={geometry.y(month[key])}
            r={3.5}
            className={`${FILLS[key]} stroke-surface-raised`}
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <p className="mt-1 font-mono text-[11px] text-ink-muted tnum">
        {formatMonth(month.month)}
      </p>
    </div>
  );
}

/** The three results at the month being looked at, each with its worst drop. */
export function ResultRows() {
  const { index } = useContext(Ctx);
  const month = history.months[index];
  return (
    <ul>
      {copy.comparison.rows.map((row, i) => {
        const result = history.results[row.key];
        return (
          <li
            key={row.key}
            data-reveal=""
            style={{ "--i": i } as React.CSSProperties}
            className="border-t border-divider py-5 first:border-t-0 first:pt-0"
          >
            <div className="flex items-center gap-2 text-[15px] text-ink-muted">
              <span
                aria-hidden="true"
                className={`h-0.5 w-5 rounded-full ${SWATCHES[row.key]}`}
              />
              {row.label}
            </div>
            <div className="mt-1 font-display text-[44px] font-[380] leading-none tracking-[-0.02em] tnum">
              <CountUp value={month[row.key]} format="ngn" />
            </div>
            <p className="mt-2 text-[14px] text-ink-muted">
              {copy.comparison.worstDrop}{" "}
              {result.maxDrawdownPct === 0 ? (
                <span className="font-medium text-ink tnum">0%</span>
              ) : (
                <span className="font-medium text-loss tnum">
                  ▼ −{formatPct(result.maxDrawdownPct)}
                </span>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
