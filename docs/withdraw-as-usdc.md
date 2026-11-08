# Design: withdraw as USDC (owner-only sell instruction)

**Status: spec only. No program, backend, bot, or Mini App change is made
by this document.** It designs the post-hackathon work already named in
[bot-messages.md](bot-messages.md) §7 (“Selling for USDC inside the vault
would need a new owner-only `sell` instruction (post-hackathon)”) and in
the FAQ copy for `withdraw_how`.

## Problem

Today `withdraw` moves tokens **in kind**: USDC arrives as USDC and stock
tokens (AAPLx, NVDAx, SPYx) arrive as stock tokens. To end up with USDC a
user must open their wallet's Swap screen and sell each stock themselves.
Users ask for “withdraw as USDC”: one flow after which only USDC reaches
their wallet.

## Principle that does not move

The vault's promise is unchanged: **the keeper (the AI agent) can never
move money out, and money can only ever leave to the vault's fixed
`withdrawal_destination`.** A sell is a withdrawal-shaped action, so it
is **owner-only**, exactly like `withdraw`. There is no keeper variant,
no keeper-reachable sell path, and no destination argument anywhere in
this design. `prove:keeper` must keep passing with a sell attempt added
to its list of refusals (see Tests).

## Program: new instruction `sell` (owner only)

One new instruction in `pacer_vault`, appended to `lib.rs` and the IDL.
Nothing existing is modified.

```
sell(stock_in: u64, min_usdc_out: u64)
```

It sells stock held in the vault **into USDC held in the same vault**
(the user's existing `withdraw` then moves that USDC out, or a later
combined flow does both — see “One transaction or two”). Selling into
the vault rather than straight to the wallet keeps `withdraw` the only
instruction that pays out, so the payout rule stays auditable in one
place.

### Accounts (mirroring `Buy`, with the owner signer replacing the keeper)

| Account | Constraints | Notes |
| --- | --- | --- |
| `owner` | `Signer`, `has_one = owner` on the vault | The only signer besides `payer`. The keeper key must fail this check. |
| `payer` | `Signer`, mut | The gas wallet, as in `withdraw`; pays for the USDC ATA if needed. |
| `config` | `seeds = [CONFIG_SEED]` | `halted`, allowlist, `swap_program`, slippage, price age — all read, none written. |
| `vault` | mut, `seeds = [VAULT_SEED, vault.owner]`, `has_one = owner` | As `Withdraw`. |
| `price` | `seeds = [PRICE_SEED, stock_mint]` | The oracle price for the stock being sold. |
| `usdc_mint` | `address = config.usdc_mint` | USDC proceeds land here. |
| `stock_mint` | mut | The stock being sold. |
| `usdc_vault_ata` | mut, ATA(mint = usdc_mint, authority = vault) | Proceeds. `init_if_needed` is unnecessary: `create_vault` already creates it. |
| `stock_vault_ata` | mut, ATA(mint = stock_mint, authority = vault) | Source. Must already exist with a balance (nothing to sell otherwise). |
| `swap_program` | executable, `address = config.swap_program` | As in `Buy`: checked against config, never trusted from the caller. |
| `treasury_usdc`, `mock_authority` | As in `Buy` | Devnet swap plumbing; on mainnet these become the Jupiter route accounts (see Swap layer). |
| token programs, ATA program, system program | As in `Buy` | Stock is Token-2022, USDC is legacy Token. |

### Checks, in order (each maps to an existing error where one fits)

1. `!config.halted` → `Halted` (6010). Selling while halted must be at
   least as restricted as buying.
2. Stock mint is allowlisted: `config.is_allowed(stock)` →
   `MintNotAllowed` (6005). (Being *chosen* is a buy rule, not a sell
   rule: a user must be able to sell a stock they no longer choose —
   `listVaultBalances` already lists unchosen stocks so nothing is
   stranded, and selling them is the point.)
3. Withdrawal-delay gate, identical to `withdraw`: `lock_until` →
   `WithdrawLocked` (6021); when a delay is enabled, an open window →
   `WithdrawWindowClosed` (6022). A sell converts holdings toward cash,
   so it inherits the same cooling-off protection as taking cash out.
   **Open question** (below): whether `sell` opens/requests the window
   itself. This spec says no — it reuses `request_withdraw` as-is.
