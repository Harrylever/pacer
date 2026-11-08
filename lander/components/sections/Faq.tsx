import { copy } from "@/content/landing";

function Chevron() {
  return (
    <svg
      viewBox="0 0 20 20"
      width={20}
      height={20}
      className="faq-chevron shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Native disclosure elements: name="faq" makes them exclusive (one open at a
 * time) and the browser supplies keyboard and screen-reader behaviour.
 */
export function Faq() {
  return (
    <section id="faq" className="ground-paper">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-20 md:px-8 lg:grid-cols-12 lg:px-14 lg:py-28">
        <div data-reveal="" className="lg:col-span-4">
          <h2 className="font-display text-[clamp(36px,5vw,52px)] font-[380] leading-[1.02] tracking-[-0.02em]">
            {copy.faqTitle}
          </h2>
        </div>
        <div className="lg:col-span-8">
          {copy.faq.map((item, i) => (
            <details
              key={item.q}
              name="faq"
              data-reveal=""
              style={{ "--i": i } as React.CSSProperties}
              className="faq-item border-t border-divider last:border-b"
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-4 text-left font-display text-[22px] font-[400] leading-snug tracking-[-0.01em] [&::-webkit-details-marker]:hidden">
                {item.q}
                <Chevron />
              </summary>
              <p className="max-w-[60ch] pb-6 pr-10 leading-relaxed text-ink-muted">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
