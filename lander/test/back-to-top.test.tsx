import { BackToTop } from "@/components/islands/BackToTop";
import { html } from "./render";

test("renders a back-to-top button that starts hidden and unfocusable", () => {
  const out = html(<BackToTop />);
  expect(out).toMatch(/<button[^>]*aria-label="Back to top"/);
  expect(out).toMatch(/aria-hidden="true"/);
  expect(out).toMatch(/tabindex="-1"/);
  expect(out).toMatch(/pointer-events-none/);
});
