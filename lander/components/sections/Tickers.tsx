import { copy } from "@/content/landing";

export function Tickers() {
  const { tickers } = copy;
  return (
    <section className="ground-paper border-t border-divider">
      <div className="mx-auto max-w-[1200px] px-4 py-14 md:px-8 lg:px-14 lg:py-16">
        <div data-reveal="" className="grid items-center gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <h2 className="font-display text-[clamp(28px,4vw,40px)] font-[380] leading-tight tracking-[-0.02em]">
              {tickers.title}
            </h2>
            <p className="mt-3 max-w-[40ch] text-[15px] leading-relaxed text-ink-muted">
              {tickers.note}
            </p>
          </div>
          <ul className="flex flex-wrap gap-3 lg:col-span-8 lg:justify-end">
            {tickers.items.map((item) => (
              <li
                key={item.symbol}
                className="ticker-chip inline-flex items-baseline gap-3 rounded-full border border-divider bg-surface-raised px-5 py-3"
              >
                <span className="font-mono text-[15px] font-medium">
                  {item.symbol}
                </span>
                <span className="text-[15px] text-ink-muted">{item.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
