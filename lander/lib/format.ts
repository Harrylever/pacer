const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "₦49,027": whole naira with thousands separators. */
export function formatNgn(n: number): string {
  return `₦${Math.round(n).toLocaleString("en-US")}`;
}

/** "22.4%": one decimal place. */
export function formatPct(p: number): string {
  return `${p.toFixed(1)}%`;
}

/** "2026-10" becomes "Oct 2026". */
export function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  return `${MONTHS[Number(m) - 1]} ${year}`;
}
