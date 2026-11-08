import type { ReactNode } from "react";

/** A small mono pill, used for tickers and "Example" labels. */
export function Chip({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-divider bg-surface-raised px-3 py-1.5 font-mono text-[13px] text-ink ${className}`}
    >
      {children}
    </span>
  );
}
