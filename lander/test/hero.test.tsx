import { readFileSync } from "node:fs";
import { html } from "@/test/render";
import { Hero } from "@/components/sections/Hero";
import { chatSchedule } from "@/components/islands/chat-schedule";

const strip = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

test("hero content and CTAs are in the server HTML", () => {
  const out = html(<Hero />);
  const h1 = out.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)![1];
  expect(strip(h1)).toBe("Save at your pace.");
  expect(h1).toMatch(/<em[^>]*>pace\.<\/em>/);
  expect(out).toContain("We can&#x27;t rush it, and we can&#x27;t take it.");
  expect(out).toContain('href="https://t.me/pacerfinancebot"');
  expect(out).toContain('href="#how"');
  expect(out).toContain("Not available to US users.");
  for (const line of [
    "Your $10 don land.",
    "Next buy tomorrow.",
    "Confirm",
    "Cancel",
  ]) {
    expect(out).toContain(line);
  }
});

test("exactly one h1, and the chat is not a second heading", () => {
  const out = html(<Hero />);
  expect(out.match(/<h1/g)).toHaveLength(1);
});

test("chat schedule", () => {
  const s = chatSchedule(false);
  expect(s.map((x) => x.id)).toEqual([
    "deposit",
    "ask",
    "card",
    "confirm",
    "bought",
  ]);
  expect(s[0].showAt).toBe(1500);
  expect(s.at(-1)!.showAt).toBeLessThanOrEqual(5000);
  expect(s.filter((x) => x.typingAt !== null).map((x) => x.id)).toEqual([
    "deposit",
    "card",
    "bought",
  ]);
  for (const x of s.filter((x) => x.typingAt !== null)) {
    expect(x.showAt - x.typingAt!).toBe(450);
  }
  expect(
    chatSchedule(true).every((x) => x.showAt === 0 && x.typingAt === null),
  ).toBe(true);
});

test("chat messages are laid out before they play, so nothing shifts", () => {
  const out = html(<Hero />);
  expect(out.match(/chat-msg/g)!.length).toBe(5);
  expect(out.match(/chat-typing/g)!.length).toBe(3);
});

test("headline never overflows small phones", () => {
  const css = readFileSync("app/globals.css", "utf8");
  expect(css).toMatch(/clamp\(56px,\s*15vw,\s*112px\)/);
});

test("hero content can never stay hidden", () => {
  const css = readFileSync("app/globals.css", "utf8");
  // safety net after 3 s, and an override for reduced motion
  expect(css).toMatch(/\.hero-pre\s*{[^}]*animation:\s*hero-safety[^;]*3s/);
  expect(css).toMatch(
    /prefers-reduced-motion[^{]*{[^}]*\.hero-pre[^}]*opacity:\s*1\s*!important/,
  );
  const layout = readFileSync("app/layout.tsx", "utf8");
  expect(layout).toContain("<noscript>");
});

test("the hero fills the screen height, with a floor for short screens", () => {
  const out = html(<Hero />);
  expect(out).toContain("min-h-svh");
  expect(out).toContain("lg:min-h-[max(100svh,720px)]");
});
