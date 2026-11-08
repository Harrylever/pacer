# Pacer — bot messages

The draft copy for every message the bot sends. The backend should load these strings from one file instead of writing them inline, so the copy can change without code changes.

## Conventions

- `{curly}` marks a value the backend fills in. `[Button]` marks an inline keyboard button.
- **Money:** amounts appear in the user's `display_currency` first, with USD underneath: `₦13,850 ($10.00)`. Never hard-code ₦; the examples use NGN only because it's the default.
- **The naira rate:** when NGN is shown, the bot uses the parallel-market rate and says so the first time in each message: "at ₦1,385/$, the market rate".
- **Tone:** short sentences and plain English, like a calm friend who knows money. Use at most one emoji per message, and none in anything about money moving out.
- **Never:**
  - Promise or predict returns ("you will earn", "you'll make", "guaranteed").
  - Recommend a specific stock.
  - Mention price swings unless the user asks.
- **Two kinds of example:** any number about the past is labelled as past performance (see Disclaimers). Worked examples, like the one in "How the pace works", are clearly illustrations.
- **Timing:** after setup the bot speaks only when the user writes to it, when money moves in or out, and once a week (the summary). There are no daily messages.

### Decided here: buy notifications

The spec says there are no daily messages, but the demo shows buys arriving in chat. Both hold: `notify_buys` is a per-user setting that's **off by default** and **on for demo users**. With it off, buys appear only in the weekly summary.

---

## 1. Onboarding (`/start`)

### 1.1 Welcome

