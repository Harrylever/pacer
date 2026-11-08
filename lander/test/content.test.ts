import { copy, LINKS } from "@/content/landing";
import { history } from "@/content/history";
import { formatNgn, formatPct, formatMonth } from "@/lib/format";

const all = JSON.stringify(copy);

test("links", () => {
  expect(LINKS.bot).toBe("https://t.me/pacerfinancebot");
  expect(LINKS.github).toBe("https://github.com/Harrylever/pacer");
});

test("real figures", () => {
  expect(formatNgn(history.results.usdc.endNgn)).toBe("₦49,027");
  expect(formatPct(history.results.usdc.maxDrawdownPct)).toBe("22.4%");
  expect(formatNgn(history.results.sp500.endNgn)).toBe("₦86,256");
  expect(formatPct(history.results.sp500.maxDrawdownPct)).toBe("19.8%");
  expect(formatNgn(history.results.naira.endNgn)).toBe("₦20,000");
  expect(history.months).toHaveLength(61);
  expect(formatMonth(history.months.at(-1)!.month)).toBe("Oct 2026");
  expect(formatMonth(history.months[0].month)).toBe("Oct 2021");
  expect(history.disclaimer).toBe(
    "Past performance. Not a prediction or a promise.",
  );
});

test("voice rules", () => {
  expect(all).not.toMatch(/!/);
  expect(all.toLowerCase()).not.toContain("nobody can take");
  expect(all).toContain("Next buy tomorrow");
  expect(all).toContain("We can't rush it, and we can't take it.");
  expect(all).toContain("Nobody can rush it. Only you can take it out.");
  expect(all).toContain("[Fees to be confirmed.]");
  expect(all).not.toMatch(/Thursday/);
  const advice = copy.faq.filter((f) => /advice|recommendation/i.test(f.q + f.a));
  expect(advice).toHaveLength(1);
  expect(advice[0].q).toBe("Is Pacer giving financial advice?");
  // and nowhere else on the page
  expect(all.match(/advice|recommendation/gi)).toHaveLength(1);
  expect(all.match(/don land/g)).toHaveLength(1);
});

test("shapes later tasks rely on", () => {
  expect(copy.chat.map((m) => m.id)).toEqual([
    "deposit",
    "ask",
    "card",
    "confirm",
    "bought",
  ]);
  expect(copy.how.steps).toHaveLength(3);
  expect(copy.safety.guarantees.map((g) => g.id)).toEqual(["out", "pace", "buy"]);
  expect(copy.faq).toHaveLength(6);
  expect(copy.tickers.items.map((t) => t.symbol)).toEqual(["AAPLx", "NVDAx", "SPYx"]);
  expect(copy.footer.comingSoon).toEqual([
    "Devpost (coming soon)",
    "Demo video (coming soon)",
  ]);
});

test("the AI agent is named where judges look, without hype", () => {
  expect(copy.hero.eyebrow).toBe("An AI agent for steady dollar savings");
  const pace = copy.how.steps[1].body;
  expect(pace).toContain("AI agent");
  expect(pace).toContain("plain words, in English or Pidgin");
  expect(pace).toContain("before anything happens");
  const buy = copy.safety.guarantees.find((g) => g.id === "buy")!;
  expect(buy.title).toBe("The AI agent can only buy.");
  expect(buy.body).toContain("can't withdraw, send or move your money");
  // the AI proposes and explains; it never picks or advises
  expect(all).not.toMatch(/AI-powered|AI picks|smart picks/i);
});
