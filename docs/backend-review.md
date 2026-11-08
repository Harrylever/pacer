# Backend review (Nov 4, 2026)

This is a review of the backend Muse Wonder 1.0 wrote in `backend/`, done by Claude (Opus 5.5). The baseline is commit `d79fb73`; every fix after it is its own commit. Test count went from 47 to 69. The app now builds and starts against the real `.env` and local Postgres.

## What was already good

- **One interface to the vault (`VaultClient`).** It has no keeper withdraw method, and the withdraw methods take no destination argument.
- **Every action needs a Confirm tap, once, by its own user.** LLM output is validated with zod before anything is built.
- **The price updater follows the spec.** It publishes `usdPricePrescaled`, never `usdPrice`, and uses u128-style slippage maths with 8 decimals.
- **Signing keys can't leak through config.** `AppConfig` carries public keys only.

## Fixed

| # | Problem | Effect if not fixed | Commit |
| --- | --- | --- | --- |
| 1 | The keeper read the stored on-chain `allowance`, which only grows inside `settle()` | **The agent never buys.** The fake client hid it, because tests set the allowance by hand | `88be002` |
| 2 | An equal split could fall below `min_trade`; unknown decimals defaulted to 8; ticks could overlap | Buys rejected over and over (wasted fees), or wrong maths for a 6-decimal mint | `88be002` |
| 3 | "Withdraw everything" sent one transaction per mint, scanned only the chosen mints, and didn't pause | Breaks the spec's single-transaction demo; stocks dropped from a plan are stranded | `241fd1f` |
| 4 | Pasting any Solana address replaced the withdrawal address, with no confirmation | The bot could show an address different from the on-chain one | `241fd1f` |
| 5 | A failed confirmed action replied "Nothing to confirm" | Users never learn a transaction failed | `241fd1f` |
| 6 | The deposit sweep and price refresh were never scheduled | **Deposits never reach the vault; prices go stale and every buy is skipped** | `463f058` |
| 7 | The price updater read `body.data`, but Jupiter v3 returns prices at the top level | **No price is ever published** | `463f058` |
| 8 | Prices were published to the mainnet mint, not the devnet stand-in | Devnet price accounts never update | `463f058` |
| 9 | **Owner keys lived only in memory.** `PrismaService` was imported as a type, so Nest never injected it and nothing was saved | **One redeploy locks every vault forever** (only the owner key can withdraw) | `ea7529e` |
| 10 | The keeper's vault list was in memory only | After a restart the keeper stops buying | `ea7529e` |
| 11 | `.env` was never loaded; blank values became `0`/`0n` | A blank `MIN_TRADE_MICRO_USDC` meant a $0 minimum; a blank `MAX_SLIPPAGE_BPS` meant 0% slippage | `92fcedd` |
| 12 | Bad signing keys silently fell back to placeholder keys; nothing stopped keeper = oracle | Production runs with signing broken, or with one key doing two jobs | `92fcedd` |

## Still to do (not fixed in this review)

**Blocks the demo:**
1. ~~**A real Anchor `VaultClient` adapter.**~~ Done in round 3 (PR pending Sonnet review): `AnchorVaultClient` is bound by default (`VAULT_CLIENT=anchor|fake`), proven live on devnet by `bun run verify:devnet` (exit 0: faucet, create, deposit, oracle prices, keeper buys, keeper-refused withdraw, one-transaction withdraw-all). The adapter must:
   - map asset symbols (`AAPLx`) to devnet mint addresses;
   - pack `withdrawAllAsOwner` into one transaction;
   - sign as the owner via `WalletsService.loadOwnerKeypair`, or via Privy (tested Nov 4, works).
2. ~~**Telegram notifications** for deposit arrived / moved / failed (bot-messages §3.2–3.4) and buys when `notify_buys` is on (§4).~~ Done in round 2 (`d69abe3`): `NotificationsService`, once-per-deposit sweep notices, split-buy alerts gated on `notifyBuys`.
3. ~~**`/faucet`** (devnet USDC-dev), which the demo uses.~~ Done in round 2 (`bc865b7`): devnet-only, one use per user per 10 minutes, swept into the vault by the normal flow.

**Product gaps:**
4. ~~The weekly summary job (§8) isn't implemented.~~ Done in round 2 (`b66f75f`): three variants, cadence-aware, `NudgeLog` dedupe, `SUMMARY_CRON` override.
5. ~~Onboarding skips the currency question (§1.3) and the "how the pace works" note (§1.6); amounts are hard-coded in ₦.~~ Done in round 2 (`eb48353`): currency saved to `displayCurrency`, pace note with real days-to-first-buy before the first card only.
6. ~~"How am I doing?" shows mint symbols and UI amounts only, with no ₦/$ value and no change since the start (§5).~~ Done in round 2 (`eb48353`): valued holdings, put-in, change and waiting USDC in the display currency.
7. ~~"Is investing worth it?" returns no numbers (§9), although `HistoryService` already computes them.~~ Done in round 2 (`eb48353`): real ₦20k figures with both worst drops (USDC 22.4%, S&P 19.8%).
8. ~~Some reply text is written inline in `bot.service.ts` instead of coming from `messages.ts`.~~ Done in round 2 (`eb48353`): all handler copy renders from `messages.ts`.

**Hygiene:**
9. ~~Two lockfiles~~ Done: `bun.lock` is the only lockfile. Bun is the package manager and Node runs everything, `verify:devnet` included.
10. ~~`GET /vaults/:owner/holdings` has no authentication.~~ Done in round 2 (`c41577f`): Telegram `initData` HMAC verified, owner resolved server-side, mismatched URL owner rejected. `/history/compare` stays public.
11. ~~The amount parser takes the first number in the message: "S&P 500 at 300 a day" parses as ₦500.~~ Done in round 2 (`c41577f`): prefers an amount next to ₦/N or "a day".
12. ~~`backend/AGENTS.md` is boilerplate~~ Done: it now holds Pacer's backend rules and the round-2 brief.
13. ~~`src/generated/` is gitignored~~ Done: `bun run build` now runs `prisma generate` before `nest build`.

**Honesty, for the copy:** measured in naira, USDC's own worst drop over the 5 years was **22.4%**, as the naira recovered in 2024–2026. That's larger than the S&P's 19.8%. The "Is investing worth it?" answer and the Mini App should show it next to the USDC figure.
