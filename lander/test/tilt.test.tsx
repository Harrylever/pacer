import { readFileSync } from "node:fs";
import { html } from "@/test/render";
import { MAX_TILT_DEG, tiltFor } from "@/lib/tilt";
import { TiltOnPointer } from "@/components/islands/TiltOnPointer";

const viewport = { width: 1440, height: 800 };
const center = { x: 720, y: 400 };

test("a pointer on the phone's centre means no tilt", () => {
  expect(tiltFor(center, center, viewport)).toEqual({ rx: 0, ry: 0 });
});

test("the phone turns to face the pointer", () => {
  // pointer to the right: the face turns right (positive rotateY)
  expect(tiltFor({ x: 1400, y: 400 }, center, viewport).ry).toBeGreaterThan(0);
  expect(tiltFor({ x: 40, y: 400 }, center, viewport).ry).toBeLessThan(0);
  // pointer above: the face turns up (positive rotateX); below: down
  expect(tiltFor({ x: 720, y: 20 }, center, viewport).rx).toBeGreaterThan(0);
  expect(tiltFor({ x: 720, y: 780 }, center, viewport).rx).toBeLessThan(0);
});

test("the tilt is slight and never exceeds the maximum", () => {
  expect(MAX_TILT_DEG).toBeLessThanOrEqual(6);
  const far = tiltFor({ x: -5000, y: 9000 }, center, viewport);
  expect(Math.abs(far.ry)).toBeLessThanOrEqual(MAX_TILT_DEG);
  expect(Math.abs(far.rx)).toBeLessThanOrEqual(MAX_TILT_DEG);
  const edge = tiltFor({ x: 0, y: 400 }, center, viewport);
  expect(edge.ry).toBeCloseTo(-MAX_TILT_DEG, 5);
});

test("odd viewports never produce NaN", () => {
  const t = tiltFor({ x: 10, y: 10 }, center, { width: 0, height: 0 });
  expect(Number.isFinite(t.rx) && Number.isFinite(t.ry)).toBe(true);
});

test("the wrapper renders its children, untilted, with no JavaScript", () => {
  const out = html(
    <TiltOnPointer>
      <p>Phone</p>
    </TiltOnPointer>,
  );
  expect(out).toContain("Phone");
  expect(out).toContain("tilt-stage");
  expect(out).not.toMatch(/rotate[XY]\(/);
});

test("reduced motion cancels the tilt in CSS as well as in code", () => {
  const css = readFileSync("app/globals.css", "utf8");
  expect(css).toMatch(/perspective:\s*1100px/);
  expect(css).toMatch(
    /prefers-reduced-motion[\s\S]*?\.tilt-inner\s*{[^}]*transform:\s*none\s*!important/,
  );
});
