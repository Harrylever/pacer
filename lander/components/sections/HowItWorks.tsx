import { copy } from "@/content/landing";
import { Chip } from "@/components/ui/Chip";
import { ConfirmCard } from "@/components/ui/ChatBubble";
import { Staircase } from "@/components/islands/Staircase";

type Step = (typeof copy.how.steps)[number];

/** The product fragment under each step: real bot copy, not an illustration. */
function Fragment({ example }: { example: Step["example"] }) {
  if (example.kind === "card") {
    return (
      <ConfirmCard text={example.lines[0]} actions={["Confirm", "Cancel"]} />
    );
  }
  const [title, ...rest] = example.lines;
  return (
    <div className="rounded-2xl rounded-bl-md border border-divider bg-surface-raised px-4 py-3.5 text-[13px] leading-snug">
      <p className="font-semibold">{title}</p>
      {rest.map((line, i) => (
        <p
          key={i}
          className={`mt-1.5 ${line.includes("…") ? "font-mono text-[12px] tracking-tight" : "text-ink-muted"}`}
        >
          {line}
        </p>
      ))}
    </div>
  );
}

const OFFSETS = ["lg:mt-32", "lg:mt-16", "lg:mt-0"];

export function HowItWorks() {
  const { how } = copy;
  return (
    <section id="how" className="ground-paper">
      <div className="mx-auto max-w-[1200px] px-4 py-20 md:px-8 lg:px-14 lg:py-28">
        <div data-reveal className="max-w-[640px]">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">
            {how.eyebrow}
          </p>
          <h2 className="mt-4 font-display text-[clamp(36px,6vw,56px)] font-[380] leading-[1.02] tracking-[-0.02em] text-balance">
            {how.title}
          </h2>
        </div>

        <Staircase className="mt-14 lg:mt-20">
          <ol className="grid gap-0 lg:grid-cols-3">
            {how.steps.map((step, i) => (
              <li
                key={step.title}
                data-step={i}
                data-reveal=""
                style={{ "--i": i } as React.CSSProperties}
                className={`step relative pb-12 pl-6 lg:px-5 lg:pb-0 lg:pl-5 lg:pt-8 ${OFFSETS[i]}`}
              >
                <span className="step-dot" aria-hidden="true" />
                <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-muted">
                  Step {i + 1}
                </p>
                <h3 className="mt-3 font-display text-[28px] font-[400] leading-tight tracking-[-0.01em]">
                  {step.title}
                </h3>
                <p className="mt-3 max-w-[34ch] leading-relaxed text-ink-muted">
                  {step.body}
                </p>
                <div className="mt-6 max-w-[320px]">
                  {step.example.label && (
                    <div className="mb-2">
                      <Chip>{step.example.label}</Chip>
                    </div>
                  )}
                  <Fragment example={step.example} />
                </div>
              </li>
            ))}
          </ol>
        </Staircase>
      </div>
    </section>
  );
}
