# Pacer landing page: design

Date: Nov 5, 2026. Status: approved in conversation, awaiting review of this written spec.
Folder: `lander/` (Next.js 16.4.5, Tailwind 4). Branch: `feat/lander`.

## 1. Purpose

A public page that explains Pacer to users and hackathon judges and sends them to the bot.

- **Main action:** open `https://t.me/pacerfinancebot`.
- **Second action (judges):** read the code at `https://github.com/Harrylever/pacer`.
- Devpost and the demo video don't exist yet. They appear as plain "coming soon" text, never as links.
- The page must match the product and `SPEC.md`. A judge who compares the page with the bot, the Mini App or the repo must find the same facts and the same numbers.

The pasted brief ("Build the Pacer landing page") is a light guide. Where this spec differs from it, this spec wins.

## 2. Direction

**References set the structure; the track is the identity.** Studied on Nov 5: Harvey, Ramp, Plaid, Crossmint, Moniepoint. What they share, and what Pacer takes:

- The real product leads every section (the bot conversation, the Mini App chart, the confirm card), instead of spot illustrations.
- One signature texture instead of many drawings. Pacer's is **the track engraved like a banknote**: a stadium-shaped running track drawn as guilloche (the fine interlaced lines used on banknotes), in mint on green-black. It is both a race and money.
- One living element: the amber pace dot, lapping the inner lane at constant speed.
- Restrained motion: one orchestrated load moment, then quiet reveals.
- Two-tone emphasis and monospace labels (Ramp, Crossmint), a serif display face with a plain grotesque (Harvey), dark used as a dominant ground with paper sections between.

**Personality:** calm, exact, unhurried, like a private bank. No hype, no exclamation marks, no emoji.

## 3. Facts the copy must respect

These override the pasted brief.

1. **Safety claim.** The xStocks issuer can freeze or reclaim the stock tokens (SPEC "Risks"; bot copy §1.2). The page never says "nobody can take it".
   - Hero subline ends: "We can't rush it, and we can't take it."
   - Safety headline: "Nobody can rush it. Only you can take it out."
   - FAQ "Is my money safe?" includes: "The stock tokens' issuer, like any regulated issuer, can freeze or reclaim them."
2. **Deposits are briefly custodial.** Step 1 reads: "Send USDC from any Solana wallet or exchange to your Pacer address. Pacer moves it into your vault straight away. From there, only you can withdraw it."
3. **Real comparison figures, not sample ones.** From the snapshot the Mini App tests against (`miniapp/src/__fixtures__/compare-lump.json`, 61 months, Oct 2021 to Oct 2026):
   - Kept in naira: ₦20,000 (worst drop 0%).
   - Kept in USDC: ₦49,027, worst drop 22.4%.
   - In the S&P 500: ₦86,256, worst drop 19.8%.
   - The "₦200 a day" view is not shown (its calculation was wrong and it is hidden in the Mini App too).
4. **Buys are daily.** The chat says "Next buy tomorrow", not "on Thursday".
5. **Voice.** Plain standard English. Pidgin appears only inside the chat mockup, in one line: "Your $10 don land. Moving it into your vault."
6. **No promises.** Every past figure carries "Past performance. Not a prediction or a promise." on the same screen, next to it.
7. "Advice" and "recommendation" appear only in the FAQ answer that says Pacer doesn't give financial advice.
8. Example product fragments (the deposit message, the weekly summary) carry a small "Example" label, and invent no performance figures. The weekly summary example uses only values implied by the ₦300-a-day plan shown in the hero (₦2,100 saved this week) and follows `docs/bot-messages.md` §8, which leaves out performance on purpose.
9. Not available to US users: stated in the hero note, the FAQ and the footer.

## 4. Page structure

Background rhythm: dark, paper, paper, dark, paper, deep green, paper, dark.

### 4.0 Navigation
- Desktop: lockup; links "How it works", "Safety", "FAQ"; "Start on Telegram" button. Transparent over the hero; after scrolling past the hero top it becomes a slim frosted bar.
- Phone: mark, a small "Start" button, a menu button. The menu opens a full-screen sheet; links fade in one after another. No pull-to-close.

