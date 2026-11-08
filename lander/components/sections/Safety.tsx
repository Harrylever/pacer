import { copy, LINKS } from "@/content/landing";
import { Vault } from "@/components/engraving/Vault";
import { Button } from "@/components/ui/Button";

export function Safety() {
  const { safety } = copy;
  return (
    <section
      id="safety"
      className="ground-dark grain safety relative isolate overflow-hidden"
    >
      <div className="mx-auto max-w-[1200px] px-4 py-20 md:px-8 lg:px-14 lg:py-28">
        <div data-reveal="" className="max-w-[760px]">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-mint">
            {safety.eyebrow}
          </p>
          <h2 className="mt-4 font-display text-[clamp(38px,6.5vw,64px)] font-[380] leading-[1.02] tracking-[-0.02em] text-balance">
            {safety.title}
          </h2>
          <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-dark-muted">
            {safety.subline}
          </p>
        </div>

        <div className="mt-12 grid items-center gap-12 lg:mt-16 lg:grid-cols-12 lg:gap-10">
          <div data-reveal="" className="lg:col-span-7">
            <Vault className="h-auto w-full" />
          </div>

          <div className="lg:col-span-5">
            <ul>
              {safety.guarantees.map((g, i) => (
                <li
                  key={g.id}
                  data-guarantee={g.id}
                  tabIndex={0}
                  data-reveal=""
                  style={{ "--i": i } as React.CSSProperties}
                  className="guarantee relative rounded-lg px-3 py-5 first:pt-3"
                >
                  <p className="font-mono text-xs text-mint">0{i + 1}</p>
                  <h3 className="mt-2 font-display text-[24px] font-[400] leading-tight tracking-[-0.01em]">
                    {g.title}
                  </h3>
                  <p className="mt-2 max-w-[42ch] leading-relaxed text-dark-muted">
                    {g.body}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-dark-ink/15 px-3 pt-5 text-[14px] leading-relaxed text-dark-muted">
              {safety.note}
            </p>
            <div className="mt-6 px-3">
              <Button href={LINKS.github} variant="secondary" ground="dark">
                {safety.githubLabel}
                <span aria-hidden="true">↗</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
