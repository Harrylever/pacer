# Pacer Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the stage 3–4 NestJS backend in `backend/`: wallets, deposits, confirmation cards, keeper `buy`, price updater, and the full Telegram loop, against the vault interface in SPEC.md until `CONTRACT.md`/IDL land.

**Architecture:** Framework-agnostic domain services (money math, history, intent parsing, keeper decisions, confirmation state) sit under thin Nest modules (`bot`, `agent`, `solana`, `vaults`, `prices`, `history`, `wallets`, `scheduler`). All chain access goes through one `VaultClient` port; an in-memory fake proves the loop in tests, and the Anchor adapter is the only file that changes when the real IDL arrives. Copy is loaded from `docs/bot-messages.md` data tables in code, never invented inline per-handler.

**Tech Stack:** NestJS 12, Node 24 (not Bun at runtime), grammY, zod, `@solana/web3.js` v1, `@coral-xyz/anchor`, `@nestjs/schedule`, Prisma schema (Postgres) with an in-memory repository for tests/local dev.

**Spec:** [SPEC.md](/Users/mac/Desktop/kha1ide/projects/personal-projects/Pacer-eco/SPEC.md) — stages 3–4, "Solana vault program", "Swap layer", "Telegram bot and Mini App", "Wallets and deposits", "History analysis".

## Global Constraints

- xStocks have 8 decimals, USDC has 6; always read `decimals` from the mint, never hard-code in chain math (display helpers take decimals as an argument).
- The price updater publishes `usdPricePrescaled`, converted with `Math.round(usdPricePrescaled * 1_000_000)`; never publish `usdPrice`.
- Stock tokens always move with `transfer_checked`; holdings display uses ScaledUiAmount: `raw / 10^decimals * multiplier`.
- The keeper can never sign any withdrawal. No code path builds a withdraw transaction with the keeper signer.
- Never log the keeper key or any private key. Keys load only in the `solana` module config.
- Nothing is signed without an explicit Confirm tap. Every LLM output is validated with zod before a transaction is built.
- The agent never promises returns and never recommends a specific stock. Past figures always carry "Past performance. Not a prediction or a promise."
- `data/history/` is final input; read it, never regenerate it. History maths is done in code, not by the LLM.
- No daily messages and no price-swing alerts. Buy notifications only when per-user `notify_buys` is on (off by default, on for demo users). Weekly summary omits performance.
- Display currency is per-user (`display_currency`, NGN default, USD fallback); never hard-code naira. NGN values use the parallel-market rate and say so.
- One folder per agent: this plan touches only `backend/` (the bootstrapped Wonder folder) plus this plan file. It never edits `programs/` or `apps/miniapp/`.
- Gate note: `CONTRACT.md` and the devnet IDL (Sonnet, stages 1–2) do not exist yet, so the backend builds against the SPEC vault interface behind `VaultClient`. The stage-3 gate (devnet deposit + keeper buy via real IDL) stays open until that adapter swap lands.

## Review Focus

- A malformed or LLM-hallucinated intent (unknown stock, zero/negative amount, amount above `max_rate_per_period`) must be rejected by zod/domain checks before any card or transaction exists — Task 3 tests pin this.
- A stale Jupiter price or a failed fetch must never publish a new price and never let a buy proceed on old data beyond `max_price_age_secs` — Task 5 tests pin this.
- A keeper tick with allowance below `min_trade`, a paused vault, or period 0 must place no buy and send no user message — Task 6 tests pin this.
- A deposit that arrives while a previous deposit sweep is in flight must not be swept twice or left stranded silently — Task 4 tests pin single-sweep + retry-flag behaviour.
- A withdraw request from any non-owner identity (including keeper-shaped payloads) must be refused before transaction building — Task 4 tests pin this.

---

### Task 1: Config, money math and slippage floor

**Files:**
- Create: `backend/src/config/app-config.ts`
- Create: `backend/src/common/money.ts`
- Test: `backend/src/common/money.spec.ts`, `backend/src/config/app-config.spec.ts`

**Interfaces:**
- Consumes: environment variables only.
- Produces: `loadConfig(env): AppConfig` (throws on missing keeper/oracle/gas secrets, returns only public keys thereafter); `slippageFloor({usdcIn, priceMicroUsdc, stockDecimals, maxSlippageBps}): bigint` mirroring the SPEC u128 formula and returning `0n` when the quote rounds to zero; `toUiAmount(raw: bigint, decimals: number, multiplier: number): number`; `formatMoney(usd: number, displayCurrency, ngnPerUsd): string`.