### 4.1 Hero (dark): "the track holds the product"
Chosen layout A from the mockups.
- Left: mono eyebrow "An AI agent for steady dollar savings"; Fraunces headline "Save at your *pace.*" (the italic word in mint); subline; buttons "Start on Telegram →" (mint) and "See how it works" (outlined, to `#how`); note "Opens in Telegram. No app to install. Not available to US users."
- Right: the guilloche track (four lanes, start line with mono lane numbers 1 to 4), a low-opacity mint glow, and the phone in the infield showing the bot conversation:
  - Bot: "Your $10 don land. Moving it into your vault."
  - User: "Put ₦300 a day into Apple and the S&P."
  - Bot card: "Put ₦300 a day into Apple and the S&P 500? You can pause or change this any time." [Confirm] [Cancel]
  - User: "Confirm"
  - Bot: "Bought $1.05 of Apple. Next buy tomorrow."
- The headline sits over the left bend of the engraving, like text printed on a banknote.
- Phone layout: text first, then the track scaled down with the phone inside it.
- The chat is a generic chat layout, not a copy of Telegram's interface.

### 4.2 How it works (paper): the staircase (`id="how"`)
- Desktop: three columns, each raised one step above the previous, with a 1 px line over their tops in the logo's stair shape. The amber dot sits on the step currently in view.
- Each step pairs its copy with a real product fragment:
  1. **Deposit once.** Copy per §3.2. Fragment: the bot's deposit message with a shortened address ("7xKX…9fQp"), labelled "Example".
  2. **Set your pace.** "Tell Pacer's AI agent what you want in plain words, in English or Pidgin. It turns that into a plan and shows it to you before anything happens. ₦300 a day is fine. You can pause or change it any time." Fragment: the confirm card.
  3. **Pacer buys steadily.** "Each day your amount unlocks and Pacer buys. Once a week you get a short summary. Nothing else." Fragment: the weekly summary (§3.8), labelled "Example".
- Phone: steps stack vertically along a vertical stair line. No carousel.

### 4.3 What ₦20,000 would have become (paper)
- Right: a phone showing the Mini App comparison chart: three lines (naira, USDC, S&P 500) over the 61 months, labelled directly on the lines.
- Left: the copy ("₦20,000 kept in naira five years ago is still ₦20,000. The same money held in dollars, or in the S&P 500, would be worth far more in naira today. Pacer shows you this before you start, bad years included.") and three result rows. Each row shows the end value **and** its worst drop. A row can't render without its drop.
- Interaction: dragging or hovering along the chart moves a marker; the three rows show the value at that month. Releasing returns them to Oct 2026. Keyboard: the chart is focusable and the arrow keys step through months.
- Directly under the chart: "Past performance. Not a prediction or a promise." and the source line: "NGN/USD: parallel-market rate from news reports (Nairametrics and others). S&P 500 with dividends reinvested." (wording from `data/history/README.md`).
- The data is also available as a visually hidden table for screen readers.

### 4.4 Safety (dark) (`id="safety"`)
- Headline "Nobody can rush it. Only you can take it out." Subline: "Your money sits in a vault run by a Solana program, not in our bank account. The rules are code, and they apply to us too."
- The one illustration: an engraved rounded vault with the lanes wrapped around it and three paths:
  - **In:** from "Your Pacer address".
  - **Buy:** the agent's path, which loops back inside the vault.
  - **Out:** one single path to "Your wallet".
- Three guarantees, each linked to its path. Hover or keyboard focus highlights the path:
  1. **It only leaves to your wallet.** "When you start, you name your own Solana wallet. Withdrawals can go there and nowhere else."
  2. **Your pace is enforced.** "Pacer can't buy faster than the daily amount you chose, even if our servers were broken into."
  3. **The AI agent can only buy.** "Pacer's agent holds one key, and the vault program limits it to buying the stocks you picked, at the pace you set. It can't withdraw, send or move your money anywhere else, even if it misreads a message."
