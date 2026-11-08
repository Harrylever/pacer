# AGENTS.md: Pacer Mini App

Read this first, then `../SPEC.md` (the source of truth; especially "Telegram bot and Mini App", "History analysis" and "Rules for agents"), `../docs/bot-messages.md` §9 (the comparison copy) and `../docs/superpowers/specs/2026-11-05-lander-design.md` (the brand the Mini App now follows).

You build **one screen**: a Telegram Mini App that shows (1) what an amount would have become in the past, (2) the user's vault and its rules, and (3) recent buys. It is read-only. It never signs, never holds a key, and never talks to Solana.

## Ground rules

- **Your folder is `miniapp/`.** Don't edit `programs/`, `data/`, `SPEC.md`, `CONTRACT.md` or `docs/`. In round 2 you may also edit the backend files named in tasks B1 and B2, and nothing else in `backend/`.
- **Bun installs, Node runs.** `bun install`, `bun run <script>`. Own `bun.lock`; there is no workspace and no root lockfile.
- **Stack:** Next.js (App Router) + TypeScript, Telegram's own script (`https://telegram.org/js/telegram-web-app.js`). **No Recharts from round 2:** the chart is the hand-built SVG copied from `../lander/` (see M3). Deployed on Vercel with root directory `miniapp/`.
- **Borrow from the lander by copying, never importing.** There's no workspace. Copy the file into `miniapp/src/`, keep a one-line comment naming where it came from, and adapt it.
- **Secrets:** none. Configuration is `NEXT_PUBLIC_API_URL` (the backend's base URL) and `NEXT_PUBLIC_BOT_URL` (`https://t.me/pacerfinancebot`). Never put a token, key or `DATABASE_URL` in this folder.
- **No wallet code.** No Phantom, no wallet adapter, no Privy, no `@solana/*`, no signing, no Solana RPC. Everything comes from the backend. An Explorer link is just a link.

## Don't break these

1. **Every chart and every past figure carries "Past performance. Not a prediction or a promise."** on the same screen, next to it, not in a footer.
2. **No promise wording.** Never "you will earn", "you'll have", "returns of", "guaranteed", "profit". Past tense only ("would have become", "did fall").
3. **Show the risk next to the gain.** The comparison always shows the worst drop for **both** USDC (22.4%) and the S&P 500 (19.8%) next to their end values. Never show a gain without its drop. A row that never dropped (naira) says "0%" with no arrow.
4. **The numbers come from the backend, not from your arithmetic.** Display `endNgn` and `maxDrawdownPct` exactly as `/history/compare` returns them, and vault figures exactly as `/vaults/me/holdings` returns them. You may compute *where* things sit on the chart, never the figures.
5. **Never recommend a stock or say which asset is best.** Present the options side by side. The AI agent explains and proposes; it never picks.
6. **Amounts follow the user's display currency** (NGN by default, USD underneath). Never hard-code a rate: use `ngnPerUsd` from the backend (B1). The NGN rate is the parallel-market rate and the screen says so.
7. **Works outside Telegram too.** With no `initData` the comparison still renders (Dean and judges open it in a browser), and the vault section shows a calm "Open this from the bot to see your vault" instead of an error.
8. **Colours only as tokens.** No hex value outside `src/app/tokens.css`; a test enforces it, as in the lander.

## How to work

1. **Work only in your worktree:** `/Users/mac/Desktop/kha1ide/projects/personal-projects/Pacer-eco-miniapp`, already on branch `miniapp/round-2` (fresh from `main`). Never `cd` into `Pacer-eco/` (Dean's `main`), `Pacer-eco-backend/`, `Pacer-eco-programs/` or `Pacer-eco-prove/`, and never switch branches.
   - Stage files by path (`git add miniapp/...`, `git add backend/src/...`), never `git add -A` from the repo root.
   - Git identity is already set in the repo config (Dean Ukanah, no-reply email). Don't change it.
   - For backend tasks, run `bun install` in `backend/` first. Link the env file rather than copying it: `ln -s ../../Pacer-eco/backend/.env backend/.env`. Never print or commit it.
2. One commit per task, with a message that says *why*. End each message with a `Co-Authored-By:` line naming your model.
3. Before you open a PR, all of these pass:
   - in `miniapp/`: `bun run typecheck`, `bun run test`, `bun run build`;
   - in `backend/` (for B1 and B2): `bun run test`, `bun run typecheck`, `bun run build`;
   - a visual check at **360 px wide** in light and dark, with screenshots in the PR description.
4. Push with `git push -u origin miniapp/round-2`, then `gh pr create --base main` and list which tasks are done and what ran against the mock. **Don't merge your own PR.**

---

## Round 2 brief (Nov 6, 2026)

### Why this round

Round 1 works: the comparison and holdings are correct, initData is verified, and errors are calm. But it looks like a default Telegram page (system font, Telegram blue, Recharts defaults, inline styles), and it says nothing about what makes Pacer different. Judges will open it from the bot during the demo. This round makes it look like the landing page and adds the two things a judge should see in the vault: **the rules the AI agent can't break, read live from Solana**, and **what it has bought**.

Order of priority if time runs short: B1, B2, M1, M3, M5, M4, M2, M6, M7. M6 is the first to drop.

### Look and feel: follow the lander

The landing page (`../lander/`, live design in `../docs/superpowers/specs/2026-11-05-lander-design.md` §5) is the reference. Open it with `cd ../lander && bun install && bun run dev`, or ask Dean for the deployed URL.

- **Tokens:** copy `../lander/app/tokens.css` to `src/app/tokens.css`. Same colours, same names.
- **Grounds follow Telegram's light or dark setting, in brand colours.**
  - Telegram light: the paper ground (`--surface`, `--ink`).
  - Telegram dark: the deep green-black ground (`--primary-deep`, `--dark-ink`, `--dark-muted`).
  - Read `Telegram.WebApp.colorScheme`. Outside Telegram, follow `prefers-color-scheme`.
  - Stop using `themeParams` colours. They make the app look like Telegram, not Pacer.
  - Call `WebApp.setHeaderColor` and `WebApp.setBackgroundColor` with the ground colour, so Telegram's own bar matches.
- **Type:** Fraunces for headings and big figures, Schibsted Grotesk for text, IBM Plex Mono for labels. Load them with `next/font/google` as in `../lander/app/layout.tsx`. Use tabular figures in figures and tables only.
- **Shapes and colour:**
  - pill buttons and segmented controls (at least 44 px tall);
  - 16 px cards with 1 px hairlines and no heavy shadows;
  - mint as the accent on dark, green (`--primary`) on paper;
  - the amber dot only as a small marker, never as text colour.
- **Motion:** quiet. A fade on load and the count-up on the result rows. With reduced motion, nothing moves.
- **Voice:** same as the lander, calm and plain. The AI wording matches the lander ("Pacer's AI agent", "can only buy").

### Backend tasks (do these first; the Mini App needs their data)

**B1. Rate and month on `/history/compare`.**
- **Files:** `backend/src/history/history.service.ts`, `history.controller.ts` and their specs.
- **Add** to the lump-sum response: `ngnPerUsd` (the latest parallel-market rate the CSV holds, from `latestNgnPerUsd()`) and `asOf` (the last month in `series`, e.g. `"2026-10"`). Don't change any existing field.
- **Done when:**
  - a spec asserts both fields for `amountNgn=20000`;
  - the existing figures are unchanged (₦49,027 with 22.4%, ₦86,256 with 19.8%).

**B2. The vault's rules and recent buys on `/vaults/me/holdings`.**
- **Files:** `backend/src/vaults/vaults.controller.ts`, `vaults.service.ts` and specs.
- **Add** two fields and keep everything else as it is:
  ```ts
  vault: null | {
    address: string;             // the vault PDA (AnchorVaultClient.getVaultAddress)
    explorerUrl: string;         // https://explorer.solana.com/address/<address>?cluster=devnet
    withdrawalAddress: string;   // fixed when the vault was created
    paceUsdPerPeriod: number;    // ratePerPeriod / 1e6
    periodSeconds: number;       // from the chain config (10 in the demo, 86400 in production)
    stocks: ('SPYx' | 'AAPLx' | 'NVDAx')[];
    paused: boolean;
  };
  recentBuys: { symbol: 'SPYx' | 'AAPLx' | 'NVDAx'; usdcIn: number; at: string }[]; // newest first, at most 5, from BuyRecord
  ```
- **Where the values come from:**
  - Read `withdrawalAddress`, `paceUsdPerPeriod`, `stocks` and `paused` **from the chain** with `getVault`, not from the database. The whole point is "read live from Solana".
  - `vault` is `null` when the user has no vault yet.
  - `usdcIn` is in dollars (micro / 1e6); `at` is an ISO timestamp.
- **Done when:** specs cover a user with no vault, a vault with buys (newest first, at most 5), and a paused vault, using the fake vault client.

### Mini App tasks (one commit each)

**M1. Brand foundation.**
- **Do:**
  - add tokens, fonts and the grounds above;
  - map light and dark from `colorScheme`, and set Telegram's header and background colours;
  - restyle the base elements;
  - remove the Telegram blue and the system font stack.
  - Port the lander's token tests (`../lander/test/tokens.test.ts`, the contrast check and the no-hex check) to `src/`.
- **Done when:**
  - tests pass for both grounds' text pairs at WCAG AA;
  - there's no hex outside `tokens.css`;
  - outside Telegram the page follows the system light or dark setting.

**M2. Header.**
- **Do:**
  - the Pacer mark and "Pacer" in Fraunces;
  - a segmented NGN/USD control (`aria-pressed`, 44 px);
  - a thin engraved lane-line strip under the header. Port `LaneDivider`, or a small piece of `Track` from `../lander/components/engraving/`, with no moving dot.
- **Done when:** a test toggles the currency and the figures switch, using `ngnPerUsd` from B1.

**M3. Comparison, rebuilt.**
- **Do:**
  - replace Recharts with the lander's hand-built chart: copy `../lander/lib/chart.ts`, `components/islands/ComparisonChart.tsx` and `components/islands/CountUp.tsx`, and adapt them to the API data instead of the bundled JSON;
  - keep scrubbing by drag, hover and arrow keys, the result rows (end value, then "Worst drop ▼ −22.4%"), the disclaimer and source line under the chart, and the hidden data table;
  - remove `recharts` from `package.json`.
  - The daily view stays hidden; the backend's daily maths is still wrong.
- **Done when:**
  - tests render the real fixture (`src/__fixtures__/compare-lump.json`) and find ₦20,000, ₦49,027, 22.4%, ₦86,256, 19.8% and the exact disclaimer;
  - a row without its drop fails a test;
  - `recharts` is gone from the lockfile.

**M4. Your vault.**
- **Do:**
  - **the total value** in large Fraunces, with the USD figure underneath;
  - **"Put in so far"**, and **"Change since the start"** with ▲/▼ and a sign, using `--gain`/`--loss` (`--dark-gain`/`--dark-loss` on dark), plus "Waiting to be invested";
  - **the allocation bar** in brand colours, with a list under it: mono ticker (AAPLx), name, amount and value;
  - **"price unavailable"** for any unpriced line, never a guess;
  - **an empty state** that points to `/deposit` in the bot.
- **Done when:** tests cover priced, partly unpriced and empty vaults, and NGN and USD.

**M5. The agent's rules, read live from Solana (the AI-track card).**
- **Do:** a card titled "What the AI agent can and can't do", built from B2's `vault`:
  - **"Withdrawals only go to"**: the shortened `withdrawalAddress`, e.g. `7xKX…9fQp`.
  - **"Your pace"**: `paceUsdPerPeriod` in the display currency per day. When `periodSeconds` isn't 86400, add "(demo: one day = 10 s)".
  - **"Stocks it can buy"**: names, not logos.
  - **"What the agent can do"**: "Only buy, at your pace. It can't withdraw or send your money anywhere else. The vault program enforces this."
  - **A "Paused" badge** when `paused` is true.
  - **The link** "Check your vault on Solana Explorer ↗", which opens `explorerUrl`. Use `WebApp.openLink` inside Telegram and a normal link outside.
- **Done when:**
  - tests cover each row, the paused badge, the demo-period note, and a missing `vault` (the card hides);
  - no wording recommends anything.

**M6. Recent buys.**
- **Do:** up to five lines from `recentBuys`, e.g. "$1.05 of Apple · 3 min ago". Format relative time without a library; use plain dates past 7 days. Hide the section when there are none.
- **Done when:** tests cover none, one, and five buys, and the relative-time formatting.

**M7. Polish, checks and deploy notes.**
- **Do:**
  - loading skeletons that reserve space (no layout shift), and calm errors with no stack traces;
  - a reduced-motion check and keyboard focus rings;
  - 360 px screenshots in light and dark;
  - the first-load JS size from the build (aim to beat round 1's);
  - `README.md` with the run, mock (`?mock=1`), test and deploy notes.
  - Update the mock so it carries B1 and B2's new fields.
- **Done when:** all the checks in "How to work" pass and the PR has the screenshots.

### What Dean does after merging (not in this round)

1. Make the backend public (Railway). The Mini App's vault section needs a reachable `NEXT_PUBLIC_API_URL`.
2. Deploy the Mini App to Vercel: root `miniapp/`, with `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_BOT_URL` set.
3. Set the backend's `MINIAPP_URL` (the bot's "Open the comparison" button) and `MINIAPP_ORIGIN` (CORS).
4. Optionally set the Mini App in BotFather as the bot's main app.

### Out of scope

Signing or any wallet code, withdrawals or plan changes from the Mini App (they stay in the bot behind Confirm cards), the daily comparison, new chart types, push notifications, other currencies, logos of companies, and any backend change beyond B1 and B2.

### If you get stuck

- **The live backend differs from this brief:** trust the backend, note it in the PR, and keep `api.ts` the only place that knows the shape.
- **A figure on screen disagrees with the backend:** the backend is right. Stop and write it up; don't fix it in the UI.
- **B2 can't read a vault from the chain** (an RPC error or a rate limit): return `vault: null` with a server-side log line, never a guess from the database.

---

## Round 1 brief (Nov 5, 2026): done, merged in PR #6

### What the screen looks like (top to bottom)

1. **Header:** "Pacer" and the user's display currency toggle (NGN / USD).
2. **Comparison (the hero).** Title: "What ₦20,000 would have become". A line chart of the three paths over 5 years (`series`: `naira`, `usdc`, `sp500`), labelled directly on the lines (not a separate legend). Under it, three rows: kept in naira, kept in USDC, in the S&P 500, each with the end value **and the worst drop**. The worst drop is marked on the chart for USDC and the S&P (peak to trough). A toggle switches between "₦20,000 once" and "₦200 a day for 12 months". Past-performance label directly under the chart.
3. **Holdings.** What the vault holds now, as value in the display currency with USD underneath: a single horizontal allocation bar (USDC waiting, SPYx, AAPLx, NVDAx) and a list under it. Show "Put in so far" and "Change since the start". If a price is missing or stale, show "price unavailable" for that line, never a guess.
4. **Footer:** one plain line: "This is a hackathon demo on Solana devnet." and the link to the bot.

One screen, scrolls vertically, no tabs, no router beyond `/`. Mobile first (Telegram's viewport), 16 px side gutters, nothing that scrolls sideways.

### Look and feel
- Use Telegram's theme: read `Telegram.WebApp.themeParams` (`bg_color`, `text_color`, `hint_color`, `button_color`, `secondary_bg_color`) into CSS variables, and follow `colorScheme` for dark/light. Fall back to `prefers-color-scheme` outside Telegram.
- Call `Telegram.WebApp.ready()` and `expand()` on load. Use the Telegram back/main button only if you need one; you probably don't.
- Chart colours: three clearly different hues that stay legible in both themes, direct line labels, a visible zero-to-start baseline. Naira in a neutral grey, USDC and S&P in distinct colours. Don't rely on colour alone (end labels carry the name).
- Numbers use tabular figures and thousands separators; money in NGN uses `₦` and no decimals; USD shows two decimals.

### Data you read (all from the backend, `NEXT_PUBLIC_API_URL`)

**1. `GET /history/compare`: public, built and live.**
- Lump sum: `/history/compare?amountNgn=20000`.
- Daily: `/history/compare?dailyNgn=200&months=12`.
- Response (`HistoryComparison`):
  ```ts
  {
    disclaimer: string;                       // "Past performance. Not a prediction or a promise." Render this exact string.
    months: number;
    series: { month: string; naira: number; usdc: number; sp500: number }[];   // values in NGN
    naira:  { endNgn: number; maxDrawdownPct: number };
    usdc:   { endNgn: number; maxDrawdownPct: number };
    sp500:  { endNgn: number; maxDrawdownPct: number };
    apple:  { endNgn: number; maxDrawdownPct: number };   // not shown on this screen
    nvidia: { endNgn: number; maxDrawdownPct: number };  // not shown on this screen
  }
  ```
- For the ₦20,000 example the backend returns the numbers in `../docs/bot-messages.md` §9 (naira ₦20,000; USDC ₦49,027 with a 22.4% worst drop; S&P ₦86,256 with a 19.8% worst drop). **Your screen must match them.** Add a test that renders the fixture and checks those figures appear.

**2. `GET /vaults/:owner/holdings`: built, but not yet usable by you.**
- Auth: send `x-telegram-init-data: <Telegram.WebApp.initData>` on every call. The backend verifies the signature and finds the owner itself. Missing or invalid: `401`. No wallet for the user: `404`.
- Today it returns `[{ mint, raw, uiAmount }]` and expects the owner's address in the URL, which a Mini App doesn't have.

### What the backend still owes you (the backend agent builds these; code against the shapes below and mock them until they land)

These are **not built yet**. Don't edit `backend/`. Build against these exact shapes behind one typed `api.ts`, switch between the real API and a mock with `?mock=1` (and `NEXT_PUBLIC_MOCK=1`), and list in your PR which parts ran against the mock.

1. **`GET /vaults/me/holdings`**: `me` means "the user in `initData`". Response:
   ```ts
   {
     displayCurrency: 'NGN' | 'USD';
     ngnPerUsd: number;                        // parallel-market rate used, for the "rate" caption
     totalValueUsd: number | null;             // null when any line is unpriced
     putInUsd: number;                         // same "put in so far" figure as the bot's "How am I doing?"
     waitingUsdc: number;                      // USDC in the vault not yet invested (UI units)
     holdings: {
       symbol: 'USDC' | 'SPYx' | 'AAPLx' | 'NVDAx';
       uiAmount: number;
       valueUsd: number | null;                // null = price unavailable
       priced: boolean;
     }[];
   }
   ```
2. **CORS:** the backend will allow your Vercel origin (`MINIAPP_ORIGIN`). Until then, the real API only works through the mock or a local proxy; don't work around it with a public CORS proxy.
3. **The bot's "Open the comparison" button** (a `web_app` button pointing at your deployed URL). Dean wires `MINIAPP_URL` after your first Vercel deploy.

### Tasks (in this order, one commit each)

1. **Scaffold.** `miniapp/` as a Next.js + TypeScript project with Recharts, a `typecheck` script and a test runner (Vitest or Jest). Commit `bun.lock`. Document `NEXT_PUBLIC_API_URL` in `.env.example`. **Done when:** `bun run build` is green and the page renders "Pacer".
2. **Telegram shell.** Load the Telegram script, `ready()`/`expand()`, map `themeParams` to CSS variables, expose `initData` (or `null` outside Telegram) through one small hook. **Done when:** the page themes itself inside Telegram and in a plain browser, with tests for the hook's two states.
3. **`api.ts` and the mock.** Typed fetchers for `/history/compare` and `/vaults/me/holdings`, a mock with the §9 figures and a sample vault, and a helper that turns errors into the calm states above. **Done when:** tests cover success, `401`, `404` and a network error for each.
4. **Comparison.** The chart, the three rows with end value **and** worst drop, the peak-to-trough markers, the lump-sum / daily toggle, the past-performance label and the "held dollars while the naira fell" line. Copy is in `src/copy.ts`, taken from `../docs/bot-messages.md` §9; no inline strings in components. **Done when:** a test renders the ₦20,000 fixture and finds ₦49,027, 22.4%, ₦86,256 and 19.8% and the exact disclaimer string; the rule "no gain without its drop" is covered by a test that fails if a row renders without a drop.
5. **Holdings.** The allocation bar, the list, "put in" and "change since the start", "price unavailable" lines, and the outside-Telegram message. **Done when:** tests cover priced, partly unpriced and empty vaults, and display-currency switching (NGN with the rate caption, USD).
6. **Polish and checks.** Loading skeletons, an error state that never shows a stack trace, 360 px layouts in light and dark, keyboard focus and `aria-label`s on the chart (a short text summary of the three end values for screen readers). **Done when:** the PR has screenshots at 360 px in both themes.
7. **Deploy notes.** A short `README.md` in `miniapp/`: how to run, env vars, how Dean deploys to Vercel (root directory `miniapp`), how to open it in Telegram (BotFather: set the Mini App URL), and how to preview in a browser with `?mock=1`.

### Out of scope this round
Wallet connection, signing, withdrawals from the Mini App, settings screens, push notifications, a time-series portfolio chart (the backend doesn't keep one; the allocation bar is enough), any other currency than NGN/USD, live price feeds, and any change outside `miniapp/`.

### If you get stuck
- The backend response differs from this brief: trust the backend's actual response, note the difference in the PR, and keep `api.ts` the only place that knows the shape.
- A number on screen disagrees with `../docs/bot-messages.md` §9: the backend is right and the copy is the target. Stop and write it up; don't "fix" it in the UI.
- You need something that touches a key, a transaction or Solana: don't. That is out of scope by design.
