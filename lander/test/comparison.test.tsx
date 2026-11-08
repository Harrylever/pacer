import { html } from "@/test/render";
import { Comparison } from "@/components/sections/Comparison";

test("rows show value and worst drop; disclaimer sits by the chart", () => {
  const out = html(<Comparison />);
  for (const s of ["₦20,000", "₦49,027", "22.4%", "₦86,256", "19.8%"]) {
    expect(out).toContain(s);
  }
  expect(out.match(/Worst drop/g)!.length).toBe(3);
  expect(out).toContain("Past performance. Not a prediction or a promise.");
  expect(out).toContain("parallel-market rate");
  expect(out).toContain("What ₦20,000 would have become");
});

test("the chart is operable and has a text equivalent", () => {
  const out = html(<Comparison />);
  expect(out).toMatch(/role="slider"[^>]*aria-valuenow="60"/);
  expect(out).toMatch(/aria-valuetext="Oct 2026: /);
  expect(out).toContain("tabindex=\"0\"");
  // header row + 61 months
  expect(out.match(/<tr/g)!.length).toBe(62);
});

test("a drop is always a drop: marked with the arrow and a minus sign", () => {
  const out = html(<Comparison />);
  expect(out).toContain("▼ −22.4%");
  expect(out).toContain("▼ −19.8%");
});

test("a row that never dropped says 0%, with no arrow", () => {
  const out = html(<Comparison />);
  expect(out).not.toContain("▼ −0");
  expect(out).toMatch(/Worst drop[^<]*<span[^>]*>0%<\/span>/);
});

test("the data table is clipped by a wrapper, so it can never widen the page", () => {
  const out = html(<Comparison />);
  expect(out).toMatch(/<div class="sr-only"><table/);
  expect(out).not.toMatch(/<table class="sr-only"/);
});
