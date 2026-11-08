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
