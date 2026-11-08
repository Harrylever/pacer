# Pacer landing page

The public page for Pacer: what it is, how it works, the real ₦20,000 comparison,
why the vault is safe, and a button that opens the bot. It is one static page.

Design: `../docs/superpowers/specs/2026-11-05-lander-design.md`.
Plan it was built from: `../docs/superpowers/plans/2026-11-05-lander.md`.

## Run it

```bash
bun install
bun run dev                  # http://localhost:3000
bun run test                 # Vitest
bun run typecheck && bun run lint && bun run build
```

Bun installs, Node runs. There are no environment variables to set.

## Where things live

| What | Where |
| --- | --- |
| All copy (and the two links) | `content/landing.ts` |
| The comparison figures | `content/history.json`, a byte-for-byte copy of `../miniapp/src/__fixtures__/compare-lump.json` |
| Colours (the only place hex values live) | `app/tokens.css` |
| The engraving generator (track, vault, rosette) | `lib/guilloche.ts` |
| Page sections | `components/sections/` |
| Client islands (the only code that runs in the browser) | `components/islands/` |

The page never calls the backend or any third party, and it has no tracking.

To refresh the comparison, copy the Mini App's fixture over `content/history.json`.
Tests pin the figures on the page (₦49,027 with a 22.4% worst drop, ₦86,256 with 19.8%)
to that file, so a change to either fails loudly.

## Rules the tests enforce

- Every "Start" link goes to `https://t.me/pacerfinancebot`; Devpost and the demo video are plain text.
- No colour outside `tokens.css` (and the share image), and every text pair meets WCAG AA.
- "advice" and "recommendation" appear once, in the FAQ answer that says Pacer gives no financial advice.
- Every past figure sits next to "Past performance. Not a prediction or a promise."
- Each engraving stays under 40 KB before compression.

## Deploy

Vercel, with the root directory set to `lander/`. The share-image URL is built from
`VERCEL_PROJECT_PRODUCTION_URL`, which Vercel provides at build time.

## Motion and reduced motion

Motion for React is used only for the hero's entrance. Everything else is CSS plus small
islands. With `prefers-reduced-motion: reduce` everything is shown at once, the chat is
complete, the dots rest, and counting, reveals and the FAQ animation are off.
