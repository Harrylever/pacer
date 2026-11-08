# Pacer: CONTRACT.md

The on-chain interface that `programs/` implements and `backend/` builds against. It refines `SPEC.md` (the spec's "Solana vault program" and "Swap layer" sections); where they differ, **this file wins** for anything on-chain, and the differences are listed in "Decisions for Dean" below.

Status: **stage 2 built.** Both programs are implemented and tested (56 LiteSVM tests plus unit tests; see `tests/`). The generated IDL (`target/idl/*.json`, committed copies in `programs/idl/` once deployed) is now the source of truth for names and argument order; where this file and the IDL differ, the IDL wins. Section "Built versus contract" at the end lists every difference.

## Decisions for Dean

Review these first. Each one changes something the spec said.

| # | Decision | Why | Needs |
| --- | --- | --- | --- |
| 1 | **Anchor 1.2.2** (the current stable) and the TS client **`@anchor-lang/core` ^1.2.2**, not `@coral-xyz/anchor`. | `@coral-xyz/anchor` stopped at 0.32.1; the 1.x client moved to `@anchor-lang/core`. Verified: it depends on `@solana/web3.js ^1.69.1`, so the spec's web3.js v1 choice still holds. | SPEC rule 9 changes (included in this PR). `backend/package.json` is Muse's folder: Muse swaps the package in round 2. |
| 2 | **Three instructions added:** `init_price`, `set_halt`, `set_authorities`. | `init_price` creates price accounts explicitly (no `init_if_needed` on data accounts). `set_halt` lets the offline admin stop all buys if the oracle is compromised, while withdrawals keep working. `set_authorities` rotates a leaked keeper or oracle key. | None. |
| 3 | **`execute_withdraw` is folded into `withdraw`.** | One withdrawal path to test and audit. `withdraw` enforces the delay window whenever the vault has a delay. The stretch adds only `request_withdraw`, `cancel_withdraw` and `set_withdraw_delay`. | None. |
| 4 | **Config is immutable after `init_config`**, except the keeper and oracle keys and the halt flag. That includes `period_seconds` and `min_trade`. | Users can check the rules once and trust them. The cost: to change the demo's 10-second "day", deploy a fresh program ID. | None. |
| 5 | The `Config` account is called **`GlobalConfig`**. | The Solana Foundation's naming guidance: a bare `Config` doesn't say what it configures. | None. |
| 6 | **`withdraw` accepts only USDC or an allowlisted stock mint.** | Otherwise a caller could make the gas wallet pay rent for token accounts of arbitrary mints. | None. |
| 7 | **Withdrawal delay is capped** (`max_withdraw_delay_secs`, 7 days in production), and **`lock_until` has no instruction** (the field exists, always 0). | The owner key lives on the server. Without a cap, a compromised server could set a huge delay, and because a decrease must wait out the current delay, funds would be stuck for years. A user-extendable hard lock has the same flaw, so it's cut. | Product call: the "hard lock" idea is out for now. |
| 8 | **Program tests are Rust + LiteSVM 0.17.x**, not Anchor TS tests. | Building Token-2022 mints with the real extensions is straightforward with the `spl-token-2022` crate, and LiteSVM 0.18 needs Rust 1.97.1 (you have 1.96). | None. |
| 9 | **The program's upgrade authority is a separate risk,** and the spec's "nobody can steal the money" doesn't cover it. | Whoever holds the deploy keypair's upgrade authority can replace the program. Fine on devnet. For mainnet: a multisig, or make it immutable. Say so on Devpost. | A Devpost line. |
| 10 | **`init_if_needed` is used only for associated token accounts,** with the mint, authority and token program constrained. Never for data accounts. | Anchor and Solana guidance warn about re-initialization. That risk applies to program data accounts; an ATA's address and owner are fixed by the token programs. | None. |

## Toolchain and pins

| Tool | Version | Note |
| --- | --- | --- |
| Anchor CLI, `anchor-lang`, `anchor-spl` | **1.2.2**, all three exactly equal | Anchor requires matching versions across `anchor-*` crates. |
| Solana CLI | 4.1.2 | The pairing Anchor 1.2.x is tested against. |
| Rust | **1.99.1**, pinned in `rust-toolchain.toml` | `anchor-lang`'s MSRV is 1.89, but every Solana runtime release LiteSVM can use needs Rust ≥ 1.97.1. Installed side by side with `rustup toolchain install 1.99.1`, so the machine's default Rust is untouched. The on-chain build uses Solana's own platform-tools compiler, not this one. |
| `litesvm` (dev) | **`=0.18.2`** | Its transaction types and `anchor-lang`'s share one `solana-instruction` 3.x, so no conversions are needed (checked). The tests live in their own Cargo workspace (`tests/`, with its own lockfile) so LiteSVM's large dependency tree stays out of the programs' lockfile. |
| `spl-token-2022-interface` (dev) | `=2.1.0` | The same version `anchor-spl` uses. Has `pausable`, `scaled_ui_amount`, `permanent_delegate`, `transfer_hook`, `default_account_state` and `metadata_pointer`. |
| TS client | `@anchor-lang/core` ^1.2.2 + `@solana/web3.js@^1` | Pin web3.js to the v1 line. A bare `@solana/web3.js` now installs v3. |

Build and test: `NO_DNA=1 anchor build`, then `cargo test --manifest-path tests/Cargo.toml` (the tests load `target/deploy/*.so`, so rebuild after any program change). Use `solana-v3` (the default feature), not `solana-v4`.

**On every build, check the output for `overflows the maximum allowed frame`.** SBF gives each function a 4,096-byte stack, and Anchor reports a frame overflow as a *warning*, not an error. `Buy` hit it at 4,224 bytes and corrupted memory, which surfaced as a bogus `attempt to multiply with overflow` panic before the handler ran. The fix is to `Box` the large accounts (done for `Buy`). Any new instruction with many accounts needs the same.

## Programs, seeds and addresses

| Program | Job |
| --- | --- |
| `pacer_vault` | Per-user vaults, pace, buy limits, withdrawals, price accounts |
| `mock_swap` | Devnet stand-in for Jupiter: takes USDC-dev, mints the stand-in stock at the oracle price |

Program IDs come from keypairs generated at scaffold time, and `mock_swap` hard-codes `pacer_vault`'s ID, so **generate both keypairs first**. IDs go into `Anchor.toml` and `programs/deployments/devnet.json`.

| PDA | Seeds | Program | Holds |
| --- | --- | --- | --- |
| Config | `["config"]` | pacer_vault | `GlobalConfig` |
| Price | `["price", stock_mint]` | pacer_vault | `PriceAccount` |
| Vault | `["vault", owner]` | pacer_vault | `UserVault`, and is the authority of the vault's token accounts |
| Swap authority | `["mock_authority"]` | mock_swap | Mint authority of every stand-in stock; owner of the USDC-dev treasury |

Token accounts are standard associated token accounts: `ATA(vault, usdc_mint, usdc_token_program)` and `ATA(vault, stock_mint, stock_token_program)`. Never PDAs of our own.

**Two token programs everywhere.** USDC uses the legacy Token program; xStocks use Token-2022. `buy`, `withdraw` and `mock_swap` take **`usdc_token_program`** and **`stock_token_program`** separately (both typed `Interface<TokenInterface>`). Mints are `InterfaceAccount<Mint>`, token accounts `InterfaceAccount<TokenAccount>`, and all transfers are **`transfer_checked`** (via `token_interface`), never plain `transfer`.

## Accounts (state)

All integers are little-endian. Money is in base units: USDC has 6 decimals (micro-USDC), stocks have 8. **Fixed-size fields come first and variable-size last. Every account has a `_reserved` tail** so fields can be added without a layout break.

### `GlobalConfig` (PDA `["config"]`)

| Field | Type | Meaning |
| --- | --- | --- |
| `admin` | Pubkey | Kept offline. Signs only `init_config`, `init_price`, `set_halt`, `set_authorities`. |
| `keeper` | Pubkey | The AI agent. Can only call `buy` and `record_intent`. |
| `oracle_authority` | Pubkey | The price updater. Separate from the keeper. Can only call `update_price`. |
| `usdc_mint` | Pubkey | Must have 6 decimals (checked at init). |
| `swap_program` | Pubkey | Locked at init. `buy` calls only this program. |
| `stock_mints` | `[Pubkey; 10]` | The allowlist, locked at init. |
| `stock_count` | u8 | 1 to 10 entries used. |
| `period_seconds` | u32 | 86,400 in production, 10 for the demo. |
| `min_trade` | u64 | micro-USDC. 1,000,000 ($1) in production, 100,000 ($0.10) for the demo. |
| `max_rate_per_period` | u64 | micro-USDC ceiling for any user's pace. |
| `max_slippage_bps` | u16 | e.g. 100 (1%). Must be < 10,000. |
| `max_price_age_secs` | u32 | e.g. 600. |
| `max_withdraw_delay_secs` | u32 | 604,800 (7 days) in production. |
| `withdraw_window_secs` | u32 | How long a withdrawal window stays open after it unlocks. 86,400. |
| `halted` | bool | When true, `buy` is refused. Everything else works. |
| `bump` | u8 | |
| `_reserved` | [u8; 64] | |

### `PriceAccount` (PDA `["price", stock_mint]`)

Offsets matter: `mock_swap` reads this account's raw bytes.

| Offset | Field | Type | Meaning |
| --- | --- | --- | --- |
| 0 | discriminator | [u8; 8] | `[85, 228, 226, 113, 218, 91, 116, 92]` (`sha256("account:PriceAccount")[..8]`) |
| 8 | `price_micro_usdc` | u64 | Value, in micro-USDC, of **one whole raw token** (10^`decimals` base units) of the stock. This is Jupiter's `scaledUiConfig.usdPricePrescaled` × 1,000,000, **not** `usdPrice`. |
| 16 | `updated_at` | i64 | Unix time from the on-chain clock at the last `update_price`. 0 until the first update. |
| 24 | `mint` | Pubkey | The stock mint this price belongs to. |
| 56 | `bump` | u8 | |
| 57 | `_reserved` | [u8; 32] | |

A new price account starts with price 0 and `updated_at` 0, so `buy` rejects it as stale until the oracle writes a price.

### `UserVault` (PDA `["vault", owner]`)

| Field | Type | Meaning |
| --- | --- | --- |
| `owner` | Pubkey | The user's server-held wallet (Privy or encrypted keypair). Signs deposits, rule changes and withdrawals. |
| `withdrawal_destination` | Pubkey | The user's own wallet. **Set once at creation and never changeable.** |
| `rate_per_period` | u64 | micro-USDC unlocked per period. |
| `allowance` | u64 | The stored allowance. **It only changes inside `settle`**; clients must not read it as "what can be bought now" (see Pace math). |
| `last_checkpoint_ts` | i64 | |
| `total_invested` | u64 | micro-USDC bought so far (for stats). |
| `intent_count` | u64 | |
| `created_ts` | i64 | |
| `lock_until` | i64 | Reserved. Always 0 (decision 7). |
| `withdraw_unlock_ts`, `withdraw_expires_ts` | i64, i64 | The open withdrawal window. 0 when closed. |
| `pending_delay_effective_ts` | i64 | |
| `withdraw_delay_secs` | u32 | 0 means no delay. |
| `pending_delay_secs` | u32 | A lower delay waiting to take effect. |
| `paused` | bool | |
| `bump` | u8 | |
| `last_intent_hash` | [u8; 32] | |
| `last_model_id` | [u8; 16] | |
| `_reserved` | [u8; 64] | |
| `chosen_mints` | Vec<Pubkey> (max 10) | Always last. A non-empty subset of the allowlist. |

## Pace math (`settle`)

Called at the start of `buy` and `set_rules`. Pure integer maths.

```
settle(vault, config, now):
  if vault.paused:
      vault.last_checkpoint_ts = now            // paused time never accrues
      return
  periods  = (now - vault.last_checkpoint_ts) / config.period_seconds     // whole periods, integer division
  accrued  = vault.allowance + vault.rate_per_period * periods            // compute in u128
  cap      = 2 * max(vault.rate_per_period, config.min_trade)
  vault.allowance = min(accrued, cap)
  vault.last_checkpoint_ts += periods * config.period_seconds             // partial periods are kept
```

- **Period 0** has nothing: a fresh vault's `last_checkpoint_ts` is its creation time, so no allowance exists until one whole period passes.
- **Pausing** drops the partial period in progress: `set_rules` settles first (crediting whole periods), then sets `paused`. The next settle while paused moves the checkpoint to `now`, so unpausing starts a fresh period.
- **Changing the rate** affects future periods only (settle runs first with the old rate).

**The off-chain mirror** is `backend/src/common/pace.ts` (`settledAllowance`). The keeper uses it to decide when to buy, because the stored `allowance` stays 0 until a settle runs. These vectors must pass on both sides (`min_trade` 1,000,000 unless noted):

| stored allowance | rate | whole periods | result |
| --- | --- | --- | --- |
| 0 | 144,000 | 0 | 0 |
| 0 | 144,000 | 3 | 432,000 |
| 0 | 144,000 | 6 | 864,000 |
| 0 | 144,000 | 7 | 1,008,000 (first $1 buy) |
| 0 | 144,000 | 365 | 2,000,000 (capped) |
| 900,000 | 144,000 | 1 | 1,044,000 |
| 0 | 5,000,000 | 1 | 5,000,000 |
| 0 | 5,000,000 | 365 | 10,000,000 (capped) |
| 0 | 100,000 (min_trade 100,000) | 1 | 100,000 |

## Quote and slippage floor

```
scale      = 10^stock_mint.decimals                  // read from the mint account, never assumed (8 for xStocks)
quoted_out = (usdc_in as u128) * scale / (price.price_micro_usdc as u128)      // raw stock units; must fit in u64
floor      = quoted_out * (10_000 - config.max_slippage_bps) / 10_000          // u128
require(floor > 0 && min_out >= floor)               // SlippageTooHigh
```

The floor of 0 case is what stops the `min_out = 0` exploit when `usdc_in` is tiny. `mock_swap` uses the same `quoted_out` maths and outputs exactly `quoted_out`.

| usdc_in | price_micro_usdc | decimals | quoted_out | floor at 100 bps |
| --- | --- | --- | --- | --- |
| 1,000,000 | 336,470,000 | 8 | 297,203 | 294,230 |
| 1,000,000 | 768,064,352 | 8 | 130,197 | 128,895 |
| 250,000 | 336,470,000 | 8 | 74,300 | 73,557 |
| 100,000 | 750,000,000 | 8 | 13,333 | 13,199 |
| 1 | 336,470,000 | 8 | 0 | 0 → **rejected** |

## Instructions

Each rule below is enforced **by the program**, not by the backend. Account names are the IDL's. `payer` is always the **gas wallet**, never the user, because users hold no SOL. Every `init` and `init_if_needed` uses `payer`.

### Setup (admin)

**`init_config(args)`**: signers `admin`, `payer`. Creates `GlobalConfig`.
- `args`: `keeper`, `oracle_authority`, `swap_program`, `period_seconds`, `min_trade`, `max_rate_per_period`, `max_slippage_bps`, `max_price_age_secs`, `max_withdraw_delay_secs`, `withdraw_window_secs`, `stock_mints: Vec<Pubkey>`.
- Checks: 1 to 10 distinct, non-default stock mints; `usdc_mint` has 6 decimals; `period_seconds` > 0; `min_trade` > 0; `max_rate_per_period` > 0; `max_slippage_bps` < 10,000; keeper, oracle and admin are three different keys.
- Fails if the config already exists (plain `init`).

**`init_price`** (no arguments; the mint is an account): signers `admin`, `payer`. Creates the `PriceAccount` for an allowlisted mint (price 0, `updated_at` 0). Fails for a mint not in the allowlist.

**`set_halt(halted)`**: signer `admin`. Sets `config.halted`. While halted, `buy` fails with `Halted`; deposits, rule changes, withdrawals and price updates keep working.

**`set_authorities(keeper, oracle_authority)`**: signer `admin`. Rotates the two keys. The three keys must stay different.

### Oracle

**`update_price(price_micro_usdc)`**: signer `oracle_authority`. Accounts: `config`, `price` (the PDA for the mint; the mint is read from the price account).
- Checks: signer is `config.oracle_authority`; `price_micro_usdc` > 0.
- Effect: writes the price and sets `updated_at` from the clock.
- Event: `PriceUpdated`.
- The keeper key cannot call this (`NotOracle`).

### Vault lifecycle (owner)

**`create_vault(withdrawal_destination, rate_per_period, mints, withdraw_delay_secs)`**: signers `owner`, `payer`. Accounts: `config`, `vault` (init), `usdc_mint`, `usdc_vault_ata` (init, authority = vault), token programs, associated token program, system program.
- Checks: 0 < rate ≤ `max_rate_per_period` (`ExceedsMaxRate`); `mints` non-empty, distinct, all in the allowlist; `withdrawal_destination` is not the default key and not the vault PDA; `withdraw_delay_secs` ≤ `max_withdraw_delay_secs`.
- Effect: `last_checkpoint_ts` = now, `allowance` = 0, `paused` = false. The vault PDA is a plain `init`, so a second `create_vault` for the same owner fails.
- Stock token accounts are **not** created here; `buy` creates each one on the first buy of that stock.
- Event: `VaultCreated`.

**`deposit(amount)`**: signer `owner`. Moves `amount` USDC from `owner_usdc` (the owner's token account) to `usdc_vault_ata` with `transfer_checked`. `amount` > 0. Any time. Event: `Deposited`.

**`set_rules(rate_per_period, mints, paused)`**: signer `owner`. Calls `settle`, then applies the new values.
- Checks: same rate and mints rules as `create_vault`.
- Cannot change `withdrawal_destination`, `owner` or the delay.
- All three arguments are required; to change one thing, pass the current values for the others.
- Event: `RulesChanged` (old and new).

**`withdraw(amount)`**: signer `owner`. Accounts: `config`, `vault`, `withdrawal_destination` (must equal `vault.withdrawal_destination`), `mint`, `vault_ata`, `destination_ata` (**init_if_needed**, payer = gas, authority = `withdrawal_destination`), token program for that mint, associated token program, system program.
- Checks, in order: `mint` is `config.usdc_mint` or in the allowlist; `amount` > 0; if `lock_until` > 0 then now ≥ `lock_until`; fold in any due `pending_delay`; if the effective delay > 0, then `withdraw_unlock_ts` ≠ 0 and `unlock ≤ now ≤ expires` (`WithdrawWindowClosed`).
- Effect: `transfer_checked` from `vault_ata` to `destination_ata`, signed by the vault PDA. It forwards `remaining_accounts` into the transfer, so a transfer hook the issuer enables later needs no program change.
- Works when halted and when paused. The keeper has no path to it: every withdraw path requires the **owner's** signature.
- "Withdraw everything" is one transaction with one `withdraw` instruction per held mint, including stocks no longer chosen.
- Event: `Withdrawn`.

### Keeper

**`buy(usdc_in, min_out)`**: signers `keeper`, `payer`; the stock is the `stock_mint` account. Accounts: `config`, `vault`, `price` (PDA for `mint`), `usdc_mint`, `stock_mint`, `usdc_vault_ata`, `stock_vault_ata` (**init_if_needed**, authority = vault), the swap program and its accounts, both token programs, associated token program, system program.

Checks, in this order (the transaction reverts as a whole on any failure):
1. `keeper` is `config.keeper` (`NotKeeper`).
2. `config.halted` is false (`Halted`).
3. `stock_mint` is in the allowlist (`MintNotAllowed`) and in `vault.chosen_mints` (`MintNotChosen`).
4. `vault.paused` is false (`VaultPaused`).
5. `settle` (above).
6. `config.min_trade ≤ usdc_in ≤ vault.allowance` (`BelowMinTrade`, `ExceedsAllowance`).
7. Price is valid and fresh: `price_micro_usdc` > 0 and `now - updated_at ≤ max_price_age_secs` (`InvalidPrice`, `StalePrice`).
8. Slippage floor (above): `floor > 0 && min_out ≥ floor` (`SlippageTooHigh`).
9. The swap program account is `config.swap_program` (the account is typed to that address).

Then:
10. Snapshot both vault token balances. CPI to the swap program, signed by the vault PDA. `reload()` both token accounts.
11. Assert USDC fell by **exactly** `usdc_in` (`SwapOverspend`) and the stock rose by **at least** `min_out` (`SwapShortfall`).
12. `allowance -= usdc_in`, `total_invested += usdc_in` (checked). Emit `Bought`.

There is no balance threshold on-chain: the keeper's "buy once about $1 has built up" is only its own trigger. Two buys of different stocks in one period are fine, as long as the total stays within the allowance.

**`record_intent(intent_hash, model_id)`**: signer `keeper`. Overwrites `last_intent_hash` and `last_model_id`, increments `intent_count`. Event: `IntentRecorded` (the history lives in transaction logs, with no extra rent). This is first on the cut list.

### Stretch: withdrawal delay (build after the core loop works)

The fields and the `withdraw` window check are part of the core build; only these three instructions are stretch.

- **`request_withdraw()`**: signer `owner`. Requires an effective delay > 0 (`DelayNotEnabled`). Sets `withdraw_unlock_ts = now + delay` and `withdraw_expires_ts = unlock + config.withdraw_window_secs`.
- **`cancel_withdraw()`**: signer `owner`. Sets both timestamps to 0.
- **`set_withdraw_delay(new_delay_secs)`**: signer `owner`. `new_delay_secs ≤ config.max_withdraw_delay_secs` (`DelayTooLong`). First folds in any due pending change. An **increase** applies immediately. A **decrease** is stored as `pending_delay_secs` and takes effect at `now + current delay`, so nobody, including a server holding the owner key, can shorten it quickly.

## mock_swap

One instruction, `swap(usdc_in, min_out)`, instruction discriminator `[248, 198, 158, 145, 225, 117, 135, 200]`. `pacer_vault` depends on the `mock_swap` crate with the `cpi` feature to call it; `mock_swap` does **not** depend on `pacer_vault`.

Accounts: `user_authority` (a **signer**, which in practice is the vault PDA), `usdc_mint`, `stock_mint` (mutable), `user_usdc`, `user_stock`, `treasury_usdc` (must be `ATA(mock_authority, usdc_mint)`), `mock_authority` (PDA `["mock_authority"]`), `price` (the `PriceAccount`), both token programs.

Behaviour:
1. Read the price by **raw bytes**: the account's owner must be the hard-coded `pacer_vault` ID; the address must be `find_program_address(["price", stock_mint], pacer_vault_id)`; the first 8 bytes must equal the discriminator above (a test must assert this constant matches the generated IDL); then price at offset 8 and `mint` at offset 24 (must equal `stock_mint`).
2. `out = quoted_out` (same maths as `buy`, decimals read from `stock_mint`). Require `out` > 0 and `out ≥ min_out`.
3. Transfer `usdc_in` USDC from `user_usdc` to `treasury_usdc`, signed by `user_authority`.
4. `mint_to` `out` stock tokens into `user_stock`, signed by the `mock_authority` PDA (which must be the stock mint's mint authority).

It's permissionless and devnet-only: anyone can swap their own USDC-dev for stand-in stocks. It never runs out of liquidity because it mints.

## Mint recipes (devnet)

| Mint | Program | Decimals | Authority and extensions |
| --- | --- | --- | --- |
| `USDC-dev` | legacy Token | 6 | Mint authority is a faucet key held by the backend (it mints for `/faucet`). No extensions. |
| `AAPLx-dev`, `NVDAx-dev`, `SPYx-dev` | Token-2022 | 8 | **Mint authority = the `mock_authority` PDA.** Extensions copied from the real xStocks: permanent delegate, pausable, scaled UI amount (multiplier 1.003, not 1, so display bugs show), transfer hook with no program set, default account state `initialized`, metadata pointer. Freeze authority set. Confidential transfers and the token-metadata record are skipped (the programs never read either). The test harness builds exactly this (`tests/src/common.rs`), and the devnet setup script must do the same. |

The real xStock mints have no transfer fee and no mint-close authority (verified Nov 4), so the stand-ins don't either.

## Events

Emitted with `emit!` (readable in the explorer; logs can truncate on very large transactions, so never use them as the only record). Every event carries `ts` (unix time).

`VaultCreated {owner, withdrawal_destination, rate_per_period, mints, withdraw_delay_secs}` ·
`Deposited {owner, amount}` ·
`RulesChanged {owner, old_rate, new_rate, mints, paused}` ·
`Bought {owner, mint, usdc_in, stock_out, price_micro_usdc, allowance_after}` ·
`Withdrawn {owner, mint, amount, destination}` ·
`PriceUpdated {mint, price_micro_usdc}` ·
`IntentRecorded {owner, intent_hash, model_id, intent_count}` ·
`HaltChanged {halted}` ·
`WithdrawRequested {owner, unlock_ts, expires_ts}` · `WithdrawCancelled {owner}`

## Errors

Anchor numbers custom errors from 6000 in declaration order, so **keep this order** (new errors go at the end). The backend maps errors by name.

| Code | Name | When |
| --- | --- | --- |
| 6000 | `NotAdmin` | Signer isn't `config.admin` |
| 6001 | `NotKeeper` | Signer isn't `config.keeper` |
| 6002 | `NotOracle` | Signer isn't `config.oracle_authority` |
| 6003 | `NotOwner` | Signer isn't `vault.owner` |
| 6004 | `InvalidConfig` | Bad `init_config` arguments |
| 6005 | `MintNotAllowed` | Mint isn't in the allowlist |
| 6006 | `MintNotChosen` | Stock isn't in the vault's chosen mints |
| 6007 | `NoMintsChosen` | Empty or duplicate mint list |
| 6008 | `ExceedsMaxRate` | `rate_per_period` > `max_rate_per_period`, or 0 |
| 6009 | `InvalidDestination` | Withdrawal destination is the default key or the vault |
| 6010 | `Halted` | `buy` while the config is halted |
| 6011 | `VaultPaused` | `buy` while the vault is paused |
| 6012 | `BelowMinTrade` | `usdc_in` < `min_trade` |
| 6013 | `ExceedsAllowance` | `usdc_in` > the settled allowance (includes period 0) |
| 6014 | `InvalidPrice` | Price is 0 |
| 6015 | `StalePrice` | Price older than `max_price_age_secs` |
| 6016 | `SlippageTooHigh` | `min_out` below the floor, or the floor rounds to 0 |
| 6017 | `SwapOverspend` | USDC fell by more than `usdc_in` |
| 6018 | `SwapShortfall` | The stock rose by less than `min_out` |
| 6019 | `MathOverflow` | Any checked-arithmetic failure |
| 6020 | `ZeroAmount` | `amount` is 0 |
| 6021 | `WithdrawLocked` | `lock_until` hasn't passed |
| 6022 | `WithdrawWindowClosed` | A delayed vault withdraws outside its window |
| 6023 | `DelayNotEnabled` | `request_withdraw` on a vault with no delay |
| 6024 | `DelayTooLong` | Delay above `max_withdraw_delay_secs` |
| 6025 | `InvalidDecimals` | USDC mint isn't 6 decimals |
| 6026 | `DuplicateKeys` | Admin, keeper and oracle aren't three different keys |
| 6027 | `InvalidSwapProgram` | `buy`'s swap program isn't `config.swap_program` |

The backend's `shortReason` already matches on `SlippageTooHigh`, `StalePrice`, `Paused` (matches `VaultPaused`) and `ExceedsMaxRate`.

## What each key can do if it leaks

| Key | Can | Cannot |
| --- | --- | --- |
| **Keeper** (the AI agent) | Buy allowlisted, chosen stocks at the user's pace, within slippage and a fresh price. Write `record_intent`. | Withdraw, change rules, change prices, create vaults. |
| **Oracle** | Write prices. With the keeper's key it could make buys at bad prices (a real loss path, but nothing leaves the vault). | Withdraw, buy. |
| **Owner** (held by the server this weekend) | Withdraw to the user's fixed address. Pause, change pace up to the ceiling. Raise the withdrawal delay up to the cap (a delay of at most 7 days). | Pay anywhere but the fixed address. |
| **Admin** (offline) | Halt buys. Rotate keeper and oracle. | Touch any user's funds. |
| **Gas wallet** | Pay fees and rent. | Anything else. |
| **Program upgrade authority** (the deployer wallet) | Replace the program's code. | n/a (see decision 9) |

The issuer of the xStocks (Backed) keeps its own powers over the tokens (permanent delegate, freeze, pause); see `SPEC.md`.

## For the backend adapter (Muse)

- Replace `@coral-xyz/anchor` with **`@anchor-lang/core` ^1.2.2**; keep `@solana/web3.js@^1`.
- Read **`programs/idl/*.json`** (committed copies of the generated IDL) and **`programs/deployments/devnet.json`** (public addresses only: program IDs, config PDA, mints, price PDAs). Stage 2 produces both. Until then, build against this file.
- `VaultClient` methods map like this:

| `VaultClient` | On-chain |
| --- | --- |
| `createVault` | `create_vault` (add `withdrawDelaySecs`, default 0) |
| `deposit` | `deposit` (owner signs; source is the owner's USDC token account) |
| `setRules` | `set_rules` |
| `buyAsKeeper` | `buy` (keeper signs; gas wallet pays and co-signs) |
| `withdrawAsOwner` | `withdraw` |
| `withdrawAllAsOwner` | **one transaction** with one `withdraw` per leg; verify the transaction size with 4 legs in stage 2 |
| `updatePriceAsOracle` | `update_price` (oracle signs) |
| `getVault` | fetch `UserVault`; `chosenMints` is the `chosen_mints` list |
| `getPrice` | fetch `PriceAccount` |
| `getMintMeta` | read the mint account: `decimals`, plus the scaled UI amount multiplier from the extension. If the mint can't be read, return null and let the keeper skip. |
| `listVaultBalances` | all token accounts owned by the vault PDA under **both** token programs, non-zero only |
| `getDepositWalletBalance` | the owner's USDC token account balance |
| `faucet` | mint `USDC-dev` with the faucet key (devnet only) |

- **Events:** parse them from transaction logs with the IDL's event parser.
- **Never read `UserVault.allowance` as spendable.** Use `settledAllowance` (the vectors above must pass in `pace.spec.ts`).

## Test plan (stage 2 gate)

Rust, `cargo test`, LiteSVM, with real Token-2022 mints built from the recipes above. First, a pure-function unit test of `settle` and the quote maths against the vectors in this file.

**Should fail:**
- the keeper calls `withdraw` (and, if built, `request_withdraw`, `cancel_withdraw`, `set_withdraw_delay`)
- `withdraw` to any destination other than the fixed one
- `withdraw` of a mint outside the allowlist
- a `buy` beyond the allowance
- a `buy` in period 0
- `min_out` below the floor
- a quote whose floor rounds to 0
- a stale price; a price of 0
- the keeper calls `update_price`
- the oracle calls `buy`
- a non-allowlisted mint; a mint the vault didn't choose
- a `buy` while the vault is paused; a `buy` while the config is halted
- `usdc_in` below `min_trade`
- a rate above `max_rate_per_period`; a second `create_vault` for the same owner
- `set_rules` that tries to change the destination (it has no such argument; assert the vault's destination is unchanged)
- a swap program account other than `config.swap_program`
- `buy` or `withdraw` while a stock mint is **paused** (fails cleanly, state unchanged)
- a delayed vault withdrawing outside its window (stretch)

**Should pass:**
- a split buy of two stocks in one period
- raising the rate does not unlock past periods
- a long idle period caps the allowance
- pausing mid-period, then unpausing, credits only the whole periods before the pause
- withdrawing every held mint (USDC and stocks, including one no longer chosen) to a fresh wallet in **one transaction**, with the destination token accounts created by the gas wallet
- withdrawing while halted, and while paused
- a vault with 4 withdraw legs fits in one transaction (measure the size)
- `mock_swap`'s hard-coded price discriminator equals the IDL's

## Stage 2 build order and gate

1. Generate both program keypairs; `anchor init` with Anchor 1.2.2; pin versions as above. **First hour:** one hello-world LiteSVM test using `anchor-lang` and `litesvm` types together (the version-clash check).
2. State accounts and `settle` with pure unit tests against the vectors.
3. Mint recipes and the LiteSVM harness.
4. Instructions, in this order: `init_config`, `init_price`, `update_price`, `create_vault`, `deposit`, `set_rules`, `mock_swap`, `buy`, `withdraw`, `record_intent`, `set_halt`, `set_authorities`.
5. The full fail/pass suite above, plus `cargo clippy` and a pass over `~/.claude/skills/solana-dev/references/security.md`.
6. Deploy both programs to devnet (the gas wallet needs devnet SOL from faucet.solana.com, since the API airdrop is closed), run a setup script (config, mints, price accounts), and commit `programs/idl/` and `programs/deployments/devnet.json`.
7. Stretch: the three delay instructions and their tests.

**Gate:** every test above is green, both programs are on devnet, the IDL and `devnet.json` are committed, and the backend's `verify:devnet` passes against them.

## Built versus contract

| Area | Contract said | Built |
| --- | --- | --- |
| Toolchain | Rust 1.96, LiteSVM 0.17 | Rust 1.99.1 (side by side), LiteSVM 0.18.2; see the pins table |
| `init_price`, `update_price`, `buy` | A `mint` argument | The mint is an account; the argument is gone from the IDL |
| `buy` accounts | 16 accounts | Same, with the large ones boxed (stack limit) |
| Errors | 6000 to 6026 | Plus 6027 `InvalidSwapProgram` |
| Stand-in mint metadata | Metadata pointer and token metadata | Metadata pointer only |
| Delay stretch | Built after the core loop | Built with the core; all five delay tests pass |

## Measured

| Item | Result |
| --- | --- |
| `buy` transaction size | 753 bytes (limit 1,232) |
| 4-leg withdraw-everything | 990 bytes (limit 1,232) |
| Tests | 56 LiteSVM tests (pace, security, withdrawal, delay, admin and layout) plus 6 unit tests; clippy clean with `-D warnings` |

## Open risks

- **`init_config` can be front-run.** Whoever calls it first becomes the admin, and the config is a one-time `init`. On devnet, call it in the same step as the deploy. For mainnet, restrict it to the program's upgrade authority (compare the signer with the `ProgramData` account's authority).
- **Real xStocks may add a transfer hook later.** `withdraw` already forwards extra accounts. Nothing else touches the stock token through a transfer.
- **Real Jupiter swaps from the vault (a CPI on mainnet) are roadmap,** not part of this contract.
- **Program upgrade authority** (decision 9): devnet only for now.
