import { chartGeometry, indexFromPointer, stepIndex } from "@/lib/chart";
import { history } from "@/content/history";

const size = { width: 300, height: 200, pad: 10 };
const r1 = (v: number) => String(Math.round(v * 10) / 10);

test("geometry spans the box and starts every line at ₦20,000", () => {
  const g = chartGeometry(history.months, size);
  expect(g.x(0)).toBe(10);
  expect(g.x(60)).toBe(290);
  expect(g.maxNgn).toBe(90_000);
  for (const key of ["naira", "usdc", "sp500"] as const) {
    expect(g.paths[key].startsWith(`M10 ${r1(g.y(20_000))}`)).toBe(true);
  }
  // higher values sit higher on screen
  expect(g.y(86_256)).toBeLessThan(g.y(20_000));
});

test("the naira line is flat", () => {
  const g = chartGeometry(history.months, size);
  const ys = new Set(
    history.months.map((m) => r1(g.y(m.naira))),
  );
  expect(ys.size).toBe(1);
});

test("pointer clamps to the months", () => {
  expect(indexFromPointer(-50, 300, 10, 61)).toBe(0);
  expect(indexFromPointer(10_000, 300, 10, 61)).toBe(60);
  expect(indexFromPointer(150, 300, 10, 61)).toBe(30);
  expect(indexFromPointer(Number.NaN, 300, 10, 61)).toBe(60);
});

test("keys step and clamp", () => {
  expect(stepIndex("ArrowLeft", 0, 61)).toBe(0);
  expect(stepIndex("ArrowRight", 60, 61)).toBe(60);
  expect(stepIndex("ArrowRight", 5, 61)).toBe(6);
  expect(stepIndex("ArrowDown", 5, 61)).toBe(4);
  expect(stepIndex("ArrowUp", 5, 61)).toBe(6);
  expect(stepIndex("Home", 33, 61)).toBe(0);
  expect(stepIndex("End", 3, 61)).toBe(60);
  expect(stepIndex("a", 7, 61)).toBe(7);
});