4. `stock_in > 0` → `ZeroAmount` (6020), and `stock_in <= stock balance`
   (the token transfer in the swap enforces this; the check order keeps
   the friendly error first).
5. Price exists, is fresh (`max_price_age_secs`), and is non-zero →
   `StalePrice` (6015) / `InvalidPrice` (6014) — the same reads `buy`
   makes, via the same `PriceAccount`.
6. Quote and slippage floor, the inverse of `buy`'s:
   `quoted_usdc = stock_in * price_micro_usdc / 10^stock_decimals`
   (u128, the mirror of `math::quote_out`), then
   `floor = slippage_floor(quoted_usdc, config.max_slippage_bps)`.
   Require `floor > 0 && min_usdc_out >= floor` →
   `SlippageTooHigh` (6016). `min_usdc_out = 0` can never pass, exactly
   as `min_out = 0` cannot in `buy`. The new pure function
   `quote_usdc_out` sits beside `quote_out` in `math.rs` with
   CONTRACT.md-style test vectors.
7. Swap CPI signed by the vault PDA (the same `[VAULT_SEED, owner, bump]`
   seeds as `buy`), calling the swap program's sell entry point.
8. **Do not trust the callee** (as `buy` steps 11–12): reload both ATAs
   and require the stock decrease equals `stock_in` exactly and the
   USDC increase is `>= min_usdc_out`. New appends to `VaultError` only
   if these need distinct names — see Errors.
9. Emit `Sold` (below). Vault pace state (`allowance`, `total_invested`)
   is **not** touched: a sell is not a buy, and `total_invested` keeps
   meaning “USDC put to work”, which the bot's “put in so far” figure
   depends on. Proceeds sit in `usdc_vault_ata` and already count as
   vault USDC in every existing valuation.

### Event (append to `events.rs`)

```rust
#[event]
pub struct Sold {
    pub owner: Pubkey,
    pub mint: Pubkey,          // stock sold
    pub stock_in: u64,
    pub usdc_out: u64,         // actual USDC received, not the floor
    pub price_micro_usdc: u64,
    pub ts: i64,
}
```

### Errors (append-only, per the rule in `errors.rs`)

Reuse first: `Halted`, `MintNotAllowed`, `WithdrawLocked`,
`WithdrawWindowClosed`, `ZeroAmount`, `StalePrice`, `InvalidPrice`,
`SlippageTooHigh`, `MathOverflow`. Append only if step 8 needs its own
names, continuing the numbering (6016 is `SlippageTooHigh`; the enum
currently ends at 6027 `InvalidSwapProgram`):

```
SellOverspend,   // 6028 — swap took more stock than stock_in
SellShortfall,   // 6029 — swap returned less USDC than min_usdc_out
```

Existing codes never move; the backend maps errors by name.

## Swap layer

Devnet: `mock_swap` today only mints stock for USDC. It needs a reverse
entry point (`swap_usdc_out` or a symmetric `sell`): burn/transfer the
vault's stock back and release USDC from the program's treasury at the
oracle price, refusing below `min_usdc_out` with its existing
`SlippageExceeded`. It stays permissionless and devnet-only, as now.

Mainnet: `config.swap_program` points at a Jupiter route instead; the
`sell` instruction's account list must forward Jupiter's route accounts
through `remaining_accounts`, the same forwarding hook `withdraw`
already documents for transfer hooks. The quote source (oracle price)
remains the floor authority — Jupiter's executed amount is checked
against it in step 8, never trusted on its own.

## One transaction or two

Two candidate user flows:

- **A. Two instructions, two steps.** `sell` per stock (credits vault
  USDC), then the existing “withdraw everything” moves all USDC out.
  Pros: `withdraw` stays the only payout; each sell is independently
  confirmable. Cons: two Confirm cards; a user can stop half-sold.
- **B. One transaction.** The backend builds a single transaction:
  `sell` for each stock leg, then `withdraw` for the full USDC balance
  (existing legs + proceeds), all owner-signed, mirroring how
  `withdrawAllAsOwner` already packs legs into one transaction.
  Pros: atomic — the user never sits in a half-sold state. Cons: one
  price staleness failure blocks the whole exit.

**Recommendation: B for “withdraw everything as USDC”, A left available**
as the lower-level primitive (a future “sell just Apple” can reuse A).
B reuses `withdraw`'s window/delay checks unchanged — and because every
`sell` in B is paired with the final `withdraw` in the same transaction,
the delay gate is evaluated against the same open window.

