import { readFileSync } from "node:fs";
import { html } from "@/test/render";
import { Safety } from "@/components/sections/Safety";
import { Vault } from "@/components/engraving/Vault";

test("each guarantee has a matching path and the honest note", () => {
  const out = html(<Safety />);
  expect(out).toContain('id="safety"');
  expect(out).toContain("Nobody can rush it. Only you can take it out.");
  for (const id of ["out", "pace", "buy"]) {
    expect(out).toContain(`data-guarantee="${id}"`);
    expect(out).toContain(`data-path="${id}"`);
  }
  expect(out).toContain("freeze or reclaim");
  expect(out).toContain('href="https://github.com/Harrylever/pacer"');
  expect(out).toContain("Your wallet");
  expect(out).toContain("Your Pacer");
  expect(out).toContain("address");
  expect(out).toContain("Stocks you picked");
});

test("there is exactly one way out", () => {
  const out = html(<Vault />);
  // one drawn way out (its label shares the attribute so it lights up too)
  expect(out.match(/<g[^>]*data-path="out"/g)).toHaveLength(1);
  expect(out).toMatch(/<svg[^>]*aria-hidden="true"/);
});

test("the guarantees can be reached by keyboard", () => {
  const out = html(<Safety />);
  expect(out.match(/data-guarantee="[a-z]+"[^>]*tabindex="0"|tabindex="0"[^>]*data-guarantee/g)).toHaveLength(3);
});

test("highlighting is CSS-only and covers focus as well as hover", () => {
  const css = readFileSync("app/globals.css", "utf8");
  for (const id of ["out", "pace", "buy"]) {
    expect(css).toMatch(
      new RegExp(`\\[data-guarantee="${id}"\\]:is\\(:hover,\\s*:focus-visible\\)[\\s\\S]*?\\[data-path="${id}"\\]`),
    );
  }
});
