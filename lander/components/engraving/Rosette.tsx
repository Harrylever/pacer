import { rosettePath } from "@/lib/guilloche";

// Each ring draws several phase-shifted waves of the same radius, so they
// cross each other like the rosettes printed on banknotes.
const RINGS = [
  { radius: 90, petals: 24, amplitude: 16 },
  { radius: 140, petals: 30, amplitude: 18 },
  { radius: 190, petals: 36, amplitude: 20 },
  { radius: 240, petals: 42, amplitude: 22 },
];
const PHASES = [0, 1, 2, 3].map((k) => (k * Math.PI) / 4);

/**
 * A woven circular pattern, a quiet nod to textile geometry. It draws in
 * the colour of its parent (currentColor) so each ground sets its own tint.
 */
export function Rosette({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-280 -280 560 560"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth={0.7}>
        {RINGS.map((ring) =>
          PHASES.map((phase) => (
            <path
              key={`${ring.radius}-${phase}`}
              d={rosettePath({ cx: 0, cy: 0, ...ring, phase })}
            />
          )),
        )}
      </g>
    </svg>
  );
}
