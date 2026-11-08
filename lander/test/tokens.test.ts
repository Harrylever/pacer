import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio } from "@/lib/contrast";

const css = readFileSync("app/tokens.css", "utf8");
const v = (name: string) =>
  css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))![1];

test("every text pair meets AA", () => {
  const pairs: [string, string, number][] = [
    ["ink", "surface", 4.5],
    ["ink-muted", "surface", 4.5],
    ["accent-ink", "surface", 4.5],
    ["primary", "surface", 4.5],
    ["on-primary", "primary", 4.5],
    ["dark-ink", "primary-deep", 4.5],
    ["dark-muted", "primary-deep", 4.5],
    ["mint", "primary-deep", 4.5],
    ["primary-deep", "mint", 4.5],
    ["dark-ink", "primary", 4.5],
    ["band-muted", "primary", 4.5],
    ["border-control", "surface", 3],
    ["gain", "surface", 4.5],
    ["loss", "surface", 4.5],
    ["dark-gain", "primary-deep", 4.5],
    ["dark-loss", "primary-deep", 4.5],
  ];
  for (const [fg, bg, min] of pairs) {
    expect(
      contrastRatio(v(fg), v(bg)),
      `${fg} on ${bg}`,
    ).toBeGreaterThanOrEqual(min);
  }
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

test("no hex colour outside the token file and the OG image", () => {
  const files = [
    ...walk("components"),
    ...walk("app").filter((f) => !f.endsWith("opengraph-image.tsx")),
  ];
  const offenders = files.filter((f) =>
    /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/i.test(
      readFileSync(f, "utf8"),
    ),
  );
  expect(offenders).toEqual([]);
});
