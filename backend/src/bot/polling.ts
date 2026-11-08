/**
 * Runs Telegram long polling. A 409 means another instance is already
 * polling: log one clear line and retry with backoff instead of a stack
 * trace loop. Stops when shouldContinue() goes false (shutdown).
 */
export async function pollWithBackoff(args: {
  start: () => Promise<void>;
  shouldContinue: () => boolean;
  onConflict: () => void;
  onError: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
  baseDelayMs?: number;
  maxDelayMs?: number;
}): Promise<void> {
  const sleep =
    args.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const base = args.baseDelayMs ?? 1000;
  const max = args.maxDelayMs ?? 30_000;
  let attempt = 0;
  while (args.shouldContinue()) {
    try {
      await args.start();
      return; // clean stop (bot.stop resolved the start promise)
    } catch (err) {
      if (!args.shouldContinue()) return;
      const message = err instanceof Error ? err.message : String(err);
      if (/409|conflict/i.test(message)) args.onConflict();
      else args.onError(message);
      await sleep(Math.min(base * 2 ** attempt, max));
      attempt++;
    }
  }
}
