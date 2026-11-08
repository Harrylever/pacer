import {
  engrave,
  loopPoint,
  offsetLoopPath,
  rosettePath,
  strandPath,
  type Loop,
} from "@/lib/guilloche";

const stadium: Loop = { cx: 600, cy: 400, width: 640, height: 392, radius: 196 };
const opts = {
  lanes: 4,
  laneWidth: 26,
  strandsPerLane: 4,
  waveLength: 36,
  infieldLines: 6,
  startT: 0.08,
};

test("loopPoint is continuous and closed", () => {
  const a = loopPoint(stadium, 0, 0);
  const b = loopPoint(stadium, 0.999999, 0);
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.5);
});

test("loopPoint has no jumps all the way round", () => {
  let prev = loopPoint(stadium, 0, 7);
  for (let i = 1; i <= 2000; i++) {
    const p = loopPoint(stadium, i / 2000, 7);
    expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(2);
    prev = p;
  }
});

test("offset moves outward", () => {
  const top = loopPoint(stadium, 0.1, 20);
  expect(top.y).toBeCloseTo(400 - 196 - 20, 5);
});

test("offsetLoopPath is a closed path with arcs", () => {
  const d = offsetLoopPath(stadium, 26);
  expect(d.startsWith("M")).toBe(true);
  expect(d.endsWith("Z")).toBe(true);
  expect(d.match(/A/g)).toHaveLength(4);
});

test("deterministic output", () => {
  const o = { center: 13, amplitude: 10, waves: 60, phase: 0.3 };
  expect(strandPath(stadium, o)).toBe(strandPath(stadium, o));
});

test("strand uses one q segment per half-wave and closes", () => {
  const d = strandPath(stadium, { center: 13, amplitude: 10, waves: 60, phase: 0 });
  expect(d.match(/q/g)).toHaveLength(120);
  expect(d.endsWith("Z")).toBe(true);
});

test("a hero engraving stays under 40 KB", () => {
  const e = engrave(stadium, opts);
  const bytes = [...e.laneLines, ...e.strands, ...e.infield, e.dotPath].join("")
    .length;
  expect(bytes).toBeLessThan(40_000);
  expect(e.laneLines).toHaveLength(5);
  expect(e.strands).toHaveLength(4);
  expect(e.infield).toHaveLength(6);
  expect(e.laneNumbers.map((n) => n.label)).toEqual(["1", "2", "3", "4"]);
  expect(e.start).toEqual(loopPoint(stadium, 0.08, 13));
});

test("the dot path starts at the origin so the dot can rest on the start line", () => {
  const e = engrave(stadium, opts);
  expect(e.dotPath.startsWith("M0 0")).toBe(true);
});

test("the finish path is the last quarter lap and ends on the start point", () => {
  const e = engrave(stadium, opts);
  expect(e.finishStart).toEqual(loopPoint(stadium, 0.08 + 0.75, 13));
  expect(e.finishPath.startsWith("M0 0")).toBe(true);
  // Sum the relative moves: they must land on start - finishStart.
  let x = 0;
  let y = 0;
  for (const m of e.finishPath.slice(4).split("l").filter(Boolean)) {
    const [dx, dy] = m.replace(/(\d)-/g, "$1 -").trim().split(/\s+/).map(Number);
    x += dx;
    y += dy;
  }
  expect(x).toBeCloseTo(e.start.x - e.finishStart.x, 0);
  expect(y).toBeCloseTo(e.start.y - e.finishStart.y, 0);
});

test("rosette closes", () => {
  const d = rosettePath({ cx: 0, cy: 0, radius: 200, petals: 24, amplitude: 18, phase: 0 });
  expect(d).toMatch(/Z$/);
  expect(d.match(/q/g)).toHaveLength(48);
});
