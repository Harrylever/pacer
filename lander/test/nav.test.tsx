import { readFileSync } from "node:fs";
import { html } from "@/test/render";
import { Nav } from "@/components/sections/Nav";
import { Button } from "@/components/ui/Button";

test("nav links and CTA", () => {
  const out = html(<Nav />);
  for (const id of ["#how", "#safety", "#faq"]) {
    expect(out).toContain(`href="${id}"`);
  }
  expect(out).toContain('href="https://t.me/pacerfinancebot"');
  expect(out).toMatch(/aria-controls="menu-sheet"/);
  expect(out).toMatch(/aria-expanded="false"/);
  expect(out).toContain('id="menu-sheet"');
});

test("the menu sheet is a modal dialog and starts closed", () => {
  const out = html(<Nav />);
  expect(out).toMatch(/id="menu-sheet"[^>]*role="dialog"/);
  expect(out).toMatch(/id="menu-sheet"[^>]*aria-modal="true"/);
  expect(out).toMatch(/id="menu-sheet"[^>]*hidden/);
});

test("external buttons open safely, in-page buttons do not", () => {
  const ext = html(
    <Button href="https://t.me/pacerfinancebot" variant="primary" ground="dark">
      Go
    </Button>,
  );
  expect(ext).toContain('rel="noopener noreferrer"');
  const local = html(
    <Button href="#how" variant="secondary" ground="dark">
      See
    </Button>,
  );
  expect(local).not.toContain("rel=");
});

test("anchored sections clear the sticky bar", () => {
  const css = readFileSync("app/globals.css", "utf8");
  expect(css).toMatch(/section\[id\]\s*{[^}]*scroll-margin-top:\s*80px/);
});

test("the logo link is a full-size tap target", () => {
  const out = html(<Nav />);
  const link = out.match(/<a[^>]*aria-label="Pacer, back to top"[^>]*>/)![0];
  expect(link).toContain("min-h-11");
  expect(link).toContain("min-w-11");
});
