import { copy } from "@/content/landing";
import { Rosette } from "@/components/engraving/Rosette";

export function Nigeria() {
  const { nigeria } = copy;
  return (
    <section className="ground-band relative isolate overflow-hidden">
      <Rosette className="pointer-events-none absolute -right-40 top-1/2 -z-10 h-[680px] w-[680px] -translate-y-1/2 text-dark-ink opacity-[0.14] lg:-right-16" />
      <div className="mx-auto max-w-[1200px] px-4 py-20 md:px-8 lg:px-14 lg:py-28">
        <div data-reveal="" className="max-w-[640px]">
          <h2 className="font-display text-[clamp(38px,6vw,60px)] font-[380] leading-[1.02] tracking-[-0.02em] text-balance">
            {nigeria.title}
          </h2>
          <p className="mt-6 text-[18px] leading-relaxed text-band-muted">
            {nigeria.body}
          </p>
        </div>
      </div>
    </section>
  );
}
