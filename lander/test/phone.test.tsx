import { html } from "@/test/render";
import { Phone } from "@/components/ui/Phone";

test("the phone looks like a modern iPhone", () => {
  const out = html(
    <Phone>
      <p>Hello</p>
    </Phone>,
  );
  expect(out).toContain("Hello");
  expect(out).toContain("9:41"); // the classic status bar time
  expect(out).toContain('data-part="island"'); // Dynamic Island
  expect(out).toContain('data-part="home-indicator"');
  expect(out.match(/data-part="side-button"/g)).toHaveLength(4); // action, volume x2, power
  for (const part of ["signal", "wifi", "battery"]) {
    expect(out).toContain(`data-part="${part}"`);
  }
});

test("the device chrome is decorative and out of the reading order", () => {
  const out = html(
    <Phone>
      <p>Hello</p>
    </Phone>,
  );
  // every chrome element is aria-hidden; only the children are readable
  expect(
    out.match(
      /data-part="[^"]+"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*data-part="[^"]+"/g,
    )!.length,
  ).toBeGreaterThanOrEqual(8);
});

test("the status bar can match a white chat header", () => {
  const raised = html(<Phone statusTone="raised">x</Phone>);
  const plain = html(<Phone>x</Phone>);
  expect(raised).toContain("bg-surface-raised");
  expect(plain).not.toMatch(/data-part="status-bar"[^>]*bg-surface-raised/);
});