> Welcome to Pacer.
>
> Pacer helps you save a little every day into US stocks, like Apple or the S&P 500, using USDC you already hold.
>
> How it works:
> • You send USDC once. It goes into your own vault on Solana.
> • You pick a pace, like ₦300 a day. Each day, that much unlocks for buying.
> • Our agent buys the stocks you chose, at your pace. It can't do anything else: it can't withdraw, and it can't spend faster than you set. The vault's code enforces that, not our promise.
> • You can withdraw everything to your own wallet at any time.
>
> After setup, I'll message you once a week. That's on purpose: checking every day makes people panic-sell.
>
> Setup takes about 2 minutes.
>
> [Let's start]  [How is this safe?]

### 1.2 "How is this safe?"

> Short version: your money sits in a vault program on Solana, and the program only allows three things.
>
> 1. **Our agent can only buy** the stocks you picked, at your pace, at a fair price. If it tries anything else, the program refuses.
> 2. **Withdrawals can only go to your own wallet**, the address you give me during setup. Nobody can change it, us included.
> 3. **You can pause or withdraw** whenever you like.
>
> What to know:
> • The stock tokens (xStocks) are issued by Backed Finance. Like any regulated asset, the issuer can freeze or reclaim tokens, for example under a court order.
> • When you send USDC, it lands in a deposit address we control for a few seconds, then moves into your vault. I'll tell you when it's in.
> • Stocks can fall. You can lose money.
>
> [Got it, let's start]

### 1.3 Currency

> First: what currency should I show your money in?
>
> [🇳🇬 Naira (₦)]  [🇺🇸 US dollars ($)]  [Other]

*Other* → "Pacer shows naira or dollars for now. More currencies are coming. Which would you like?" [Naira] [Dollars]

**Typed answers** (built; buttons are not):
- Naira or US dollars (naira, NGN, ₦; USD, dollars, $) are saved.
- A currency we don't support (yen, ZAR, CAD, euro, pounds, cedis…) → "I can't show amounts in {name} yet. For now it's naira or US dollars. Which would you like?" The step stays open and nothing is saved. A qualified dollar such as "Canadian dollars" is never saved as US dollars.
- Anything else → "I didn't catch that. Right now I can show your money in naira or US dollars. Which would you like?"

### 1.4 Withdrawal address

> Next, your personal Solana wallet. This is where your money goes when you withdraw, and **it can never be changed**, so please double-check it. It's different from your deposit address, which is where money comes in.
>
> Use a wallet you control, like Phantom, Solflare or Backpack.
> ⚠️ **Not an exchange address** (Binance, Bybit, etc.). Exchanges don't credit stock tokens sent to them, and you could lose them.
>
> Paste your Solana address:

**Valid address** → confirm it before saving:

> Your withdrawal wallet:
> `{address_first6}…{address_last6}`
>
> Is this a wallet you control, not an exchange? This can't be changed later.
>
> [Yes, it's mine]  [Use a different one]

**Not a valid Solana address:**

> That doesn't look like a Solana address. It should be 32 to 44 letters and numbers, like `7xKX…9fQp`. Open Phantom, tap your account name, and copy the Solana address.

**Known exchange deposit address** (if we keep a list):

> That looks like an exchange deposit address. Stock tokens sent there may be lost. Please use a personal wallet like Phantom.

### 1.5 Pace and stocks

> How much do you want to put in each day?
>
> [₦200]  [₦500]  [₦1,000]  [Other amount]
>
> You can also just type it, e.g. "₦300 a day into Apple and the S&P".

Then:

> Which stocks? Pick one or more. Your daily amount is split equally between them.
>
> [S&P 500 (SPYx)]  [Apple (AAPLx)]  [Nvidia (NVDAx)]
> [Done]
>
> The S&P 500 holds 500 large US companies in one token. Apple and Nvidia are single companies, which means bigger swings. I explain options but I don't pick for you.

### 1.6 How the pace works (always shown before the first confirmation)

> One thing to know: the agent buys once about **$1** has unlocked (fees make smaller buys wasteful).
>
> At ₦{daily} a day, that's about every **{days_to_first_buy} days**. That's normal; it's a slow, steady habit. If you want buys more often, pick a higher daily amount.

(For ₦200 a day at ₦1,385/$, that's about 7 days.)

---

## 2. Confirmation cards

Nothing is ever signed without a tap on Confirm. Every card has the same shape: what will happen, the numbers, what can't change, then the buttons.

### 2.1 Create the vault (`create_vault`)

> **Please confirm your plan**
>
> Pace: **₦{daily} a day** ({usd_daily}/day at ₦{rate}/$, the market rate)
> Into: **{stock_list}**, split equally
> Withdrawals go to: `{address_first6}…{address_last6}` (can't be changed)
>
> The agent can only buy these stocks, at this pace. You can pause, change the pace or withdraw at any time.
>
> [✅ Confirm]  [Cancel]

### 2.2 Change the plan (`set_rules`)

> **Change your plan?**
>
> Pace: ₦{old_daily} → **₦{new_daily} a day**
> Stocks: {old_stocks} → **{new_stocks}**
>
> The new pace starts from the next day. Days that have already passed don't change.
>
> [✅ Confirm]  [Cancel]

**Above the program's limit:**

> The most Pacer allows right now is ₦{max_daily} a day ({max_usd}/day). Want to set it to ₦{max_daily}?
>
> [Set to ₦{max_daily}]  [Choose another amount]

### 2.3 After any confirmation

> Done. Your plan is saved on-chain. [View transaction]({explorer_url})

**Cancelled:**

> Cancelled. Nothing changed.

---

## 3. Deposits

### 3.1 Deposit address (after the vault is created)

> **Add money to your vault**
>
> Send **USDC on Solana** to this address:
> `{deposit_address}`
> {QR image}
>
> • USDC only, on the Solana network. Other tokens or networks may be lost.
> • Any amount works. For your pace, ${suggested} covers about {weeks} weeks.
> • I'll message you when it arrives and moves into your vault.
>
> [Copy address]

### 3.2 USDC arrived

> {display_amount} ({usd_amount}) arrived. Moving it into your vault now…

### 3.3 Moved into the vault

> ✅ {display_amount} is in your vault. [View transaction]({explorer_url})
>
> Your first buy happens once about $1 has unlocked: around {first_buy_eta}.

### 3.4 Moving into the vault failed (after retries)

> Your {display_amount} arrived, but moving it into your vault failed. It's safe in your deposit address, and I'm retrying. If it isn't in your vault within 10 minutes, tap below.
>
> [Get help]

### 3.5 `/faucet` (devnet only)

> Devnet test money: sending you 10 USDC-dev. This isn't real money.

Then continue with 3.2 and 3.3.

---

## 4. Buys (only when `notify_buys` is on; demo users have it on)

> Bought {stock_amount_ui} {symbol} for {display_amount} ({usd_amount}). [View]({explorer_url})

A split buy in the same period goes in one message:

> Bought for your vault:
> • {amt1} {sym1} for {usd1} [View]({url1})
> • {amt2} {sym2} for {usd2} [View]({url2})

---

## 5. "How am I doing?"

Answers when the user asks "how am I doing", "my balance", "portfolio" or `/status`.

> **Your vault**
>
> Value now: **{display_total}** ({usd_total})
> Put in so far: {display_invested} ({usd_invested})
> Change: {sign}{display_change} ({sign}{pct}%) {since_label}
>
> • {sym1}: {amt1} — {display_val1}
> • {sym2}: {amt2} — {display_val2}
> • Waiting to be invested: {display_usdc} USDC
>
> Pace: ₦{daily}/day · {status_active_or_paused}
> Naira values use ₦{rate}/$, the market rate. [View vault on-chain]({vault_url})
>
> [See history in app]

When the change is negative, keep the same layout. Don't comfort and don't alarm; add one line:

> Prices go up and down. Your plan keeps buying at your pace unless you pause it.

**How "Change" is worked out:** value of the stocks now, minus what was put in (bought). USDC still waiting to be invested is part of "Value now" but is taken out of the change, so idle cash never shows up as a gain.

### 5b. `/balance`: both places the money can be

> **Your balances**
>
> Deposit wallet (money on its way in)
> • {usdc} USDC
> {explorer_url_of_deposit_wallet}
> This moves into your vault within about 30 seconds. _(shown only when the amount is above 0)_
>
> Vault (your money)
> • USDC waiting to be invested: {usdc_waiting}
> • {sym}: {amt} — {display_val}
> Total in vault: {display_total}
> Check it yourself: {explorer_url_of_vault}

The vault link is the vault's own on-chain address, not the deposit wallet. The weekly summary's "check it yourself" link uses the same vault address.

---

## 6. Pause and resume

### 6.1 Pause ("pause", "stop")

> **Pause your plan?**
>
> The agent stops buying, and nothing unlocks while paused. Your money stays in your vault, and you can withdraw any time.
>
> [⏸ Pause]  [Keep going]

Done:

> Paused. Say "resume" whenever you want to start again.

### 6.2 Resume

> **Resume at ₦{daily} a day?**
>
> [▶️ Resume]  [Change pace first]

Done:

> Resumed. The next day of your pace starts now.

---

## 7. Withdrawals

### 7.1 "Withdraw everything"

> **Withdraw everything?**
>
> This sends everything in your vault to your wallet `{address_first6}…{address_last6}`:
> • {usdc_amt} USDC
> • {amt1} {sym1}
> • {amt2} {sym2}
>
> It all goes in one transaction. Your plan will be paused.
>
> Your stocks arrive as stock tokens, not cash. To turn the stock tokens into USDC, open your wallet's Swap screen and sell them there.

(The last paragraph shows only when the vault holds stocks. A vault holding only USDC gets no note.)

> [Withdraw everything]  [Cancel]

Done:

> Sent to your wallet. [View transaction]({explorer_url})
>
> Your stocks are in your wallet as stock tokens. If they don't show up, search for their name (like AAPLx). To turn the stock tokens into USDC, open your wallet's Swap screen and sell them there.

**Withdrawals are in kind, on purpose.** The vault only holds and transfers tokens; it can't sell them, and the bot can't sell them from the user's own wallet. Selling for USDC inside the vault would need a new owner-only `sell` instruction (post-hackathon). Until then the copy says so plainly.

**FAQ "What do I get when I withdraw?"** (topic `withdraw_how`; "how do I cash out", "can you sell my stocks for USDC"):

> When you withdraw, everything goes to your wallet exactly as it is: your USDC arrives as USDC, and your stocks arrive as stock tokens (like AAPLx), not as cash. To turn the stock tokens into USDC, open your wallet's Swap screen and sell them there.
>
> I can't sell them for you yet. Selling is a swap you do yourself, so check the price your wallet shows before you confirm. Getting from USDC to naira is a further step, through an exchange or a person you trust.

### 7.2 With the withdrawal delay (stretch goal)

Request:

> **Withdraw everything?**
>
> For your protection, withdrawals arrive **{delay_human}** after you ask. You chose this delay when you set up. It stops panic-selling on a bad day.
>
> You'll get a message when it's ready, and you can cancel any time before then.
>
> [Request withdrawal]  [Cancel]

Requested:

> Requested. Your money arrives in your wallet around **{unlock_time}**. [Cancel withdrawal]

Ready and sent:

> Your withdrawal is done. Everything is in your wallet `{address_first6}…{address_last6}`. [View transaction]({explorer_url})

Window expired without being executed (shouldn't happen if the keeper executes it automatically):

> Your withdrawal window closed before it went through. Your money is still in your vault. Say "withdraw everything" to start again.

---

## 8. Weekly summary

Sent once a week (or monthly, if the user picked that). Never sent if nothing happened and the vault is empty.

> **Your week with Pacer**
>
> Saved this week: **{display_week}** ({usd_week})
> Buys: {buy_count} ({buy_list_short})
> Total saved so far: {display_total_invested}
>
> Everything is in your vault, and you can check it yourself: [View vault on-chain]({vault_url})
>
> Want to see how it's doing? Just ask "how am I doing?"

**A paused week:**

> Your plan is paused, so nothing was bought this week. Your money is safe in your vault. Say "resume" to start again.

**The deposit has run out:**

> Your vault has run out of USDC to invest. Your stocks are still there. To keep your pace going, add more USDC: [Show deposit address]

This summary deliberately leaves out performance, prices and comparisons.

---

## 9. "Is investing worth it for me?" and "How did Apple do over 5 years?"

Both get the same answer: every option, side by side, each with its worst drop. A question about one stock (Apple, Nvidia or the S&P 500) still shows all of them, so no stock's gain appears without its risk or without the others. It never says which is best.

> Good question to ask. I can't tell you what will happen, but I can show what *did* happen.
>
> *(Only when exactly one stock was asked about:)* You asked about Apple. Here it is next to the other options, because the risk matters as much as the gain.
>
> Example: ₦20,000 put away 5 years ago (Oct 2021 → Oct 2026), side by side:
> • Kept in naira: **₦20,000**
> • Kept in USDC: **₦49,027**, but at its worst point it was **22.4% down**
> • In the S&P 500: **₦86,256**, but at its worst point it was **19.8% down**
> • In Apple: **₦115,639**, but at its worst point it was **26.3% down**
> • In Nvidia: **₦394,140**, but at its worst point it was **51.2% down**
>
> Drops are the worst fall from a high point, measured in naira. Much of the gain came simply from holding dollars while the naira fell.
>
> _Past performance. Not a prediction or a promise._
>
> [Open the comparison]

The numbers above come from `data/history/`. The backend computes them; the LLM only explains them. A number that is a length of time ("5 years") or part of a name ("S&P 500") is never read as an amount.

---

## 10. Things the agent won't do

### 10.1 "Which stock should I buy?" / "What's best?"

> I don't pick stocks for people. Here's how they differ:
>
> • **S&P 500 (SPYx):** 500 large US companies in one token. It moves less than any single company.
> • **Apple (AAPLx), Nvidia (NVDAx):** one company each. They can rise or fall much more.
>
> Many people start with a broad fund and add single companies later, but that's your call.

### 10.2 "Will I make money?" / "How much will I have in a year?"

> Honestly, nobody knows, and anyone who promises returns is a red flag. Stocks can go down as well as up.
>
> I can show you what happened in the past, including the bad years.
>
> [Show the past 5 years]

### 10.3 Anything off-topic

> I can help with your Pacer vault: your plan, deposits, withdrawals and how you're doing. Try "how am I doing?" or "pause".

---

## 11. Errors

### 11.1 Didn't understand

> Sorry, I didn't get that. You can say things like:
> • "₦500 a day into Apple"
> • "How am I doing?"
> • "Pause"
> • "Withdraw everything"

### 11.2 Transaction failed

> That didn't go through: {short_reason}. Nothing changed and your money is safe. [Try again]

`{short_reason}` mapping:

| Error | `{short_reason}` |
| --- | --- |
| `SlippageTooHigh` | "the price moved too much" |
| `StalePrice` | "prices are updating" |
| `Paused` | "your plan is paused" |
| `ExceedsMaxRate` | "that's above Pacer's daily limit" |
| Network or RPC | "the network is busy" |

### 11.3 A buy skipped by the keeper (internal only; never sent to the user)

Log it; don't message the user. If buys keep failing for more than 24 hours, alert Dean.

---

## 11b. Questions during setup, and greetings

Answered from fixed text, whether or not the AI model is running. While the user has no withdrawal address yet, each answer ends with: "When you're ready, paste your Solana wallet address."

**Greeting** ("hello", "hi", "how far"):

> Hi, I'm Pacer. I help you put small amounts into US stocks every day, from as little as ₦200 a day.

**Which address / mainnet or devnet?**

> Your Solana address is the long string of letters and numbers at the top of Phantom, Solflare or Backpack (tap it to copy). One address works on every Solana network, so there is no separate devnet or mainnet address. Use a wallet you control, not an exchange.

**Is this real money? / which network?**

> This demo runs on Solana devnet, which uses test money with no real value: USDC-dev and stand-in stocks priced from real market quotes. Your wallet address is the same on devnet and mainnet. Most wallets have a developer or testnet switch to show devnet tokens.

**What's my deposit address? / where do I send USDC?** (also the `/deposit` command; shows the user's own address)

> Your deposit address, where money comes in:
> `{deposit_address}`
>
> Send USDC on Solana to this address (USDC only, on the Solana network; other tokens or networks may be lost). I notice it within about 30 seconds and move it into your vault right away, then I tell you. It's a wallet Pacer controls, which is why the money doesn't stay there.
>
> This is not your withdrawal address. Withdrawals go only to your own wallet, the address you confirmed, and that can't change.
>
> On this test version you can type /faucet to get test USDC instead.

**Can I change the address later?**

> No. Your withdrawal address is fixed once you confirm it, so nobody, including me, can send your money anywhere else. Double-check it before you confirm.

**Do I need SOL / are there fees?**

> You never need SOL. Pacer pays the network fees and account setup costs.

**Is it safe?**

> Your money sits in a vault that can only buy the stocks you chose, at the pace you set, and can only pay out to your own wallet. The agent can't withdraw. Values can still fall, and the companies behind these stock tokens keep the powers of a regulated issuer, such as freezing or pausing tokens. This demo uses test money.

**How does it work?**

> You send USDC once and pick a daily amount. Each day that much unlocks, and the agent buys your chosen stocks as it builds up. You can pause, change the pace or withdraw everything at any time.

**Reminders after an answer while a step is pending:** while the withdrawal address is missing: "When you're ready, paste your Solana wallet address." While the currency question is open: "When you're ready, tell me: naira or US dollars."

**A plan with the amount or the stock missing** (the agent asks instead of guessing):

> How much do you want to put in each day? You can say it like "₦300 a day".

> Which stock or stocks? You can pick the S&P 500, Apple, Nvidia, or a mix. I explain the options but I don't pick for you.

**Stuck on the address step** (any message that isn't an address or a recognised question):

> I'm still waiting for your Solana wallet address: a long string of 32 to 44 letters and numbers from Phantom, Solflare or Backpack. One address works on both devnet and mainnet. You can ask me about it, or paste it when you're ready.

---

## 12. Disclaimers

**Short** (under every chart, comparison or past figure):

> _Past performance. Not a prediction or a promise._

**Long** (in `/about` and the Mini App footer):

> Pacer is software, not a financial adviser. It doesn't recommend investments or promise returns. The stocks are tokenized versions of US shares (xStocks) issued by Backed Finance, which keeps powers such as freezing tokens. The value of stocks can go down as well as up, and you can lose money. Past performance is not a guide to future results. Naira values use the parallel-market rate and are approximate. Pacer isn't available to people in the US.

**Devnet** (pinned in demo chats):

> Test version on Solana devnet. Stock tokens are stand-ins priced from real xStocks, and no real money is involved.

---

## 13. Commands

The bot registers these in Telegram's command menu when it starts (`setMyCommands`), so no BotFather step is needed.

| Command | What it does |
| --- | --- |
| `/start` | Create the wallet, show the deposit address, ask for the display currency |
| `/deposit` | Show the user's deposit address (§11b) |
| `/balance` | Deposit wallet and vault balances (§5b) |
| `/status` | "How am I doing?" (§5) |
| `/pause`, `/resume` | Pause or restart the daily plan (Confirm card, §6) |
| `/withdraw` | Withdraw everything to the fixed address (Confirm card, §7) |
| `/faucet` | 10 test USDC, test version only |
| `/about` | What Pacer is, plus the long disclaimer (§12) and the devnet line |
| `/help` | The list below |

**/help**

> Here's what I can do:
> • /deposit: your deposit address
> • /balance: your deposit wallet and vault balances
> • /status: how your vault is doing
> • /pause and /resume: pause or restart your daily plan
> • /withdraw: take everything out to your withdrawal address
> • /faucet: 10 test USDC (test version only)
> • /about: what Pacer is, and the small print
>
> Or just tell me, for example: "₦500 a day into Apple" or "is investing worth it?"

**/about**

> Pacer helps you put small daily amounts of USDC into tokenized US stocks on Solana. Your money sits in a vault that only buys the stocks you choose, at the pace you set, and it can only be withdrawn to your own wallet.
>
> {long disclaimer from §12}
>
> This is a test version on Solana devnet. Stock tokens are stand-ins priced from real xStocks, and no real money is involved.

`/pause`, `/resume`, `/withdraw` and `/status` do exactly what the plain words do (same Confirm cards) and don't call the language model. The generic "didn't get that" reply ends with "Type /help to see everything I can do."

