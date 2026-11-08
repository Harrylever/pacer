import { engrave, type Loop } from "@/lib/guilloche";
import { PaceDot } from "@/components/islands/PaceDot";

/**
 * The running track, engraved like a banknote: lane lines, interlaced
 * strands, a start line with lane numbers, fine lines in the infield, and
 * the amber pace dot. Decorative; drawn on the server as static SVG.
 */
export function Track({
  loop,
  laneWidth,
  lanes = 4,
  dot = "loop",
  drawIn = false,
  dotDelayMs = 0,
  className,
}: {
  loop: Loop;
  laneWidth: number;
  lanes?: number;
  dot?: "loop" | "finish" | "none";
  drawIn?: boolean;
  dotDelayMs?: number;
  className?: string;
}) {
  const e = engrave(loop, {
    lanes,
    laneWidth,
    strandsPerLane: 4,
    waveLength: 36,
    infieldLines: 6,
    startT: 0.08,
  });
  const extent = lanes * laneWidth + 8;
  const viewBox = [
    loop.cx - loop.width / 2 - extent,
    loop.cy - loop.height / 2 - extent,
    loop.width + 2 * extent,
    loop.height + 2 * extent,
  ].join(" ");

  return (
    <svg
      viewBox={viewBox}
      className={className}
      aria-hidden="true"
      focusable="false"
      data-draw={drawIn ? "" : undefined}
    >
      <g fill="none" className="stroke-mint">
        <g data-infield strokeOpacity={0.07} strokeWidth={0.8}>
          {e.infield.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g data-strands strokeOpacity={0.2} strokeWidth={0.7}>
          {e.strands.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g strokeWidth={1}>
          {e.laneLines.map((d, i) => (
            <path
              key={i}
              d={d}
              pathLength={1}
              data-lane-line=""
              style={{ "--i": i } as React.CSSProperties}
              strokeOpacity={i === 0 || i === lanes ? 0.55 : 0.35}
            />
          ))}
        </g>
      </g>
      <line
        x1={e.startLine.x1}
        y1={e.startLine.y1}
        x2={e.startLine.x2}
        y2={e.startLine.y2}
        className="stroke-dark-ink"
        strokeOpacity={0.5}
        strokeWidth={1.2}
      />
      <g className="fill-dark-muted font-mono" fontSize={10} textAnchor="middle">
        {e.laneNumbers.map((n) => (
          <text key={n.label} x={n.x} y={n.y + 3.5}>
            {n.label}
          </text>
        ))}
      </g>
      {dot === "loop" && (
        <PaceDot
          mode="loop"
          path={e.dotPath}
          start={e.start}
          restAt={e.start}
          delayMs={dotDelayMs}
        />
      )}
      {dot === "finish" && (
        <PaceDot
          mode="finish"
          path={e.finishPath}
          start={e.finishStart}
          restAt={e.start}
        />
      )}
    </svg>
  );
}
