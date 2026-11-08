import { copy } from "@/content/landing";
import { engrave, loopPoint } from "@/lib/guilloche";

const LOOP = { cx: 350, cy: 250, width: 300, height: 220, radius: 56 };
const LANES = 3;
const LANE_WIDTH = 18;

/**
 * The one illustration: a vault, engraved like the track, with three paths.
 * In from your Pacer address; the agent's buy path that loops back inside;
 * and a single way out, to your wallet. Each path carries data-path so the
 * matching guarantee can light it up (CSS only). Decorative; the three
 * guarantees beside it say the same thing in words.
 */
export function Vault({ className }: { className?: string }) {
  const e = engrave(LOOP, {
    lanes: LANES,
    laneWidth: LANE_WIDTH,
    strandsPerLane: 3,
    waveLength: 28,
    infieldLines: 3,
    startT: 0.08,
  });
  const labels = copy.safety.vaultLabels;
  // "Your Pacer address" is split so it clears the vault on narrow screens.
  const cut = labels.in.lastIndexOf(" ");
  const inLabel = [labels.in.slice(0, cut), labels.in.slice(cut + 1)];
  // The resting dot sits on the inner lane, bottom left, clear of the paths.
  const dot = loopPoint(LOOP, 0.64, LANE_WIDTH / 2);

  return (
    <svg
      viewBox="0 0 700 470"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* the vault: engraved lanes (this is the "pace" part) and the fine infield */}
      <g data-path="pace" fill="none" className="stroke-mint">
        <g strokeOpacity={0.09} strokeWidth={0.8}>
          {e.infield.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g strokeOpacity={0.22} strokeWidth={0.7}>
          {e.strands.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g strokeWidth={1}>
          {e.laneLines.map((d, i) => (
            <path
              key={i}
              d={d}
              strokeOpacity={i === 0 || i === LANES ? 0.6 : 0.4}
            />
          ))}
        </g>
      </g>

      {/* a dial in the middle */}
      <g
        fill="none"
        className="stroke-mint"
        strokeOpacity={0.45}
        strokeWidth={1}
      >
        <circle cx={350} cy={250} r={34} />
        <circle cx={350} cy={250} r={26} strokeOpacity={0.5} />
        <path d="M350 216 V226 M350 274 V284 M316 250 H326 M374 250 H384" />
      </g>
      <text
        x={350}
        y={254}
        textAnchor="middle"
        className="vault-label fill-dark-muted font-mono"
      >
        vault
      </text>

      {/* the pace dot, resting */}
      <circle
        cx={dot.x}
        cy={dot.y}
        r={16}
        className="fill-accent"
        opacity={0.16}
      />
      <circle cx={dot.x} cy={dot.y} r={7} className="fill-accent" />

      {/* in: from your Pacer address */}
      <g data-path="in" fill="none" className="stroke-mint" strokeWidth={1.6}>
        <path d="M62 250 H196" />
        <path
          d="M200 250 l-10 -5.5 v11 z"
          className="fill-mint"
          stroke="none"
        />
      </g>
      <text x={14} y={284} className="vault-label fill-dark-muted font-mono">
        <tspan x={14}>{inLabel[0]}</tspan>
        <tspan x={14} dy="1.25em">
          {inLabel[1]}
        </tspan>
      </text>

      {/* buy: the agent's path leaves the vault and comes back; it never gets out */}
      <g
        data-path="buy"
        fill="none"
        className="stroke-mint"
        strokeWidth={1.6}
        strokeDasharray="5 5"
      >
        <path d="M322 140 V92 C322 52 378 52 378 92 V136" />
      </g>
      <path
        data-path="buy"
        d="M378 140 l-5.5 -10 h11 z"
        className="fill-mint"
      />
      <circle data-path="buy" cx={350} cy={58} r={4} className="fill-mint" />
      <text
        data-path="buy"
        x={350}
        y={32}
        textAnchor="middle"
        className="vault-label fill-dark-muted font-mono"
      >
        {labels.buy}
      </text>

      {/* out: the only way out, to your wallet */}
      <g
        data-path="out"
        fill="none"
        className="stroke-dark-ink"
        strokeWidth={2.2}
      >
        <path d="M500 250 H640" />
        <path
          d="M660 250 l-12 -6.5 v13 z"
          className="fill-dark-ink"
          stroke="none"
        />
      </g>
      <text
        data-path="out"
        x={686}
        y={284}
        textAnchor="end"
        className="vault-label fill-dark-ink font-mono"
      >
        {labels.out}
      </text>
    </svg>
  );
}
