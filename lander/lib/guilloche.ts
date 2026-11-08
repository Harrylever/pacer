/**
 * Guilloche engraving generator: the fine interlaced lines banknotes use,
 * drawn here around a running track. Pure and deterministic (same input,
 * same output), so it runs on the server and ships static SVG.
 *
 * A Loop is a rounded rectangle (a stadium when radius === height / 2).
 * Positions on it are a fraction t of the perimeter, clockwise from the
 * top-left end of the top straight, plus an offset along the outward normal.
 */
export type Loop = {
  cx: number;
  cy: number;
  width: number;
  height: number;
  radius: number;
};

export type Point = { x: number; y: number };

const TAU = Math.PI * 2;

function segments(loop: Loop) {
  const r = loop.radius;
  const straightX = loop.width - 2 * r;
  const straightY = loop.height - 2 * r;
  const quarter = (Math.PI * r) / 2;
  // top, top-right arc, right, bottom-right arc, bottom, bottom-left arc,
  // left, top-left arc
  const lens = [straightX, quarter, straightY, quarter, straightX, quarter, straightY, quarter];
  return { r, lens, total: lens.reduce((a, b) => a + b, 0) };
}

export function loopPerimeter(loop: Loop, offset = 0): number {
  return segments(loop).total + TAU * offset;
}

export function loopPoint(loop: Loop, t: number, offset: number): Point {
  const { r, lens, total } = segments(loop);
  const left = loop.cx - loop.width / 2;
  const right = loop.cx + loop.width / 2;
  const top = loop.cy - loop.height / 2;
  const bottom = loop.cy + loop.height / 2;

  let s = (((t % 1) + 1) % 1) * total;
  let seg = 0;
  while (seg < 7 && s >= lens[seg]) {
    s -= lens[seg];
    seg++;
  }

  let x: number;
  let y: number;
  let nx: number;
  let ny: number;
  const arc = (centerX: number, centerY: number, start: number) => {
    const a = start + s / r;
    nx = Math.cos(a);
    ny = Math.sin(a);
    x = centerX + r * nx;
    y = centerY + r * ny;
  };
  switch (seg) {
    case 0:
      x = left + r + s;
      y = top;
      nx = 0;
      ny = -1;
      break;
    case 1:
      arc(right - r, top + r, -Math.PI / 2);
      break;
    case 2:
      x = right;
      y = top + r + s;
      nx = 1;
      ny = 0;
      break;
    case 3:
      arc(right - r, bottom - r, 0);
      break;
    case 4:
      x = right - r - s;
      y = bottom;
      nx = 0;
      ny = 1;
      break;
    case 5:
      arc(left + r, bottom - r, Math.PI / 2);
      break;
    case 6:
      x = left;
      y = bottom - r - s;
      nx = -1;
      ny = 0;
      break;
    default:
      arc(left + r, top + r, Math.PI);
  }
  return { x: x! + nx! * offset, y: y! + ny! * offset };
}

/** One decimal, no trailing zero, no leading zero: "-0.5" becomes "-.5". */
function num(v: number): string {
  return (Math.round(v * 10) / 10).toString().replace(/^(-?)0\./, "$1.");
}