- A small plain note: the issuer's powers (§3.1).
- Link: "Read the code on GitHub".

### 4.5 What you can own (paper band)
- Mono ticker chips: **AAPLx** Apple, **NVDAx** Nvidia, **SPYx** S&P 500. No company logos. Chips lift 2 px on hover.
- "Tokenized stocks on Solana that track the share price. More will follow."

### 4.6 Built first for Nigerians (deep green `#0B6B4F`)
- Headline and body from the brief.
- Background: a faint guilloche rosette that nods to textile geometry. Never a flag, never a cliché.

### 4.7 FAQ (paper) (`id="faq"`)
- Native `<details name="faq">` elements, so one is open at a time and keyboard and screen-reader behaviour come from the browser.
- Questions: "Is my money safe?" (with the issuer sentence), "Can I take my money out?", "Who can use Pacer?", "How much do I need to start?", "What does it cost?" ("[Fees to be confirmed.]", visible and searchable), "Is Pacer giving financial advice?".

### 4.8 Final CTA (dark)
- "Start with what you already hold." / "Pacer opens in Telegram. Setup takes a few minutes." / "Start on Telegram".
- The track returns. When the section scrolls into view, the dot starts three-quarters of the way round, runs the final quarter of the lap at the hero's speed, and rests on the finish line.

### 4.9 Footer (dark)
- Lockup and tagline "Save at your pace."
- Links: Telegram bot, GitHub. Plain text: "Devpost (coming soon)", "Demo video (coming soon)".
- Small print: "Built for the MLH Solana Hackathon, November 2026. The demo runs on Solana devnet. Not available to US users. Figures shown are past performance, not a prediction or a promise."

### Dropped from the brief
The mobile swipe carousel, pull-to-close on the menu sheet, magnetic buttons, 3D tilt on the phones, the "₦200 a day" chart view, the sample-data flag, and spot illustrations other than the Safety vault.

### AI track (added Nov 6)
Pacer enters the AI track. The page names the agent in three places, in the track's own terms (an agent holding a wallet with spending limits; plain-language requests turned into a plan confirmed before anything happens): the hero eyebrow, How it works step 2, and Safety guarantee 3. The AI understands and proposes; it never picks stocks or gives advice, and the page carries no accuracy figures or "AI-powered" wording. The fuller AI story goes on Devpost and in the demo video.

## 5. Visual system

### 5.1 Colour
All tokens live in `app/tokens.css` and are mapped into Tailwind's theme. No hex value appears in a component.

| Token | Value | Use |
|---|---|---|
| `--surface` | `#F6F4EE` | Paper ground |
| `--surface-raised` | `#FFFFFF` | Cards, chat bubbles |
| `--ink` | `#12201C` | Text on paper |
| `--ink-muted` | `#5C6863` | Secondary text on paper |
| `--primary` | `#0B6B4F` | Main actions on paper, links, the Nigeria band |
| `--primary-deep` | `#0E1513` | Dark sections |
| `--mint` | `#3FCB9B` | Main actions and emphasis on dark; the engraving |
| `--on-primary` | `#FFFFFF` | Text on primary |
| `--accent` | `#E8A33D` | The pace dot (a shape, never text) |
| `--accent-ink` | `#9A5B00` | Amber text on paper |
| `--gain` | `#1A5FD0` | Positive change, always with ▲ and + |
| `--loss` | `#C2410C` | Negative change, always with ▼ and − |
| `--divider` | `#E4E0D6` | Hairlines on paper |
| `--border-control` | `#7A837F` | Outlined buttons on paper |
| Dark grounds | text `#E9EFEC`, muted `#9AA7A2`, raised `#18221F`, gain `#6CB6FF`, loss `#FF9E64` | Per-section overrides |
| Green band | muted `#CFE3DA` | The brief's muted grey fails contrast on `#0B6B4F` |

Every text and background pair meets WCAG 2.2 AA (checked during the build). Sections set their own ground; the page does not switch with the operating system's dark mode.

