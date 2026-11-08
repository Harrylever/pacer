import { html } from "@/test/render";
import { Track } from "@/components/engraving/Track";
import { Rosette } from "@/components/engraving/Rosette";
import { LaneDivider } from "@/components/engraving/LaneDivider";
import { engrave } from "@/lib/guilloche";

const loop = { cx: 600, cy: 400, width: 640, height: 392, radius: 196 };
const r1 = (v: number) => String(Math.round(v * 10) / 10);

test("track is decorative and within budget", () => {
  const out = html(<Track loop={loop} laneWidth={26} dot="loop" />);
  expect(out).toMatch(/<svg[^>]*aria-hidden="true"/);
  expect(out.length).toBeLessThan(44_000);
});

test("the dot rests on the start line until an island starts it", () => {
  const out = html(<Track loop={loop} laneWidth={26} dot="loop" />);
  expect(out).toContain('begin="indefinite"');
  const { start } = engrave(loop, {
    lanes: 4,
    laneWidth: 26,
    strandsPerLane: 4,
    waveLength: 36,
    infieldLines: 6,
    startT: 0.08,
  });
  expect(out).toContain(`cx="${r1(start.x)}"`);
  expect(out).toContain(`cy="${r1(start.y)}"`);
  expect(out).toContain('dur="14s"');
  expect(out).toContain('repeatCount="indefinite"');
});

test("finish mode runs the last quarter once, at the same speed", () => {
  const out = html(<Track loop={loop} laneWidth={26} dot="finish" />);
  expect(out).toContain('dur="3.5s"');
  expect(out).toContain('fill="freeze"');
  expect(out).not.toContain("repeatCount");
});

test("no dot when asked for none", () => {
  const out = html(<Track loop={loop} laneWidth={26} dot="none" />);
  expect(out).not.toContain("animateMotion");
});

test("draw-in marks every lane line", () => {
  const out = html(<Track loop={loop} laneWidth={26} dot="none" drawIn />);
  expect(out.match(/data-lane-line/g)).toHaveLength(5);
  expect(out).toContain("data-draw");
});

test("rosette and dividers are decorative", () => {
  expect(html(<Rosette />)).toMatch(/aria-hidden="true"/);
  expect(html(<LaneDivider />)).toMatch(/aria-hidden="true"/);
});