## Backend (after the program ships)

- `VaultClient.sellAsOwner({ owner, mint, stockIn, minUsdcOut })` —
  owner signer only, built exactly like `withdrawAsOwner` (destination
  never involved; proceeds stay in the vault). Deliberately **no**
  `sellAsKeeper`: a spec test, mirroring the existing “no keeper path
  can reach withdraw” test, asserts the client exposes no keeper sell
  and that no keeper-signed transaction contains one.
- `AnchorVaultClient` maps `Sold`/errors through the existing
  `VaultProgramError` path (the new names arrive via the IDL; run
  `bun run sync:idl` after deploy). `FakeVaultClient` mirrors the checks
  (allowlist, zero amount rejection, `min_usdc_out = 0` rejection,
  balance-checked swap at the stored price) so bot tests need no chain.
- Keeper slippage handling, price publication, and the 5-minute mint
  metadata cache are reused unchanged. Selling never happens on a
  schedule — there is no keeper sell tick.

## Bot flow (after the backend ships)

- “Withdraw everything” keeps its current card. A second, explicit
  choice is offered ("Withdraw as USDC" / typed "withdraw as USDC" /
  `/withdraw` follow-up button) which builds the option-B card:
  current estimated USDC per stock at the live oracle price, the
  slippage floor as the guaranteed minimum (“you get at least …”), and
  the fixed destination. Estimates are labelled as estimates; the
  Confirm card shows the floor, not a promise.
- On confirm: one owner-signed transaction (sell legs + withdraw). On
  success the confirmation shows USDC received and links the
  transaction. The “sell it in your wallet's Swap screen” note
  (`withdrawSellNote` in `bot/messages.ts`) is shown **only** on the
  in-kind path, as today; the as-USDC path says the stocks were sold
  into USDC inside the vault before withdrawal.
- Copy rules hold: no promise wording, worst-price floor stated
  plainly, at most one emoji, none on money moving out. If any leg's
  price is stale, the card refuses with the existing “prices are
  updating” short reason rather than quoting a guess.

## Mini App

Read-only as ever: no changes required. Post-sell balances already
render correctly because proceeds are vault USDC (“Waiting to be
invested” and the USDC holding line already exist).

## Tests

Program (LiteSVM, `tests/`): sell happy path at the oracle price;
keeper-signed sell refused (`NotOwner` path); non-allowlisted mint
refused; stale price refused; `min_usdc_out = 0` and below-floor
refused (`SlippageTooHigh`); floor-0 quote refused; closed withdrawal
window refused when a delay is enabled; overspend/shortfall callee
refused (step 8); `Sold` event fields; selling an unchosen-but-allowed
stock succeeds; `withdraw` in kind is byte-for-byte unaffected.

Backend: `VaultClient` fake/anchor parity for the checks above;
“no keeper sell” client test beside the existing withdraw one;
`prove:keeper` gains a fourth refusal (keeper attempts `sell`) and the
demo script's exit beat keeps passing in kind.

## Rollout

1. Program: `math::quote_usdc_out` + vectors → `sell` → IDL regen →
   LiteSVM tests → devnet deploy → `sync:idl`.
2. mock_swap reverse entry point on devnet; mainnet Jupiter wiring is a
   separate, later step (as with buys).
3. Backend: fake, then Anchor client, then the bot card behind the
   existing Confirm machinery. No migration: no new stored state.
4. Copy: §7 of bot-messages.md gains the as-USDC card; the “Withdrawals
   are in kind, on purpose” paragraph is updated to name both paths.
5. DEMO.md's exit beat may optionally show the as-USDC variant; the
   in-kind exit stays a never-cut beat.

## Open questions

1. Does `sell` require the withdrawal window to be open, or should a
   standalone sell (flow A, no payout) be allowed any time? This spec
   picks “window rules apply” for safety and simplicity; splitting the
   gate (sell anytime, payout gated) is the alternative to decide
   before building.
2. Partial sells (“sell half my Apple”) — out of scope here; the
   instruction supports any `stock_in`, so the bot can add it later
   without a program change.
3. On mainnet, who pays Jupiter's routing fees and from which account —
   to be settled with the mainnet buy wiring, not here.
