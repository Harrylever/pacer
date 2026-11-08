import { copy, LINKS } from "@/content/landing";
import { Track } from "@/components/engraving/Track";
import { Button } from "@/components/ui/Button";

const LOOP = { cx: 600, cy: 400, width: 640, height: 392, radius: 196 };

/** The closing call to action. The track returns and the dot finishes its lap. */
export function FinalCta() {
  const { cta } = copy;
  return (
    <section className="ground-dark grain relative isolate overflow-hidden">
      <Track
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-auto w-[1000px] max-w-none -translate-x-1/2 -translate-y-1/2 opacity-80"
        loop={LOOP}
        laneWidth={26}
        dot="finish"
      />
      <div className="mx-auto flex max-w-[1200px] flex-col items-center px-4 py-28 text-center md:px-8 lg:px-14 lg:py-36">
        <div data-reveal="">
          <h2 className="mx-auto max-w-[14ch] font-display text-[clamp(40px,7vw,72px)] font-[380] leading-[1] tracking-[-0.02em] text-balance">
            {cta.title}
          </h2>
          <p className="mx-auto mt-5 max-w-[40ch] text-[17px] leading-relaxed text-dark-muted">
            {cta.body}
          </p>
          <div className="mt-9">
            <Button href={LINKS.bot} variant="primary" ground="dark">
              {cta.button}
              <span aria-hidden="true">→</span>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