### 5.2 Type
- **Fraunces**: headlines. Weight about 380 at optical size 144, tight leading (about 0.95 on the hero), `text-wrap: balance`. Italic only for the one emphasised word.
- **Schibsted Grotesk** (400, 500, 600): body and interface.
- **IBM Plex Mono** (400, 500): eyebrows, lane numbers, ticker symbols, chart axes, "Example" labels.
- **Figures:** tabular numerals in tables, the chart and the result rows; normal numerals in running text (tabular figures put visible gaps in prices like "$1.05"). If Schibsted Grotesk lacks tabular figures, the result rows use Plex Mono.
- Loaded with `next/font/google`: self-hosted, Latin subset, `display: swap`, only the weights listed. The choice is documented in a comment beside the tokens.

### 5.3 Layout and shape
- Max content width 1200 px on a 12-column grid. Side gutters: 16 px (phone), 32 px (tablet), 56 px (desktop). Designed mobile first at 360 to 390 px, up to 1440 px.
- Left-aligned; only the final CTA headline is centred.
- Buttons are pills (at least 44 px tall); cards 16 px radius; phone 44 px radius.
- Shadows only on the phones. Elsewhere, depth comes from 1 px hairlines, the engraving, faint mint or amber radial glows at low opacity, and a light grain over dark sections. No gradient washes, no purple.
- Buttons: mint with dark text on dark grounds, green with white text on paper; outlined secondary; pressed scale 0.98. Focus rings 2 px: `--primary` on paper, `--mint` on dark.

### 5.4 The engraving system
One generator, `lib/guilloche.ts`, run on the server, so engravings ship as static SVG with no client JavaScript.
- **Track:** a stadium (two straights, two semicircles) with four lanes. Each lane is filled with five phase-shifted sine strands between solid lane lines. Infield: a few fine concentric lines. Start line with mono lane numbers.
- **Vault:** the same lanes wrapped around a rounded rectangle, for the Safety illustration.
- **Rosette:** a woven circular pattern for the Nigeria band.
- **Lane divider:** three thin parallel arcs between some sections.
- Strands are emitted as smooth curves (one curve per half-wave), not dense point lists. Budget: each drawing under 40 KB of SVG before compression.
- The generator is deterministic (same input, same output), so server and client never disagree.

## 6. Motion

Motion for React (`motion/react`, via `LazyMotion` with `domAnimation`) is loaded **only** for the hero sequence and chat. Everything else is CSS plus small client components.

### 6.1 Hero load (plays once; buttons work from first paint)

| Time | What | How |
|---|---|---|
| 0–600 ms | Five lane lines draw in, 100 ms apart (stroke-dashoffset); strands fade in | CSS |
| 150 ms | Eyebrow fades in | CSS |
| 250–850 ms | Headline rises word by word, 90 ms apart | Motion |
| 600 ms | The dot appears on the start line and starts lapping (14 s a lap, linear, forever) | CSS / SVG |
| 750–1150 ms | Subline, buttons, note fade up | Motion |
| 900–1500 ms | Phone rises 40 px with a spring (stiffness about 150, damping about 24, overshoot under 5%) | Motion |
| 1.5 s to about 5 s | Chat plays once: typing dots before each bot message, then rests | Motion |

The headline completes by about 0.9 s, so Largest Contentful Paint stays well under 2.5 s.

### 6.2 Elsewhere
- Scroll reveals: fade and rise 20 px, children 70 ms apart, 500 ms ease-out, once only (IntersectionObserver).
- Staircase dot: glides to the active step, 500 ms ease-out.
- Nav: frosted state transitions in 200 ms.
- Comparison rows: count up once over 800 ms when first in view; scrubbing updates instantly.
- FAQ: smooth open where `::details-content` and `interpolate-size` are supported; instant elsewhere; chevron rotates in 180 ms.
- Final CTA dot: starts three-quarters of the way round and runs the final quarter at hero speed (about 3.5 s at 14 s a lap), then rests on the finish line. Plays once, when the section first comes into view.
- Ticker chips: lift 2 px on hover, 150 ms.