- [ ] **Step 1: Write the failing tests** — floor for `usdcIn=1_000_000, price=336_470_000, decimals=8, bps=100` is `> 0n` and equals the bigint formula; dust input that rounds quoted out to 0 returns `0n`; `toUiAmount(100_300_000n, 8, 1.003)` ≈ `1.006009`; config throws when `KEEPER_SECRET_KEY` is absent and its JSON never contains the secret.
- [ ] **Step 2: Run tests, expect FAIL** — `cd backend && npx jest src/common src/config`
- [ ] **Step 3: Implement** the two files with the exact signatures above; config parses keypairs but exposes only `keeperPublicKey`/`oraclePublicKey`/`gasPublicKey` strings.
- [ ] **Step 4: Run tests, expect PASS**
- [ ] **Step 5: Commit** — `feat(backend): config and money math`

### Task 2: History service from `data/history/`

**Files:**
- Create: `backend/src/history/history.service.ts`, `backend/src/history/history.module.ts`
- Test: `backend/src/history/history.service.spec.ts`

**Interfaces:**
- Consumes: `data/history/ngn_usd_monthly.csv`, `data/history/us_stocks_monthly.csv` (path via `HISTORY_DIR`, default `../../data/history` from `backend/`).
- Produces: `compareLumpSum({amountNgn, months}): HistoryComparison` and `compareDaily({dailyNgn, months})`, each returning end values in NGN for `naira | usdc | sp500 | apple | nvidia`, the S&P worst peak-to-trough drawdown, the series for charting, and the constant disclaimer string. Uses `*_adj_close` for stocks and `ngn_per_usd` (parallel rate) for FX.

- [ ] **Step 1: Write the failing tests** — ₦20,000 lump sum Oct 2021 → Oct 2026 (61 rows) gives USDC ≈ ₦49,027 and S&P ≈ ₦86,256 (tolerance 1.5%, per the CSV README check) and drawdown ≈ 19.8% (tolerance 1.5pp); every result carries the past-performance label; unknown asset key throws.
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement** CSV parsing (no new dependency; handle `\r\n` and quoted commas in source URLs) and the maths in code.
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `feat(backend): history comparison from static CSVs`

### Task 3: Agent intent parsing (zod) with deterministic fallback

**Files:**
- Create: `backend/src/agent/intent.schema.ts`, `backend/src/agent/agent.service.ts`, `backend/src/agent/agent.module.ts`
- Test: `backend/src/agent/agent.service.spec.ts`

**Interfaces:**
- Consumes: raw user text; optional injected LLM caller (structured JSON out). Without an LLM key, a deterministic parser handles the SPEC phrasings.
- Produces: `parseIntent(text): Promise<Intent>` where `Intent` is the zod-validated union `set_plan | pause | resume | withdraw_all | status | history | explain_options | unknown`; `set_plan` carries `dailyNgn: number > 0` and `assets: ('SPYx'|'AAPLx'|'NVDAx')[]` (non-empty). Invalid LLM JSON is rejected by zod and mapped to `unknown`, never to a transaction.

- [ ] **Step 1: Write the failing tests** — "Put ₦300 a day into Apple and the S&P" → `set_plan {300, [AAPLx, SPYx]}`; "pause" → `pause`; "withdraw everything" → `withdraw_all`; hallucinated asset `TSLAx` and `dailyNgn: -5` from a stub LLM both → `unknown`; "will I make money?" → a refusal intent, never `set_plan`.
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement** schema + service; the LLM path validates with `IntentSchema.parse` inside try/catch.
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `feat(backend): zod-validated intent parsing`

### Task 4: Wallets, vault client port and vaults service

**Files:**
- Create: `backend/src/solana/vault-client.ts` (port + types), `backend/src/solana/fake-vault-client.ts`, `backend/src/solana/solana.module.ts`
- Create: `backend/src/wallets/wallets.service.ts` (encrypted-keypair fallback; Privy behind the same interface), `backend/src/wallets/wallets.module.ts`
- Create: `backend/src/vaults/vaults.service.ts`, `backend/src/vaults/vaults.module.ts`, `backend/prisma/schema.prisma`
- Test: `backend/src/vaults/vaults.service.spec.ts`

**Interfaces:**
- Consumes: `AppConfig`, `VaultClient` port: `createVault`, `deposit`, `setRules`, `buyAsKeeper`, `withdrawAsOwner`, `getVault`, `getPrice` — `withdrawAsOwner` accepts only an owner signer identity; there is no keeper withdraw method on the port at all.
- Produces: `VaultsService.sweepDeposits()` (moves any Privy-wallet USDC balance into the vault once, flags retry on failure), `buildWithdrawAll(owner)` (one packed transaction intent covering every held mint, destination fixed to `withdrawal_destination`), `holdings(owner)` with UI amounts via Task 1.

