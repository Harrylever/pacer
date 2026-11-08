# Pacer — SPEC

Nov 4, 2026 · @Dean · **This file is the single source of truth.** Every agent works from it. (It replaces `Pacer — Build Spec.md`, which now just points here.)

## Build order and gates

Work moves to the next stage only when the current gate passes. Lagos time.

| # | When | Owner | Build | Gate (must pass before the next stage) |
| --- | --- | --- | --- | --- |
| 0 | Before Fri 6 PM | Dean | MLH confirms whether pre-event code is allowed and how many tracks you can enter | **No code before this answer.** Docs and data only. |
| 1 | Fri 6 PM | Sonnet 5.5 | `CONTRACT.md`: account names, PDA seeds, instruction arguments, events and error codes (from "Solana vault program" below) | Dean has read it; the backend agent can start against it |
| 2 | Fri 6 PM to 2 AM | Sonnet 5.5 (high effort) | `programs/`: the vault and `mock_swap`, plus the devnet mints (8-decimal Token-2022 stocks with mainnet's extensions; 6-decimal legacy USDC-dev) | Every "should fail" and "should pass" test is green, the programs are deployed to devnet, and the IDL is committed |
| 3 | Sat morning | Muse Wonder 1.0 | `backend/`: wallets, deposits, the confirmation card, keeper `buy`, and the price updater (publishing `usdPricePrescaled`) | A script on devnet runs one deposit and then one keeper buy, using the real IDL instead of `CONTRACT.md` |
| 4 | Sat afternoon and evening | Muse Wonder 1.0, then a review by Sonnet 5.5 | The full loop in Telegram: allowance unlocking, buys, holdings, pause, withdraw | **The never-cut path works from Telegram:** deposit → agent buys within limits → keeper refused on withdraw → user withdraws. Sonnet has reviewed the keeper-key handling and transaction-building code |
| 5 | Sun to 12 PM | Muse Spark 1.3 | `miniapp/`: the history comparison built from `data/history/` (already built) and the holdings chart | The comparison shows the ₦20k example with the drawdown and the past-performance label |
| 6 | Sun 12 to 4 PM | Dean | Seed demo users, record the video, write the Devpost entry | Initial submission by 4 PM; final by 5:45 PM |

If you fall behind, cut in the order given under "Timeline and cut list". Never cut stage 4's never-cut path.

## Agent split

| Part | Model | Why |
| --- | --- | --- |
| Anchor program (vault, `mock_swap`, tests) | Sonnet 5.5, high effort | Small, but the most security-critical code |
| NestJS backend, bot, scheduler, Privy | Muse Wonder 1.0 | The most code; runs on the free credits |
| Mini App and charts | Muse Spark 1.3 | Simpler work |
| Review of the backend's keeper-key and transaction code | Sonnet 5.5 | A second model catches what the author missed |

The Muse benchmark comparisons disagree with each other. Before stage 3, give Wonder and Spark the same small backend task, such as the price updater module, and keep whichever needs fewer fixes.

## Rules for agents

1. **One repo, one folder per agent.** This is a monorepo: a single git repo at the project root (`SPEC.md`, `CONTRACT.md`, `docs/`, `data/history/`), plus `Anchor.toml` and `programs/` (Sonnet), `backend/` (Wonder) and `miniapp/` (Spark). Each folder is its own project with its own `bun.lock`, installed and deployed from that folder (Railway: root `backend/`; Vercel: root `miniapp/`). There's **no Bun workspace**: a shared root lockfile would conflict across agent branches. **Bun is the package manager; Node runs everything**, including scripts, because the Solana and Anchor libraries aren't reliable on Bun's runtime. The root `package.json` holds convenience scripts only (`bun run backend:dev`, `bun run test`). Share code by copying the generated IDL JSON into each app; the Mini App gets history numbers from the backend's `/history/compare` endpoint. Each agent works in **its own git worktree**, never in another agent's checkout: `Pacer-eco/` is Dean's `main` checkout for review and merges, and every other agent gets a sibling worktree named for its area (`Pacer-eco-backend/`, `Pacer-eco-miniapp/`, `Pacer-eco-programs/`), created from the latest `origin/main` on a branch for its current round. The agent's own `AGENTS.md` names its worktree and branch, so they aren't listed here. Worktrees are disposable: once a round is merged, remove it and make a fresh one. One checkout has one current branch and one staging area, so sharing it would mix commits across agents. Merge into `main` only through PRs. Commit as Dean Ukanah with the no-reply address, which is already set in the repo's git config.
2. **The interface comes first.** The backend builds against `CONTRACT.md` until the IDL exists, then switches to the generated IDL. Any change to the contract goes through Dean.
3. **The tests decide.** Nothing is merged into `programs/` until the vault tests pass, whoever wrote the code. Nothing that signs transactions is merged into `backend/` until Sonnet has reviewed it.
4. **Values that are already decided:** xStocks have 8 decimals and USDC has 6, so read decimals from each mint. The oracle publishes `usdPricePrescaled`. Stock tokens always move with `transfer_checked`. The keeper can never sign any withdrawal. `data/history/` is final input, so don't regenerate it.
5. **Never log the keeper key** or any other private key.
6. **Keep the off-chain `settle` in step with the program.** `backend/src/common/pace.ts` mirrors the program's `settle` maths so the keeper knows when to buy. The stored `allowance` only grows inside `settle`. If `CONTRACT.md` changes the pace maths, change `pace.ts` and its tests too.
7. **Owner keys are durable before they're used.** The backend saves the encrypted owner key to Postgres before it shows a deposit address. Never add a code path that hands out an address without that save.
8. **Environment variables:** `backend/.env` (gitignored) holds the secrets. A blank value means "use the default". `MAINNET_PRICE_MINTS` entries are `mainnetMint:devnetMint`. Keeper, oracle and gas must be three different keys. Remaining backend work is listed in `docs/backend-review.md`.
9. **The spec's library choices override the `solana-dev` skill's defaults** (v2.8.0 prefers `@solana/kit` 8 and web3.js v3). This weekend: **Anchor 1.2.2** for the programs and the TS client **`@anchor-lang/core` ^1.2.2** (it replaces `@coral-xyz/anchor`, which stopped at 0.32.1) with **`@solana/web3.js@^1`** (pin the v1 line: a bare install now gives v3) and `@solana/spl-token`, legacy transactions, and Rust LiteSVM 0.17.x for program tests. No `@solana/kit` migration and no switch to v1 transactions. Use the skill for Anchor patterns, testing and the security review, not for client library choices. On-chain names, accounts and errors are defined in `CONTRACT.md`.

---

## Summary

A Telegram bot that lets young Nigerians who already hold USDC put small amounts, as little as ₦200 a day, into tokenized US stocks on Solana. An on-chain vault holds each user's money, and the agent can only buy approved stocks within limits the user set. A Mini App shows honestly what similar amounts would have become in naira, in USDC, or in stocks. It's quiet by design: after setup, users hear from it weekly, not daily, because checking often leads to panic selling.

Name: Pacer ("Pacer Finance" only for the company or domain). Tagline: "Save at your pace." Built first for Nigerians, whose naira savings kept losing value, it works for anyone holding USDC outside the US, especially where the local currency is weak: Ghana, Kenya, Egypt, Argentina, Turkey. xStocks aren't available to US users.

**Correction to what I said by voice:** Jupiter's recurring orders don't work for this. They need at least $50 per order and $100 in total, and they don't support Token-2022 tokens. Jupiter's own docs also say the Recurring API is no longer actively maintained. So we run our own daily scheduler and call Jupiter's swap API instead.

**How the daily habit works:** the user deposits once, for example $10, and picks a pace such as ₦200 a day. The program unlocks that much each day, and the agent buys once at least about $1 has built up. The user doesn't have to tap anything daily, and the vault enforces the pace even when it's pre-funded.

## Track fit

The main target is Top 3 Overall. The page wants a working product that uses Solana for speed, low fees, composability or on-chain ownership. Every eligible submission is entered for Top 3 automatically. Choose AI as the category track: the project matches three of its listed ideas almost word for word, while DeFi judges may mark down a mocked devnet swap. Add DeFi too if MLH allows more than one track.

| Where | Page wording it matches | What we build for it |
| --- | --- | --- |
| Top 3 Overall | Speed, low fees, composability, on-chain ownership | Fees low enough for daily deposits, Jupiter routing, a vault the user owns |
| DeFi | Real-world assets; savings products; composability with existing protocols | Tokenized stocks, daily saving into dollars, Jupiter swaps |
| AI | Agents that hold a wallet with spending limits; natural-language requests turned into transactions, confirmed before signing | The agent buys only approved stocks within on-chain limits; every action is confirmed in chat |

What keeps it from being "a chain bolted onto a web2 app": the program enforces the limits, not our server. Funds can only leave to the user's own fixed address, and the keeper can only buy approved stocks at the user's pace and within a price check. Even with the server compromised, nobody can steal the money in the vault. The one exposed moment is a deposit that has reached the user's Privy wallet but hasn't been moved into the vault yet. The server holds that key, so the bot moves each deposit into the vault as soon as it sees it (see Wallets and deposits).

## Architecture

&#91;embedded content: system architecture · bot, keeper, vault, swap\]

Deposits and withdrawals are owner actions, and withdrawals can only go to the user's fixed external address. The keeper key can only call `buy`, and the vault program checks every buy against the user's limits. The price updater copies live mainnet xStocks prices into a devnet price account, which the mock swap reads.

## Tech stack

The backend is NestJS on Node, the on-chain programs are Anchor, and the Mini App is Next.js. Everything else is chosen to keep a solo weekend build simple.

| Layer | Choice | Why |
| --- | --- | --- |
| On-chain programs | Rust + Anchor (vault and `mock_swap`) | Standard for Solana. Use `token_interface` so Token-2022 stock tokens work |
| Program tests | Anchor TS tests (LiteSVM for faster runs) | Covers the "keeper can't withdraw" tests the demo depends on |
| Backend | NestJS on Node | Dean's strongest framework. Node, not Bun, to avoid surprises with the Solana and Anchor libraries |
| Telegram bot | grammY, wrapped as a Nest provider | No official Nest module, but about 20 lines to wire up. Long polling locally, webhook when deployed |
| Agent | Gemini or Claude with structured JSON output, validated with zod | The LLM parses intent and explains; zod rejects bad output before a transaction is built |
| Solana client | `@coral-xyz/anchor` + `@solana/web3.js` v1 + `@solana/spl-token` | The Anchor client still expects web3.js v1, so no `@solana/kit` this weekend |
| Scheduling | `@nestjs/schedule` | Weekly summaries, price updates and the keeper's buy checks. No BullMQ or Redis |
| Database | Postgres + Prisma | Telegram ID to wallet, user settings, nudge log. The money itself lives on-chain |
| Wallets | Privy server wallets (Node SDK); fallback: server keypairs encrypted with a key in env | Server signing is acceptable because withdrawals can only go to the fixed address |
| Prices | Jupiter Price API (mainnet) written to a devnet price account | Real prices on devnet stand-in tokens |
| History analysis | Static CSVs + calculations in TypeScript | Deterministic numbers; the LLM only explains them |
| Mini App | Next.js + Telegram Mini Apps SDK + Recharts | One screen, deployed on Vercel |
| Hosting / RPC | Backend + Postgres on Railway; Helius free devnet RPC | Public devnet RPC rate-limits you mid-demo |

**NestJS modules:** `bot` (grammY handlers, confirmation cards), `agent` (LLM calls, zod schemas), `solana` (Anchor client, keeper signer), `vaults` (deposit, buy, withdraw logic), `prices`, `history`, `wallets`, `scheduler`.

**Rules:**

- The keeper's private key lives only in the `solana` module's config and is never logged.
- Don't spend Friday night on NestJS structure. The Anchor program comes first; if the vault isn't working by Saturday morning, a tidy backend won't save the demo.

## Solana vault program

Each user's money sits in their own vault and can only ever leave to one withdrawal address fixed when the vault is created. Three separate keys each do one job: the keeper (the AI agent) can only buy, the oracle key can only write prices, and the owner can change the pace only up to a ceiling.

**Accounts**

- `Config` PDA (`"config"`): admin (kept offline), keeper, `oracle_authority` (the price updater's own key, separate from the keeper), USDC mint, allowlist of stock mints (up to 10) with a price account for each, swap program ID, `period_seconds` (86,400 in production, 10 for the demo), `min_trade` ($1 in production, $0.10 for the demo), `max_rate_per_period`, `max_slippage_bps` (e.g. 100), `max_price_age_secs`. The swap program and allowlist are locked at init.
- `PriceAccount` PDA, one per stock: `price_micro_usdc` (u64, 6 decimals) and `updated_at`. Only `oracle_authority` can write it.
- `UserVault` PDA (`"vault"`, owner): owner, `withdrawal_destination` (fixed), `rate_per_period`, `allowance`, `last_checkpoint_ts`, `total_invested` (for stats), chosen mints, paused, `last_intent_hash` (\[u8; 32\]), `last_model_id` (\[u8; 16\]), `intent_count`.
- Token accounts owned by the vault PDA: USDC, plus one per stock held.

**Pace math (a checkpointed allowance)**

- `settle(now)`: if not paused, add `rate_per_period × whole periods since last_checkpoint_ts` to `allowance`, then move `last_checkpoint_ts` forward by those whole periods, so partial periods aren't lost. If paused, just move the checkpoint to now.
- Pausing drops the partial period in progress, by design. `set_rules` settles first, so every whole period before the pause is credited, but the unfinished one isn't, and paused time never accrues. Unpausing starts a fresh period from the unpause time. This is the conservative choice; test for it.
- Cap `allowance` at `2 × max(rate_per_period, min_trade)`, so an idle or unfunded vault never builds up a lump sum.
- `buy` and `set_rules` call `settle` first. Changing the rate only affects future periods, and pausing stops accrual.
- Period 0 has no allowance until the first period passes; test for it.

**Instructions**

1. `init_config`: admin only. Locks the swap program and allowlist.
2. `create_vault(withdrawal_destination, rate_per_period, mints)`: the rate must be no higher than `max_rate_per_period`. The gas wallet is the `payer`.
3. `deposit(amount)`: owner, any amount, any time.
4. `set_rules(rate_per_period, mints, paused)`: owner only. Settles first, caps the rate at `max_rate_per_period`, and can't change the withdrawal address.
5. `buy(mint, usdc_in, min_out)`: keeper only. It settles, then checks that the mint is allowed and chosen, that the vault isn't paused, that `min_trade` ≤ `usdc_in` ≤ `allowance`, that the price is fresher than `max_price_age_secs`, and that `min_out` is at or above the slippage floor (math below). After the swap CPI it calls `reload()` on both token accounts, asserts USDC fell by exactly `usdc_in` and the stock rose by at least `min_out`, then subtracts from `allowance` and adds to `total_invested`.
6. `withdraw(mint, amount)`: owner only, paid only to `withdrawal_destination`. The destination token account is created with `init_if_needed`, paid by the gas wallet, because a fresh Phantom wallet won't have token accounts for the stocks yet. "Withdraw everything" packs one `withdraw` per held mint into a single transaction.
7. `update_price(mint, price_micro_usdc)`: `oracle_authority` only. Sets `updated_at` from the on-chain clock.
8. `record_intent(intent_hash, model_id)`: keeper only. It overwrites the fixed fields, increments `intent_count` and emits an `IntentRecorded` event, so the history stays in transaction logs with no rent cost.

There's no balance threshold on-chain. The buy threshold is just the keeper's trigger, so buying two stocks in the same period works.

**Withdrawal delay (stretch, after the main loop works):** friction against impulse, not a trap.

- New `UserVault` fields: `withdraw_delay_secs` (the user's choice at creation; default 24 hours, 20 seconds for the demo), `lock_until` (an optional hard lock date, opt-in only), and a vault-wide withdrawal window: `withdraw_unlock_ts` and `withdraw_expires_ts`.
- `request_withdraw()`: owner only. Opens the window for the whole vault: `withdraw_unlock_ts = now + withdraw_delay_secs` and `withdraw_expires_ts = unlock + 24 hours`. The bot confirms "Arrives in 24 hours. Tap to cancel."
- `execute_withdraw(mint, amount)`: owner only (the keeper must never be able to sign any withdrawal, or the demo's "keeper is refused" claim stops being true), only between `withdraw_unlock_ts` and `withdraw_expires_ts`, and after `lock_until`. It still pays only to `withdrawal_destination`. "Withdraw everything" packs one call per held mint into a single transaction.
- The window closes when it expires or on `cancel_withdraw()` (owner only), so each new withdrawal needs a new request and waits out the delay again.
- The delay can be raised at any time, but a decrease only takes effect after the current delay has passed, so nobody, including a server holding the owner key, can shortcut it.
- The pitch: commitment saving enforced by the program, not by our promise.

**Slippage floor:** compute it in u128, or `usdc_in / price` rounds down to 0 and silently brings back the `min_out = 0` exploit. Use the same math in `mock_swap`. `price_micro_usdc` is the price of one whole **raw** token (10^`stock_decimals` base units) in micro-USDC, and the stock has 8 decimals, not 6, so scale by the mint's decimals:

```rust
let scale = 10u128.pow(stock_mint.decimals as u32); // 10^8 for xStocks
let quoted_out = ((usdc_in as u128) * scale / (price.price_micro_usdc as u128)) as u64;
let floor = ((quoted_out as u128) * (10_000 - config.max_slippage_bps as u128) / 10_000) as u64;
require!(floor > 0 && min_out >= floor, VaultError::SlippageTooHigh);
```

**Anchor traps**

- Use two token program accounts, `usdc_token_program` and `stock_token_program`, in `Buy`, `Withdraw` and `MockSwap`, because mainnet USDC uses the legacy token program and xStocks use Token-2022.
- Every `init` and `init_if_needed` takes `payer` = the gas wallet, never the owner. Users hold no SOL, and setting the fee payer doesn't cover rent.
- **Decimals: USDC has 6, xStocks have 8** (checked on mainnet, Nov 4). Make `USDC-dev` 6 decimals and the stock stand-ins 8, and never hard-code either: read `decimals` from each mint.
- **ScaledUiAmount is confirmed** on xStocks. The displayed amount = raw ÷ 10^8 × `multiplier`, and the multiplier grows over time (corporate actions and dividends). On Nov 4 it was about 1.0017 to 1.0075, depending on the stock. Show holdings with the UI amount; the vault's maths works only in raw amounts.
- Always move stock tokens with `transfer_checked` (Token-2022 requires it for mints that have a transfer hook configured), and hold them in associated token accounts owned by the vault PDA, so the token-account extensions are sized correctly.

**What each key can do if it's stolen:**

- The keeper (the AI agent) can only buy allowlisted stocks, at the user's pace, within slippage. That's what the demo proves.
- The owner key is held on the server this weekend. It can raise the rate only up to `max_rate_per_period`, and it can only withdraw to the fixed address.
- `oracle_authority` can fake devnet prices, and with the keeper it could buy at bad prices. That's a real loss path, but nobody can take the funds out. Production needs an independent oracle, for example Pyth equity feeds (coverage to be checked).

**Tests:**

- **Should fail:** the keeper tries to withdraw (and, if the delay is built, the keeper calls `request_withdraw`, `execute_withdraw` or `cancel_withdraw`); a withdrawal to any other address; a buy beyond the allowance; a buy in period 0; `min_out` below the floor; a quote that rounds the floor to 0; a stale price; the keeper writing a price; a non-allowlisted mint; a buy while paused.
- **Should pass:** pausing mid-period, then unpausing, credits only the whole periods before the pause; a split buy of two stocks in one period; raising the rate not unlocking past periods; a long idle period capping the allowance; withdrawing every mint to a fresh wallet in one transaction.

## Swap layer

The core demo runs on devnet with a mock swap that uses real prices. A single real mainnet swap proves it works with actual xStocks. Jupiter and xStocks exist only on mainnet, and deploying the vault there costs real SOL and adds risk in a 48-hour build.

**Devnet (core)**

- Create stand-in tokens on devnet, for example `AAPLx-dev`, `NVDAx-dev` and `SPYx-dev`, under Token-2022, plus a `USDC-dev` mint under the legacy token program, so the two-program setup matches mainnet. Give the stock stand-ins 8 decimals and `USDC-dev` 6 decimals.
- Give the stand-ins the same extensions as mainnet xStocks, so the vault is tested against the real account layout: permanent delegate, pausable, ScaledUiAmount (set a multiplier other than 1, such as 1.003, so display bugs show up), a transfer hook with no program set, default account state `initialized`, a freeze authority, and metadata. Skip confidential transfers. Then add one test that pauses the mint and checks that `buy` and `withdraw` fail cleanly.
- Write a small `mock_swap` program that is the **mint authority** of the stand-in stocks. It takes `USDC-dev` and mints the exact output at the price in the price account, so it never runs out of liquidity during judging.
- The price updater signs with `oracle_authority`, never the keeper. It fetches each xStock's mainnet price from Jupiter's Price API v3 (\`GET https://api.jup.ag/price/v3?ids=\<mint>,\<mint>\` with an \`x-api-key\` header; it returns \`usdPrice\` per token and omits tokens it can't price), and calls `update_price` every few minutes. **Publish `scaledUiConfig.usdPricePrescaled`, not `usdPrice`**, converted with \`Math.round(usdPricePrescaled \* 1\_000\_000)\`. Checked Nov 4: `usdPrice` is the price per share (AAPLx 335.37, against Jupiter's own `stockData.price` of 335.48), while `usdPricePrescaled` = `usdPrice` × the multiplier in effect (336.47), which is the price per raw token the vault's maths needs. Jupiter already applies `newMultiplier` once its date has passed. Using `usdPrice` would be off by up to about 0.75%, which eats most of a 1% slippage allowance on mainnet. For devnet stand-ins, store the mainnet multiplier alongside the price so the display in the app matches.
- If a fetch fails, keep the last good price. Seed it with Friday's prices. For the demo only, a `DEMO_REPUBLISH` flag can re-publish the last good price so the freshness check doesn't block buys during Sunday judging. Say so on Devpost, and never do it in production, because it defeats the stale-price check.
- Label it honestly on Devpost: "devnet stand-ins, priced from live mainnet xStocks quotes".

**Mainnet (proof, stretch)**

- From a normal wallet the bot controls (not the vault), swap about $1 of USDC into one xStock through Jupiter's swap API. Record it and show the explorer link in the video.
- Going further, with the vault calling Jupiter through a CPI on mainnet, is roadmap. Jupiter documents CPI integration, but account limits and compute make it a weekend risk.

**When the agent buys:** the keeper checks each vault on a schedule and calls `buy` once the unlocked allowance passes `min_trade`. For a split across two stocks it calls `buy` twice in the same period, which works because there's no balance threshold on-chain.

## Telegram bot and Mini App

The bot is the product, and the Mini App is one screen for charts. One backend serves both: Node/TypeScript with grammY for the bot, an LLM with structured JSON output for understanding requests, and the Anchor client for transactions.

**Bot conversations**

- `/start` creates or links the wallet and vault, then asks for the user's currency, a daily amount and which stocks.
- "Put ₦300 a day into Apple and the S&P" becomes a confirmation card with Confirm and Cancel buttons, followed by `create_vault` or `set_rules`.
- "How am I doing?" returns holdings, the value in naira and USD, and the change since the start.
- "Pause" or "stop" calls `set_rules` with paused set. "Withdraw everything" builds `withdraw` calls for every token the vault holds, packed into one transaction.
- "Is investing worth it for me?" opens the history analysis in the Mini App.
- A weekly summary (monthly if the user prefers): amount saved, buys made, "everything is in your vault", and an explorer link to check it. No daily messages and no price-swing alerts. Performance is shown only when the user asks.
- Buy notifications are a per-user setting, `notify_buys`: off by default, on for demo users, so the demo can show buys arriving in chat without breaking the no-daily-messages rule.
- All bot copy lives in `docs/bot-messages.md`. The backend loads these strings instead of writing them inline.

**Guardrails**

- Nothing is signed without an explicit Confirm tap.
- Every LLM output is checked against a schema before a transaction is built.
- The agent never promises returns. Every number about the future is labelled as past performance, not a forecast.

**Mini App (one screen)**

- The "what ₦20k would have become" comparison (see History analysis).
- Current holdings with a small portfolio chart.
- Built in Next.js and opened from a bot button with Telegram's Mini App launch.

## Wallets and deposits

Users bring USDC they already hold, and we build no naira on-ramp. The only step is sending it to a Solana address.

- **Wallet:** a Privy server wallet created at `/start` through the Node SDK and linked to the Telegram user ID. No client-side signing in the Mini App this weekend. Time-box it to 1 hour, then fall back to server keypairs encrypted at rest, labelled demo-only custody.
- **Why server-side signing is acceptable:** the owner key can only withdraw to the fixed address and can only raise the pace up to `max_rate_per_period`, so a compromised server can't take the funds out of the vault. It could take a deposit still sitting in the Privy wallet, which is why deposits are moved into the vault immediately. Truly non-custodial owner signing inside the Mini App is roadmap.
- **Withdrawal address:** at `/start` the bot asks for "your personal Solana wallet (Phantom, Solflare or Backpack)". Not an exchange deposit address, because exchanges don't credit stock tokens sent to a USDC deposit address.
- **Fees and rent:** a gas wallet controlled by the bot pays SOL fees, every account creation, and the destination token accounts created on withdrawal, so users never hold SOL.
- **Deposits:** the QR code shows the user's Privy wallet address, because ordinary wallets and exchanges can only send a plain token transfer and can't call the vault's `deposit`. The `vaults` module watches that address (a Helius webhook, or polling every 30 seconds). When USDC arrives, the bot posts "$10 arrived, moving it into your vault" and calls `deposit` right away. Until that transaction confirms, the money sits in a server-controlled wallet, so retry failed deposits and never leave a balance there on purpose. Say so on Devpost. On devnet, `/faucet` mints `USDC-dev` to the Privy wallet and deposits it in the same flow.
- **Display:** amounts in the user's \`display\_currency\` (asked at \`/start\`; NGN by default, USD as a fallback), with USD underneath. Never hard-code naira. For NGN, use the parallel-market rate and say so on screen.

## History analysis

The agent shows what an amount would have become in the past, never a forecast. For example: "₦20,000 five years ago, or ₦200 a day for a year: kept in naira, in USDC, or in the S&P 500." It also shows the worst drawdown over the same period, so the risk is as visible as the gain.

- **Data:** prepare static monthly CSVs before Friday, covering the NGN/USD parallel-market rate for the whole period (before the June 2023 float, the official rate understates what people actually paid; label the chart with the source), S&P 500 and Apple/Nvidia monthly closes for 5 years, and optionally a Nigerian savings rate to compare against. Ship them with the app and don't call live APIs in the demo. Structure the code as "your currency vs USDC vs the S&P", so adding a currency only means adding a CSV. Only NGN is prepared this weekend.
- **Calculation:** done in code, not by the LLM. Calculate lump-sum and daily-buy paths, the end value in naira, and the worst peak-to-trough drop. The LLM only explains the numbers in plain words.
- **Copy rules:** every chart is labelled "Past performance. Not a prediction or a promise." No "you will earn" wording anywhere, because Nigeria's SEC is strict about promised returns.
- **The honest hook:** for most of the last few years, simply holding USDC beat naira savings in naira terms because the naira fell. Show that plainly. It's the strongest reason for this audience, and it doesn't depend on stocks going up.

## Timeline and cut list

You have 46 hours to the initial submission and you're building alone, so the vault and the bot loop come first, and everything visual comes last. All times are Lagos time.

1. **Fri 6 PM to 2 AM:** vault program and `mock_swap`, with tests, deployed to devnet. Create the devnet mints.
2. **Sat morning:** the bot backend (wallet creation, deposit, the confirmation card, `buy` from the keeper) and the price updater.
3. **Sat afternoon and evening:** the full loop working: one deposit, the allowance unlocking each period, buys, holdings shown. Then pause and withdraw.
4. **Sun to 12 PM:** the Mini App history screen built from the prepared CSVs, plus the mainnet $1 proof swap if there's time.
5. **Sun 12 to 3 PM:** seed demo users, record a 2-minute video, write the Devpost entry.
6. **Sun 4 PM:** initial Devpost submission. **5:45 PM:** final.

**Cut list, in order, if you fall behind:** withdrawal delay → mainnet proof swap → `record_intent` → the portfolio chart (keep the history comparison) → Privy server wallets (use encrypted server keypairs) → the Mini App itself (send the comparison as an image in chat).

**Never cut:** deposit → agent buys within limits → the keeper is refused when it tries to withdraw → the user withdraws. That's the proof that Solana is doing real work.

## Demo script (2 minutes)

1. **Problem (15s):** the naira keeps falling, ₦20k on investment apps barely moves, and young Nigerians already hold dollars with nowhere useful to put them.
2. **Is it worth it? (25s):** ask the bot. The Mini App shows ₦20k five years ago kept in naira, in USDC, and in the S&P 500, with the worst year marked. It's past performance, said plainly.
3. **Set up (20s):** "Put ₦300 a day into Apple and the S&P." The confirmation card appears, the user gives their Phantom address, and `/faucet` deposits $10, which is moved into the vault.
4. **The loop (25s):** the demo config makes a "day" 10 seconds long, with a $0.10 minimum trade. Within about 20 seconds the agent buys Apple and the S&P and posts the explorer links in chat.
5. **The proof (20s):** "The AI agent only holds the keeper key." A script using that key tries to buy faster than the user's pace, passes `min_out = 0`, and tries to withdraw to itself. The program refuses all three.
6. **Exit (15s):** "Withdraw everything" sends USDC, Apple and the S&P to the user's Phantom wallet in one transaction. If the withdrawal delay is built, show the request, then the payout after the 20-second demo delay.

## Judge questions and known risks

| Likely question | Answer |
| --- | --- |
| Why not Bamboo or Risevest? | Their minimums and fees make tiny daily amounts pointless, and they hold your money. Here the user's own vault holds it, and fees are fractions of a cent. |
| Why not just buy on an exchange? | Self-custody, an agent that can't steal, and a daily habit built for small amounts. |
| Isn't this just a bot with a wallet? | No. The limits are enforced by the program. The demo shows the keeper being refused. |
| Can you promise returns? | No, and the product never does. It shows the past honestly, including the worst year. |
| How do users get USDC? | They already hold it on exchanges. That's the target user, and why there's no on-ramp. |
| What if a user needs the money urgently? | They can always withdraw. The optional delay only cools off impulse, can be cancelled, and hard locks are opt-in. Friction, not a trap. |
| Is this only for Nigerians? | No. Nigeria is the first market and the clearest story. It works for anyone holding USDC outside the US, and display currency and history data are per user. |

**Known risks:**

- **xStocks eligibility for Nigerians is unconfirmed.** Sources only say "outside the US, subject to local rules".
- **The issuer can take back, freeze or pause xStocks** (checked Nov 4 on AAPLx, NVDAx and SPYx). Each mint has a permanent delegate (it can move or burn tokens from any account, the vault's included), a freeze authority, a pausable extension, and a transfer hook whose program is unset but which its authority can switch on later. A vault owned by a program can hold them today. The vault's guarantee is "neither we nor the agent can take your money", not "nobody can": the issuer, Backed, keeps the powers of any regulated real-world asset. Say this plainly on Devpost. If the issuer ever switches on a transfer hook, mainnet `withdraw` must pass the hook's extra accounts.
- **Deposits are briefly custodial.** USDC in the Privy wallet, before it's moved into the vault, is protected only by the server. Say so on Devpost.
- **Regulation:** an agent recommending stocks comes close to investment advice, and Nigeria's SEC has warned foreign-stock apps before. Keep the agent explaining options, never recommending specific trades, and put this in the Devpost risks.
- **Small daily amounts:** ₦200 a day takes about a week to reach a $1 buy. Say so honestly, and let users set a higher daily amount.
- **The mainnet proof uses a bot wallet, not the vault.** Say so on Devpost.

## Before Friday

Non-code preparation until MLH confirms whether code written before the event is allowed.

- [x] Check the xStocks token details on mainnet (done Nov 4). All three are Token-2022 with 8 decimals and these extensions: a permanent delegate, a freeze authority, pausable, ScaledUiAmount, a transfer hook with no program set, default account state `initialized`, confidential-transfer mint, and metadata. There's no allowlist, so a vault owned by a program can hold them. The design stands; decimals, price scaling and the issuer risk have been updated above. Mints: AAPLx `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp`, NVDAx `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh`, SPYx `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W`.
- [x] Check whether Jupiter's `usdPrice` for xStocks is per UI token or per raw token (done Nov 4: it's per share; use `usdPricePrescaled` for the vault; see Swap layer). The `lite-api.jup.ag/price/v3` endpoint worked without an API key; use `api.jup.ag` with a key for the deployed updater.
- [ ] Ask on the MLH Discord whether pre-event code is allowed and whether you can enter more than one track.
- [ ] Read the xStocks terms for Nigerian eligibility, and submit the partner application anyway.
- [x] Build the history CSVs (NGN/USD, S&P 500, Apple, Nvidia; monthly; 5 years) and name the sources. Done Nov 4: `data/history/` (see its README). Monthly from Oct 2021 to Oct 2026; the parallel-market naira rate has one sourced article per row; the official CBN rate is included for comparison. Optional: a Nigerian savings-rate CSV is still missing.
- [x] Set up Privy and create one test server wallet with the Node SDK, so Saturday's 1-hour time box is realistic. Done Nov 4 with `@privy-io/node` 0.37: creating a wallet took 2.4 s; signing a message and signing a transaction took about 0.6 s each. The gas-wallet pattern works: the Privy wallet signs as the user while a separate fee payer signs and pays. Credentials go in `backend/.env`.
- [ ] **Fund the devnet wallets by hand.** Devnet's API airdrop is closed (410 "The RPC faucet is closed on this cluster"), so get devnet SOL for the gas, keeper, oracle and admin wallets from https://faucet.solana.com before Friday. The gas wallet pays every account's rent, so give it the most.
- [x] Draft the bot's messages: the welcome, the confirmation card, the weekly summary, and the past-performance disclaimer. Done Nov 4: `docs/bot-messages.md` covers every message, from onboarding to errors.
- [x] Telegram bot created: [@PacerFinanceBot](https://t.me/pacerfinancebot) (Nov 4). `@PacerBot`, `@pacer_bot` and `@pacer` were taken. Optional: claim `@pacerfinance` as a public channel, and a separate dev bot for testing.
- [ ] Check the existing "Pacer" projects (an ETHGlobal hackathon project called "Pacer Cash" and a crypto project called Pacer) and claim the Telegram handle and domain.

## Sources

- [MLH Solana Hackathon](https://events.mlh.com/events/15200-solana-hackathon)
- [Jupiter Recurring API best practices](https://developers.jup.ag/docs/recurring/best-practices) (the $50 per order, $100 total minimums, no Token-2022 support, no longer actively maintained)
- [Jupiter: tokens and trading](https://docs.jup.ag/user-docs/trade/swap/tokens-and-trading) (tokenized stock pages)
- [Jupiter swap via CPI](https://docs.jup.ag/docs/apis/cpi)
- [SwapKit: xStocks via Jupiter](https://swapkit.dev/blog/swapkit-jupiter-integration/)
- [XTrade: what are xStocks](https://xtrade.gitbook.io/docs/academy/xtrade-academy/crypto-trading-basics/what-are-xstocks-tokenized-stocks) (outside the US only)
