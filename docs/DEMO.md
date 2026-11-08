# DEMO.md — recording runbook

The 2-minute demo from [SPEC.md](../SPEC.md) §“Demo script”, as a checklist
you can run top to bottom. Timings match the script; the whole take should
stay under 2 minutes of screen time.

**Never cut** (SPEC): deposit → agent buys within limits → the keeper is
refused when it tries to withdraw → the user withdraws. If time runs out,
cut around those four beats, never through them.

---

## The night before

- [ ] Backend deployed (Railway) and healthy: `GET /health` on
  `NEXT_PUBLIC_API_URL` answers.
- [ ] RPC is the keyed Helius endpoint (`HELIUS_API_KEY` set, or
  `SOLANA_RPC_URL` pointing at Helius). The public devnet RPC rate-limits
  mid-demo (SPEC §“Hosting / RPC”).
- [ ] Exactly **one** bot process is polling the token. A second instance
  (a local `bun run start:dev` next to Railway) causes Telegram `409`
  conflicts.
- [ ] Chain config matches the demo deployment: a “day” is **10 seconds**
  and the minimum buy is **$0.10** (set on-chain; `PERIOD_SECONDS` and
  `MIN_TRADE_MICRO_USDC` must match — see README §“Demo settings”).
- [ ] `DEMO_REPUBLISH=true` only if judging needs prices kept fresh. It
  re-publishes the last good price so the freshness check does not block
  buys; say so on Devpost, never use it in production.
- [ ] The demo user has buy notifications **on** (`notify_buys`), so buys
  arrive in chat during the loop beat.
- [ ] Mini App deployed (Vercel, root `miniapp/`), with
  `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_BOT_URL` set; the backend's
  `MINIAPP_URL` / `MINIAPP_ORIGIN` point at it. Browser fallback for the
  recording: open the Mini App with `?mock=1` (sample vault, no Telegram
  needed).
- [ ] Backup proof pre-run and green, from `backend/`:
  `bun run build && bun run verify:devnet` (fresh owner: faucet → create
  vault → deposit → prices → keeper buy → keeper refused on withdraw →
  withdraw everything in one transaction).
- [ ] Explorer tabs pre-opened, Phantom (devnet) ready with the demo
  user's withdrawal wallet, screen at phone width for the Mini App shots.

## Seed the demo user (10 minutes before)

1. `/start` in [@PacerFinanceBot](https://t.me/pacerfinancebot); pick a
   currency with the Naira/Dollars buttons.
2. Paste the Phantom withdrawal address and Confirm it (it can never
   change — use the recording wallet).
3. Say `Put ₦300 a day into Apple and the S&P`, tap **Confirm** on the
   card.
4. `/faucet` for 10 USDC-dev; wait for “is in your vault”.
5. Wait ~20 seconds and confirm at least one buy landed in chat. You are
   now mid-story and can reset by withdrawing and re-depositing, or keep
   this vault and start the recording at the comparison beat.

## The take (2 minutes)

| Time | Beat | Do | Say / show |
| --- | --- | --- | --- |
| 0:00 | Problem (15s) | Lander hero or a naira price chart | “The naira keeps falling; ₦20k barely moves; young Nigerians already hold dollars with nowhere useful to put them.” |
| 0:15 | Is it worth it? (25s) | Ask the bot “is investing worth it?”; open the comparison in the Mini App | ₦20,000 five years ago: naira ₦20,000, USDC ₦49,027 (worst drop 22.4%), S&P 500 ₦86,256 (19.8%), Apple ₦115,639 (26.3%), Nvidia ₦394,140 (51.2%). Every gain sits beside its drop. “Past performance. Not a prediction or a promise.” |
| 0:40 | Set up (20s) | Fresh chat (or replay the seeded one): type the plan, Confirm card, Phantom address, `/faucet` | “Nothing happens until you confirm. Withdrawals can only ever go to this address.” Show the money moving into the vault. |
| 1:00 | The loop (25s) | Wait for the keeper buys; tap an Explorer link | A “day” is 10 seconds in the demo, minimum buy $0.10. “The agent buys Apple and the S&P at the user's pace — and can do nothing else.” |
| 1:25 | The proof (20s) | From `backend/`: `bun run build && bun run prove:keeper` | Using **only the keeper key**, the script tries to buy faster than the pace, passes `min_out = 0`, and tries to withdraw to itself. The program refuses all three; one ordinary buy succeeds. Explorer links on screen. |
| 1:45 | Exit (15s) | “Withdraw everything”, Confirm | One transaction sends USDC, Apple, and the S&P to the Phantom wallet. “Stocks arrive as stock tokens; you sell them in your wallet's Swap screen.” (Selling inside the vault is designed in [withdraw-as-usdc.md](withdraw-as-usdc.md), post-hackathon.) |

## If something breaks mid-take

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No buys arrive | Stale price, or keeper not running | Check price freshness; for judging only, `DEMO_REPUBLISH=true`. Confirm the seeded user's `notify_buys` is on for chat alerts (buys otherwise only show in the weekly summary). |
| Bot replies twice / `409` in logs | Two pollers on one token | Stop the local backend; keep exactly one process. |
| RPC `429` errors | Public devnet RPC | Set `HELIUS_API_KEY` (keyed Helius) and restart; the startup log prints the redacted endpoint (`api-key=***`). |
| Mini App vault is blank | Opened outside Telegram, or backend unreachable | Open it from the bot, or use `?mock=1` for the recorded comparison shots. |
| Keeper buy skipped | Allowance below $0.10, paused vault, or slippage | Wait one more 10-second “day”; unpause; the keeper retries `SlippageTooHigh` once with a fresh price, then logs and waits for the next tick. |
| Faucet refuses | 10-minute per-user limit, or wrong cluster | Wait, use the second seeded user, and confirm `SOLANA_CLUSTER=devnet`. |

## After the take

- [ ] Initial Devpost submission by 4 PM; final by 5:45 PM (SPEC schedule).
- [ ] Devpost states plainly: devnet test money, stand-in stocks priced
  from real quotes, brief custodial step for deposits, issuer (Backed)
  freeze powers, and `DEMO_REPUBLISH` if it was on.
- [ ] Judge questions: keep SPEC §“Judge questions and known risks” open
  in a tab; the three answers that matter are “the program enforces it,
  watch the keeper get refused”, “no returns are promised, ever”, and
  “withdrawals only go to the user's own fixed address”.
