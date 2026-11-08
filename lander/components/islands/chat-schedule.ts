export type ChatStep = {
  id: "deposit" | "ask" | "card" | "confirm" | "bought";
  /** ms from page load when the typing dots appear, or null for no dots. */
  typingAt: number | null;
  /** ms from page load when the message appears. */
  showAt: number;
};

const TYPING_MS = 450;

// The conversation plays once, finishing by about 5 s. Bot messages are
// preceded by typing dots; the user's messages just appear.
const STEPS: { id: ChatStep["id"]; showAt: number; bot: boolean }[] = [
  { id: "deposit", showAt: 1500, bot: true },
  { id: "ask", showAt: 2300, bot: false },
  { id: "card", showAt: 3200, bot: true },
  { id: "confirm", showAt: 4000, bot: false },
  { id: "bought", showAt: 4900, bot: true },
];

/** When each chat message appears. With reduced motion everything is shown at once. */
export function chatSchedule(reduced: boolean): ChatStep[] {
  return STEPS.map(({ id, showAt, bot }) =>
    reduced
      ? { id, typingAt: null, showAt: 0 }
      : { id, typingAt: bot ? showAt - TYPING_MS : null, showAt },
  );
}