/** Joins numbers with a space, except before a minus sign. */
function join(...values: number[]): string {
  let out = "";
  for (const v of values) {
    const s = num(v);
    out += out && !s.startsWith("-") ? ` ${s}` : s;
  }
  return out;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Exact closed outline of the loop grown by `offset` (negative shrinks). */
export function offsetLoopPath(loop: Loop, offset: number): string {
  const w = loop.width + 2 * offset;
  const h = loop.height + 2 * offset;
  if (w <= 0 || h <= 0) return "";
  const r = Math.max(0, loop.radius + offset);
  const x0 = loop.cx - w / 2;
  const x1 = loop.cx + w / 2;
  const y0 = loop.cy - h / 2;
  const y1 = loop.cy + h / 2;
  const arc = (x: number, y: number) => `A${join(r, r)} 0 0 1 ${join(x, y)}`;
  return (
    `M${join(x0 + r, y0)}H${num(x1 - r)}${arc(x1, y0 + r)}` +
    `V${num(y1 - r)}${arc(x1 - r, y1)}` +
    `H${num(x0 + r)}${arc(x0, y1 - r)}` +
    `V${num(y0 + r)}${arc(x0 + r, y0)}Z`
  );
}

/**
 * Walks a sine-modulated curve from zero crossing to zero crossing, one
 * quadratic segment per half-wave, using rounded absolute positions so
 * rounding never drifts. `at(u, lateral)` maps a position along the curve
 * and a sideways displacement to a point.
 */
function wavePath(
  waves: number,
  phase: number,
  amplitude: number,
  at: (u: number, lateral: number) => Point,
): string {
  const firstCrossing = Math.ceil(phase / Math.PI - 1e-9);
  const uAt = (k: number) => (k * Math.PI - phase) / (TAU * waves);
  const start = at(uAt(firstCrossing), 0);
  let px = round1(start.x);
  let py = round1(start.y);
  let d = `M${join(px, py)}`;
  for (let i = 0; i < 2 * waves; i++) {
    const k = firstCrossing + i;
    const a = uAt(k);
    const b = uAt(k + 1);
    const sign = (((k % 2) + 2) % 2 === 0 ? 1 : -1) as 1 | -1;
    const control = at((a + b) / 2, sign * 2 * amplitude);
    const end = at(b, 0);
    const cx = round1(control.x);
    const cy = round1(control.y);
    const ex = round1(end.x);
    const ey = round1(end.y);
    d += `q${join(cx - px, cy - py, ex - px, ey - py)}`;
    px = ex;
    py = ey;
  }
  return `${d}Z`;
}

export function strandPath(
  loop: Loop,
  o: { center: number; amplitude: number; waves: number; phase: number },
): string {
  return wavePath(o.waves, o.phase, o.amplitude, (u, lateral) =>
    loopPoint(loop, u, o.center + lateral),
  );
}

export function rosettePath(o: {
  cx: number;
  cy: number;
  radius: number;
  petals: number;
  amplitude: number;
  phase: number;
}): string {
  // Widen the control radius so the curve, not its chord, sits on the circle.
  const widen = 1 / Math.cos(Math.PI / (2 * o.petals));
  return wavePath(o.petals, o.phase, o.amplitude, (u, lateral) => {
    const theta = u * TAU;
    const rad = lateral === 0 ? o.radius : o.radius * widen + lateral;
    return { x: o.cx + rad * Math.cos(theta), y: o.cy + rad * Math.sin(theta) };
  });
}

/**
 * A polyline along the loop from `t0` for `span` of a lap, as relative
 * moves from its own first point (so it starts "M0 0"). Uses rounded
 * absolute positions so rounding never drifts.
 */
function relativeRun(loop: Loop, t0: number, span: number, steps: number, offset: number): string {
  const first = loopPoint(loop, t0, offset);
  let d = "M0 0";
  let px = 0;
  let py = 0;
  for (let i = 1; i <= steps; i++) {
    const p = loopPoint(loop, t0 + (span * i) / steps, offset);
    const x = round1(p.x - first.x);
    const y = round1(p.y - first.y);
    d += `l${join(x - px, y - py)}`;
    px = x;
    py = y;
  }
  return d;
}

export type Engraving = {
  laneLines: string[];
  /** One combined path per lane. */
  strands: string[];
  infield: string[];
  /** Centre of lane 1, relative to `start`, so a dot drawn at `start` can follow it. */
  dotPath: string;
  start: Point;
  /** Where the final quarter of the lap begins, and the path from there back to `start`. */
  finishStart: Point;
  finishPath: string;
  startLine: { x1: number; y1: number; x2: number; y2: number };
  laneNumbers: { x: number; y: number; label: string }[];
};

export function engrave(
  loop: Loop,
  o: {
    lanes: number;
    laneWidth: number;
    strandsPerLane: number;
    waveLength: number;
    infieldLines: number;
    startT: number;
  },
): Engraving {
  const laneLines: string[] = [];
  for (let i = 0; i <= o.lanes; i++) laneLines.push(offsetLoopPath(loop, i * o.laneWidth));

  const strands: string[] = [];
  for (let i = 0; i < o.lanes; i++) {
    const center = i * o.laneWidth + o.laneWidth / 2;
    const waves = Math.round(loopPerimeter(loop, center) / o.waveLength);
    let lane = "";
    for (let j = 0; j < o.strandsPerLane; j++) {
      lane += strandPath(loop, {
        center,
        amplitude: 0.4 * o.laneWidth,
        waves,
        phase: (j * TAU) / o.strandsPerLane,
      });
    }
    strands.push(lane);
  }

  const infield: string[] = [];
  for (let k = 1; k <= o.infieldLines; k++) {
    const path = offsetLoopPath(loop, -14 * k);
    if (path) infield.push(path);
  }

  const laneCentre = o.laneWidth / 2;
  const start = loopPoint(loop, o.startT, laneCentre);
  const dotPath = relativeRun(loop, o.startT, 1, 240, laneCentre);
  const finishStart = loopPoint(loop, o.startT + 0.75, laneCentre);
  const finishPath = relativeRun(loop, o.startT + 0.75, 0.25, 60, laneCentre);

  const a = loopPoint(loop, o.startT, 0);
  const b = loopPoint(loop, o.startT, o.lanes * o.laneWidth);
  const laneNumbers = Array.from({ length: o.lanes }, (_, i) => {
    const center = i * o.laneWidth + o.laneWidth / 2;
    const p = loopPoint(loop, o.startT - 14 / loopPerimeter(loop, center), center);
    return { x: p.x, y: p.y, label: String(i + 1) };
  });

  return {
    laneLines,
    strands,
    infield,
    dotPath,
    start,
    finishStart,
    finishPath,
    startLine: { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
    laneNumbers,
  };
}
