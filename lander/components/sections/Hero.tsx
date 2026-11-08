import { copy, LINKS } from "@/content/landing";
import { Track } from "@/components/engraving/Track";
import { Button } from "@/components/ui/Button";
import { TiltOnPointer } from "@/components/islands/TiltOnPointer";
import { Phone } from "@/components/ui/Phone";
import { Chat } from "@/components/sections/Chat";
import {
  FadeUp,
  HeroHeadline,
  HeroMotion,
  PhoneRise,
} from "@/components/islands/HeroSequence";

// The track's stadium: 640 x 392 with 196 px end radius, four 26 px lanes.
const LOOP = { cx: 600, cy: 400, width: 640, height: 392, radius: 196 };

export function Hero() {
  const { hero } = copy;
  return (
    <section className="ground-dark grain hero relative isolate overflow-hidden">
      <div className="hero-glow" aria-hidden="true" />
      <div className="relative mx-auto flex min-h-svh max-w-[1200px] flex-col justify-center px-4 pb-16 pt-28 md:px-8 lg:min-h-[max(100svh,720px)] lg:px-14 lg:pb-12 lg:pt-28">
        <HeroMotion>
          <div className="relative z-10 max-w-[520px]">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-mint hero-eyebrow text-balance">
              {hero.eyebrow}
            </p>
            <div className="mt-5">
              <HeroHeadline
                words={hero.headlineWords}
                emphasis={hero.headlineEmphasis}
              />
            </div>
            <FadeUp delay={0.75} className="mt-7 max-w-[440px]">
              <p className="text-[17px] leading-[1.55] text-dark-muted">
                {hero.subline}
              </p>
            </FadeUp>
            <FadeUp delay={0.85} className="mt-8 flex flex-wrap gap-3">
              <Button href={LINKS.bot} variant="primary" ground="dark">
                {hero.primaryCta}
                <span aria-hidden="true">→</span>
              </Button>
              <Button href="#how" variant="secondary" ground="dark">
                {hero.secondaryCta}
              </Button>
            </FadeUp>
            <FadeUp delay={0.95} className="mt-4">
              <p className="text-[13px] text-dark-muted">{hero.note}</p>
            </FadeUp>
          </div>

          <div className="hero-visual relative mt-8 flex min-h-[600px] items-center justify-center lg:absolute lg:left-[35.7%] lg:top-1/2 lg:mt-0 lg:min-h-0 lg:w-[72%] lg:-translate-y-1/2">
            <Track
              className="absolute left-1/2 top-1/2 h-auto w-[560px] max-w-none -translate-x-1/2 -translate-y-1/2 rotate-90 lg:left-0 lg:w-full lg:translate-x-0 lg:rotate-0"
              loop={LOOP}
              laneWidth={26}
              drawIn
              dotDelayMs={600}
            />
            <PhoneRise className="relative">
              <TiltOnPointer>
                <Phone
                  statusTone="raised"
                  className="h-[560px] w-[272px] origin-center scale-[0.8] sm:scale-90 lg:scale-100"
                >
                  <Chat />
                </Phone>
              </TiltOnPointer>
            </PhoneRise>
          </div>
        </HeroMotion>
      </div>
    </section>
  );
}
