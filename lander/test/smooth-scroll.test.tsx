import { readFileSync } from "node:fs";
import { html } from "@/test/render";
import { LENIS_OPTIONS } from "@/lib/smooth-scroll";
import { SmoothScroll } from "@/components/islands/SmoothScroll";

test("anchor jumps leave the gap to CSS, so it is never counted twice", () => {
  // Lenis subtracts the target's scroll-margin-top itself; an extra offset
  // here would double the gap (it did: headings landed 160 px down).
  expect(LENIS_OPTIONS.anchors).toBe(true);
  const css = readFileSync("app/globals.css", "utf8");
  expect(css).toMatch(/section\[id\]\s*{[^}]*scroll-margin-top:\s*80px/);
  const nav = readFileSync("components/islands/NavBar.tsx", "utf8");
  expect(nav).not.toMatch(/scrollTo\([^)]*offset/);
});

test("touch keeps native scrolling, and Lenis drives its own frames", () => {
  expect(LENIS_OPTIONS.syncTouch).toBe(false);
  expect(LENIS_OPTIONS.autoRaf).toBe(true);
  expect(LENIS_OPTIONS.respectReducedMotion).toBe(true);
});

test("CSS smooth scrolling steps aside while Lenis runs", () => {
  const css = readFileSync("app/globals.css", "utf8");
  expect(css).toMatch(/html\.lenis\s*{[^}]*scroll-behavior:\s*auto/);
  expect(readFileSync("app/layout.tsx", "utf8")).toContain(
    'import "lenis/dist/lenis.css"',
  );
});

test("the island renders nothing", () => {
  expect(html(<SmoothScroll />)).toBe("");
});

test("lenis is loaded on demand, out of the first-load bundle", () => {
  const src = readFileSync("components/islands/SmoothScroll.tsx", "utf8");
  expect(src).toContain('import("lenis")');
  expect(src).not.toMatch(/^import Lenis from/m);
});

test("the hero entrance is CSS, with no motion library", () => {
  const src = readFileSync("components/islands/HeroSequence.tsx", "utf8");
  expect(src).not.toContain("motion/react");
  expect(src).not.toMatch(/from\s+"motion/);
  const css = readFileSync("app/globals.css", "utf8");
  expect(css).toContain(".hero-rise");
  expect(css).toMatch(/@keyframes hero-rise/);
});