### 6.3 Rules
- Animate only transform and opacity, except the one-time line drawing at load.
- Linear only for the dot; ease-out for everything else.
- **Reduced motion** (`prefers-reduced-motion: reduce`): no load sequence (all content shown), chat shown complete, dot at rest on the start line, reveals and count-up off, FAQ instant, Motion configured with `reducedMotion="user"`.

## 7. Architecture

```
lander/
  app/
    layout.tsx            fonts, metadata, skip link, <html lang="en">
    page.tsx              server component composing the sections
    tokens.css            the tokens (imported by globals.css)
    globals.css           Tailwind, theme mapping, base styles
    icon.svg              favicon (from pacer-favicon.svg)
    opengraph-image.tsx   next/og image: track engraving + lockup
  components/
    sections/             Nav, Hero, HowItWorks, Comparison, Safety,
                          Tickers, Nigeria, Faq, FinalCta, Footer (server)
    engraving/            Track, Vault, Rosette, LaneDivider (server, SVG)
    islands/              "use client" only:
                          HeroSequence + Chat (Motion), NavBar (scroll state, sheet),
                          Staircase (active step), ComparisonChart (SVG chart + scrubbing),
                          Reveal (IntersectionObserver), CountUp
    ui/                   Button, Chip, Phone (server)
  content/
    landing.ts            all copy
    history.json          copy of the Mini App's real comparison snapshot
    history.ts            typed access + source wording
  lib/
    guilloche.ts          the engraving generator
  public/brand/           pacer-lockup.svg, pacer-lockup-dark.svg, pacer-mark.svg,
                          pacer-favicon.svg (copied from assets/)
```

- Server Components by default; only the islands above are client components.
- The chart is a hand-built SVG (no Recharts).
- The page never calls the backend or any third party. No tracking scripts, no embeds.
- Removed from the scaffold: shadcn/Base UI components, Hugeicons, Inter and Geist, the starter page and starter SVGs.
- Next.js 16 conventions are taken from `lander/node_modules/next/dist/docs/` (per `lander/AGENTS.md`), not from memory.
- Performance targets: first-load JavaScript under about 150 KB compressed (the build's real number is reported), LCP under 2.5 s on a mid-range phone on 4G, CLS 0 (every animated element has reserved space).

## 8. Accessibility

- Logical heading order (one `h1`), skip link, real links and buttons, visible focus rings.
- Decorative SVGs (engravings, glows) are `aria-hidden`. The Safety illustration has a text equivalent (the three guarantees).
- The chart has a text alternative (a hidden table) and keyboard operation.
- Tap targets at least 44 px. No horizontal scroll at 360 px.

## 9. Testing and verification

- Scripts: `lint`, `typecheck` (`tsc --noEmit`), `test` (Vitest), `build`. All pass before the PR.
- Unit tests:
  - `guilloche.ts`: paths close, output is deterministic, each drawing is under the 40 KB budget.
  - Content invariants: every "Start" link is `https://t.me/pacerfinancebot`; the GitHub link is `https://github.com/Harrylever/pacer`; Devpost and demo video are not links; the page figures equal the snapshot (₦49,027, 22.4%, ₦86,256, 19.8%); the disclaimer string is present beside the comparison; "advice" and "recommendation" occur only in the FAQ advice answer; no "nobody can take".
  - Comparison: each result row renders a worst drop; scrubbing values come from the snapshot.
- Visual review in Chrome at 360, 390 and 1440 px with motion settled: contrast, focus, no horizontal scroll, and the questions "distinctive or template?" and "is every number labelled honestly?". Fix what fails once, then report.
- Reduced motion: checked with a headless Playwright script run through `bunx` (not a project dependency). If the browser download isn't wanted, checked by temporarily forcing the media query in CSS.

## 10. Delivery

- Work on branch `feat/lander`; the brand SVGs are copied into `lander/public/brand/` and the root `assets/` folder is left as it is.
- `.superpowers/` (brainstorm mockups) is git-ignored.
- One PR to `main` for Dean to review and merge.
- Deployment (Vercel, root directory `lander/`) happens only on Dean's go-ahead.
