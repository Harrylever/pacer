import { copy } from "@/content/landing";
import { history } from "@/content/history";
import { formatMonth, formatNgn } from "@/lib/format";
import { Phone } from "@/components/ui/Phone";
import {
  ComparisonChart,
  ComparisonProvider,
  ResultRows,
} from "@/components/islands/ComparisonChart";

export function Comparison() {
  const { comparison } = copy;
  return (
    <section className="ground-paper">
      <div className="mx-auto grid max-w-[1200px] gap-14 px-4 py-20 md:px-8 lg:grid-cols-12 lg:gap-10 lg:px-14 lg:py-28">
        <ComparisonProvider>
          <div className="lg:col-span-6">
            <div data-reveal="">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">
                {comparison.eyebrow}
              </p>
              <h2 className="mt-4 font-display text-[clamp(36px,6vw,56px)] font-[380] leading-[1.02] tracking-[-0.02em] text-balance">
                {comparison.title}
              </h2>
              <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-ink-muted">
                {comparison.body}
              </p>
            </div>
            <div className="mt-10 max-w-[460px]">
              <ResultRows />
              <p className="mt-6 text-[13px] text-ink-muted">
                {history.disclaimer} {comparison.period}.
              </p>
            </div>
          </div>

          <div className="flex justify-center lg:col-span-6 lg:justify-end">
            <Phone className="w-[300px] self-start">
              <div className="px-4 pb-5 pt-2">
                <p className="font-display text-[17px] font-medium leading-tight">
                  {comparison.title}
                </p>
                <p className="mt-1 text-[11px] text-ink-muted">
                  {comparison.hint}
                </p>
                <div className="mt-4">
                  <ComparisonChart />
                </div>
                <p className="mt-3 text-[11px] leading-snug text-ink-muted">
                  {history.disclaimer}
                </p>
                <p className="mt-1 text-[10.5px] leading-snug text-ink-muted">
                  {history.source}
                </p>
              </div>
            </Phone>
          </div>
        </ComparisonProvider>

        <div className="sr-only">
          <table>
            <caption>{comparison.tableCaption}</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                {comparison.rows.map((row) => (
                  <th key={row.key} scope="col">
                    {row.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.months.map((m) => (
                <tr key={m.month}>
                  <th scope="row">{formatMonth(m.month)}</th>
                  {comparison.rows.map((row) => (
                    <td key={row.key}>{formatNgn(m[row.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
