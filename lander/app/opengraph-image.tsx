import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { engrave } from "@/lib/guilloche";

export const alt = "Pacer: Save at your pace";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// This file can't read CSS variables, so the brand colours are written out
// here (the only place outside tokens.css that does).
const DEEP = "#0E1513";
const MINT = "#3FCB9B";
const INK = "#E9EFEC";
const MUTED = "#9AA7A2";
const AMBER = "#E8A33D";

export default async function Image() {
  const lockup = await readFile(
    join(process.cwd(), "public/brand/pacer-lockup-dark.svg"),
  );
  const lockupUri = `data:image/svg+xml;base64,${lockup.toString("base64")}`;

  // The track, bleeding off the right edge, with the dot resting on its start line.
  const loop = { cx: 840, cy: 330, width: 560, height: 360, radius: 180 };
  const e = engrave(loop, {
    lanes: 4,
    laneWidth: 26,
    strandsPerLane: 2,
    waveLength: 36,
    infieldLines: 5,
    startT: 0.1,
  });

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: DEEP,
        color: INK,
      }}
    >
      <svg
        width={1200}
        height={630}
        viewBox="0 0 1200 630"
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        <g fill="none" stroke={MINT}>
          {e.infield.map((d, i) => (
            <path key={`i${i}`} d={d} strokeOpacity={0.12} strokeWidth={1} />
          ))}
          {e.strands.map((d, i) => (
            <path key={`s${i}`} d={d} strokeOpacity={0.3} strokeWidth={1} />
          ))}
          {e.laneLines.map((d, i) => (
            <path
              key={`l${i}`}
              d={d}
              strokeOpacity={i === 0 || i === 4 ? 0.8 : 0.5}
              strokeWidth={1.5}
            />
          ))}
        </g>
        <circle
          cx={e.start.x}
          cy={e.start.y}
          r={14}
          fill={AMBER}
          fillOpacity={0.2}
        />
        <circle cx={e.start.x} cy={e.start.y} r={8} fill={AMBER} />
      </svg>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          width: 640,
          height: "100%",
          position: "relative",
        }}
      >
        <img src={lockupUri} width={210} height={70} alt="" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 108,
              lineHeight: 1,
              letterSpacing: -3,
            }}
          >
            Save at
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 108,
              lineHeight: 1.05,
              letterSpacing: -3,
            }}
          >
            your&nbsp;
            <span style={{ color: MINT, fontStyle: "italic" }}>pace.</span>
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 28,
              color: MUTED,
            }}
          >
            Dollar savings, invested steadily
          </div>
        </div>
      </div>
    </div>,
    { ...size },
  );
}
