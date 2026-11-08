import { readFileSync } from "node:fs";
import { html } from "@/test/render";
import { HowItWorks } from "@/components/sections/HowItWorks";

test("three steps in order with examples", () => {
  const out = html(<HowItWorks />);
  expect(out).toContain('id="how"');
  const titles = ["Deposit once.", "Set your pace.", "Pacer buys steadily."];
  const idx = titles.map((t) => out.indexOf(t));
  expect(idx.every((i) => i > -1)).toBe(true);
  expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  expect(out.match(/>Example</g)).toHaveLength(2);
  expect(out).toContain("₦2,100");
  expect(out).toContain("Pacer moves it into your vault straight away.");
  expect(out.match(/data-step="/g)).toHaveLength(3);
});

test("the weekly example invents no performance figures", () => {
  const text = html(<HowItWorks />).replace(/<[^>]*>/g, " ");
  expect(text).not.toMatch(/%|gain|profit|return/i);
});

test("reveal hides content only after the observer arms", () => {
  const css = readFileSync("app/globals.css", "utf8");
  expect(css).toMatch(/\.reveal-ready\s+\[data-reveal\]:not\(\[data-revealed\]\)/);
  expect(css).not.toMatch(/(^|\n)\s*\[data-reveal\]\s*{[^}]*opacity:\s*0/);
  // reduced motion always shows revealed content
  expect(css).toMatch(
    /prefers-reduced-motion[\s\S]*?\.reveal-ready\s+\[data-reveal\]:not\(\[data-revealed\]\)\s*{[^}]*opacity:\s*1/,
  );
});
