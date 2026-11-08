import { html } from "@/test/render";
import PrivacyPage from "@/app/privacy/page";
import { Footer } from "@/components/sections/Footer";

test("privacy page says what is collected and what never is", () => {
  const out = html(<PrivacyPage />);
  expect(out).toContain("Privacy");
  expect(out).toContain("no cookies");
  expect(out).toContain("Telegram user ID");
  expect(out).toContain("public blockchain records");
  expect(out).toContain("never sell");
  expect(out).toContain("seed phrase");
  expect(out).not.toContain("financial advice or a promise");
});

test("footer links to the privacy page", () => {
  const out = html(<Footer />);
  expect(out).toContain('href="/privacy"');
  expect(out).toContain("Privacy");
});
