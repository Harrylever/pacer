import { readFileSync } from "node:fs";
import { html } from "@/test/render";
import { Faq } from "@/components/sections/Faq";
import { Footer } from "@/components/sections/Footer";
import { FinalCta } from "@/components/sections/FinalCta";
import { Nigeria } from "@/components/sections/Nigeria";
import { Tickers } from "@/components/sections/Tickers";

test("faq: six exclusive items with the fee placeholder", () => {
  const out = html(<Faq />);
  expect(out).toContain('id="faq"');
  expect(out.match(/<details name="faq"/g)).toHaveLength(6);
  expect(out).toContain("[Fees to be confirmed.]");
  expect(out).toContain("freeze or reclaim");
  expect(out.match(/<summary/g)).toHaveLength(6);
});

test("faq opens smoothly only where the browser supports it", () => {
  const css = readFileSync("app/globals.css", "utf8");
  expect(css).toMatch(/@supports\s*\(interpolate-size:\s*allow-keywords\)/);
  expect(css).toMatch(/details::details-content/);
});

test("footer: coming-soon items are not links, the demo video is", () => {
  const out = html(<Footer />);
  expect(out).not.toMatch(/<a[^>]*>[^<]*Devpost/);
  expect(out).toContain("Devpost (coming soon)");
  expect(out).toContain('href="https://youtu.be/RJH9i2106_U"');
  // Demo video sits in the link list under Telegram bot and GitHub.
  const order = [
    out.indexOf("https://t.me/pacerfinancebot"),
    out.indexOf("https://github.com/Harrylever/pacer"),
    out.indexOf("https://youtu.be/RJH9i2106_U"),
  ];
  expect(order[0]).toBeGreaterThan(-1);
  expect(order[1]).toBeGreaterThan(order[0]);
  expect(order[2]).toBeGreaterThan(order[1]);
  expect(out).toContain('href="https://github.com/Harrylever/pacer"');
  expect(out).toContain('href="https://t.me/pacerfinancebot"');
  expect(out).toContain("Not available to US users.");
  expect(out).toContain("MLH Solana Hackathon");
});

test("final CTA goes to the bot and finishes the lap", () => {
  const out = html(<FinalCta />);
  expect(out).toContain('href="https://t.me/pacerfinancebot"');
  expect(out).toContain('dur="3.5s"');
  expect(out).toContain('fill="freeze"');
  expect(out).toContain("Start with what you already hold.");
});

test("tickers, no company logos", () => {
  const out = html(<Tickers />);
  for (const s of ["AAPLx", "NVDAx", "SPYx"]) expect(out).toContain(s);
  expect(out).not.toMatch(/<img/);
  expect(out).toContain("Tokenized stocks on Solana that track the share price.");
});

test("the Nigeria band reads the brief's headline and stays decorative", () => {
  const out = html(<Nigeria />);
  expect(out).toContain("Built first for Nigerians");
  expect(out).toMatch(/<svg[^>]*aria-hidden="true"/);
});
