# Pacer Mini App

One read-only screen opened from the Telegram bot: what an amount would
have become in the past, the user's vault and its rules, and recent buys.
It never signs, holds keys, or talks to Solana — everything comes from
the backend.

Round 2 follows the landing page's brand: the lander's tokens
(`src/app/tokens.css`, copied — never a hex elsewhere), Fraunces /
Schibsted Grotesk / IBM Plex Mono, grounds driven by Telegram's
`colorScheme` (the system scheme outside Telegram), and a hand-built SVG
chart (no Recharts).

## Run it

```bash
cd miniapp
bun install
bun run dev        # http://localhost:3000
```

Preview without Telegram (mock §9 figures, a sample vault with its
rules and two recent buys):

```
http://localhost:3000/?mock=1
```

## Env vars

| Var | Required | What |
| --- | -------- | ---- |
| `NEXT_PUBLIC_API_URL` | yes | Backend base URL, e.g. `http://localhost:3002` |
| `NEXT_PUBLIC_MOCK` | no | `1` forces the mock data (same as `?mock=1`) |
| `NEXT_PUBLIC_BOT_URL` | no | Link behind “Open the Pacer bot”, `https://t.me/pacerfinancebot` |

No tokens, keys, or `DATABASE_URL` belong in this folder.

## Backend dependency

- `GET /history/compare?amountNgn=20000` — public. Round 2 (B1) adds
  `ngnPerUsd` (latest parallel-market rate) and `asOf` (last month in
  the series) to the response.
- `GET /vaults/me/holdings` — verified `x-telegram-init-data` header.
  Round 2 (B2) adds `vault` (the rules read live from Solana: fixed
  withdrawal address, pace, period, stocks, paused, Explorer URL) and
  `recentBuys` (newest 5). Without a reachable backend, use `?mock=1`;
  outside Telegram the vault section calmly says to open it from the bot.

## Checks

```bash
bun run typecheck && bun run test && bun run build
```

In `backend/` (for B1/B2): `bun run test && bun run typecheck && bun run build`.

## Deploy to Vercel

1. New project from this repo, **root directory `miniapp/`**.
2. Framework preset: Next.js. Build command `bun run build`.
3. Env: `NEXT_PUBLIC_API_URL` = the deployed backend, `NEXT_PUBLIC_BOT_URL` = the bot link.
4. Deploy, then give Dean the `https://…vercel.app` URL so he can make the
   backend public, set `MINIAPP_URL` / `MINIAPP_ORIGIN`, and point the bot's
   “Open the comparison” button at it.

## Open it in Telegram

1. Talk to BotFather: `/newapp` (or attach to the existing bot), paste the Vercel URL.
2. The bot team wires the **web_app** button (“Open the comparison”).
3. Open the Mini App from the bot button so `initData` is present; holdings verify against it server-side.