- [ ] **Step 1: Write the failing tests** — a second `sweepDeposits()` after a successful sweep moves `0`; a failed sweep leaves a retry flag and no success record; `buildWithdrawAll` covers USDC + both stocks to the fixed destination only; calling any withdraw path with a keeper identity rejects before the client is invoked.
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement** port, fake, services and the Prisma schema (`User`, `VaultRecord`, `DepositSweep`, `NudgeLog`); AES-256-GCM encryption for fallback keypairs with the key from env.
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `feat(backend): wallets, vault port and deposit sweep`

### Task 5: Price updater publishing `usdPricePrescaled`

**Files:**
- Create: `backend/src/prices/prices.service.ts`, `backend/src/prices/prices.module.ts`
- Test: `backend/src/prices/prices.service.spec.ts`

**Interfaces:**
- Consumes: Jupiter Price API v3 response shape (`{ data: { [mint]: { usdPrice, scaledUiConfig?: { usdPricePrescaled, newMultiplier } } } }`), `VaultClient.updatePriceAsOracle`, an injectable `fetch`.
- Produces: `refreshPrices(): Promise<{ published: string[]; kept: string[] }>` — publishes `Math.round(usdPricePrescaled * 1_000_000)` per mint; a mint missing from the response or missing `usdPricePrescaled` is kept (last good price retained, nothing published); with `DEMO_REPUBLISH=true` it republishes the last good value and logs that it did so.

- [ ] **Step 1: Write the failing tests** — `usdPricePrescaled: 336.47` publishes `336470000`, never `335370000` (the `usdPrice` value); a fetch throw publishes nothing and keeps last good; a token omitted by Jupiter is kept, others still publish.
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement** with the oracle signer only (no keeper reference in this module).
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** — `feat(backend): Jupiter price updater (usdPricePrescaled)`

### Task 6: Keeper scheduler, bot confirmation flow and HTTP surface

**Files:**
- Create: `backend/src/scheduler/keeper.service.ts`, `backend/src/scheduler/scheduler.module.ts`
- Create: `backend/src/bot/confirmation.service.ts`, `backend/src/bot/bot.service.ts`, `backend/src/bot/bot.module.ts`, `backend/src/bot/messages.ts`
- Create: `backend/src/history/history.controller.ts`, `backend/src/vaults/vaults.controller.ts`
- Modify: `backend/src/app.module.ts`, `backend/src/main.ts`, `backend/test/app.e2e-spec.ts`
- Test: `backend/src/scheduler/keeper.service.spec.ts`, `backend/src/bot/confirmation.service.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–5 services; copy keys from `docs/bot-messages.md` (welcome, confirmation cards, deposit, status, pause, withdraw, weekly summary, history, refusals, errors with the `short_reason` map).
- Produces: `KeeperService.tick()` — for each active vault, settles the pace view, and only when unlocked allowance ≥ `min_trade` and the price is fresh does it call `buyAsKeeper` per chosen asset with `min_out` from Task 1's floor (split equally); paused/period-0/below-threshold vaults are skipped silently. `ConfirmationService` — `propose(userId, intent)` returns a card and stores a pending action; `confirm(userId, id)` executes exactly once; `cancel` discards; nothing executes without `confirm`. grammY handlers wire `/start`, `/faucet` (devnet), `/status` and free text through `AgentService` → `ConfirmationService`. HTTP: `GET /health`, `GET /history/compare`, `GET /vaults/:telegramId/holdings` for the Mini App.

- [ ] **Step 1: Write the failing tests** — keeper buys nothing in period 0, nothing while paused, nothing below `min_trade`, and splits one period across two assets when funded; a proposed plan executes zero client calls until `confirm`, executes once on confirm, and zero on cancel or double-confirm; weekly summary text contains no performance figures.
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement** services, grammY wiring (long polling only when `TELEGRAM_BOT_TOKEN` is set), controllers, and `ScheduleModule` cron entries (keeper tick, price refresh, weekly summary).
- [ ] **Step 4: Run unit + e2e, expect PASS** — `npx jest` and `npx jest --config test/jest-e2e.json`
- [ ] **Step 5: Run build + lint** — `npm run build && npm run lint`
- [ ] **Step 6: Commit** — `feat(backend): keeper, bot confirmation flow and HTTP surface`

---

## Self-review notes

- SPEC stage 3 gate (real devnet deposit + buy through the real IDL) is intentionally not claimed by any task: it depends on Sonnet's `CONTRACT.md`/IDL and deployed programs, which do not exist yet. The `VaultClient` port is the seam; swapping the fake for the Anchor adapter is a follow-up task once the IDL is committed.
- Withdrawal delay (stretch) is excluded, first on the SPEC cut list. `record_intent` is included only as a port method stub if trivial; otherwise cut per SPEC order.
- Privy is behind the wallet interface with the encrypted-keypair fallback as the default implementation, matching the SPEC cut list (Privy is cut before the Mini App).
