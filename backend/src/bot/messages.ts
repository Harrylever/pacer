/**
 * Bot copy, mirroring docs/bot-messages.md — the single source for wording.
 * Handlers render these; no copy is invented inline in handlers.
 * Rules: never promise returns, never recommend a stock, at most one emoji,
 * none on money-out messages.
 */
/** Withdrawals are in kind: the vault only holds and transfers tokens, it doesn't sell them. */
const withdrawSellNote =
  "To turn the stock tokens into USDC, open your wallet's Swap screen and sell them there.";
const withdrawInKindNote = `Your stocks arrive as stock tokens, not cash. ${withdrawSellNote}`;
const withdrawDoneNote = `Your stocks are in your wallet as stock tokens. If they don't show up, search for their name (like AAPLx). ${withdrawSellNote}`;

export const msg = {
  welcome: `Welcome to Pacer.

Pacer helps you save a little every day into US stocks, like Apple or the S&P 500, using USDC you already hold.

Setup takes about 2 minutes. After setup, I'll message you once a week. That's on purpose: checking every day makes people panic-sell.`,

  howSafe: `Short version: your money sits in a vault program on Solana, and the program only allows three things.

1. Our agent can only buy the stocks you picked, at your pace, at a fair price.
2. Withdrawals can only go to your own wallet, the address you give me during setup. Nobody can change it.
3. You can pause or withdraw whenever you like.

Stocks can fall. You can lose money.`,

  askCurrency: 'First: what currency should I show your money in?',
  currencyUnsupported: (name: string) =>
    `I can't show amounts in ${name} yet. For now it's naira or US dollars. Which would you like?`,
  currencyUnclear:
    "I didn't catch that. Right now I can show your money in naira or US dollars. Which would you like?",
  askWithdrawalAddress: `Next, your personal Solana wallet. This is where your money goes when you withdraw, and it can never be changed, so please double-check it. It's different from your deposit address, which is where money comes in.

Use a wallet you control, like Phantom, Solflare or Backpack. Not an exchange address: exchanges don't credit stock tokens sent to them.

Paste your Solana address:`,
  invalidAddress: `That doesn't look like a Solana address. It should be 32 to 44 letters and numbers. Open Phantom, tap your account name, and copy the Solana address.`,
  askPace:
    'How much do you want to put in each day? You can type it, e.g. "₦300 a day into Apple and the S&P".',
  askStocks: `Which stocks? Pick one or more. Your daily amount is split equally between them.

The S&P 500 holds 500 large US companies in one token. Apple and Nvidia are single companies, which means bigger swings. I explain options but I don't pick for you.`,

  planCard: (a: {
    dailyDisplay: string;
    usdDaily: string;
    rate: number;
    stocks: string;
    addrShort: string;
  }) => `Please confirm your plan

Pace: ${a.dailyDisplay} a day (${a.usdDaily}/day at ₦${a.rate}/$, the market rate)
Into: ${a.stocks}, split equally
Withdrawals go to: ${a.addrShort} (can't be changed)

The agent can only buy these stocks, at this pace. You can pause, change the pace or withdraw at any time.`,

  confirmed: (url: string) =>
    `Done. Your plan is saved on-chain. View transaction: ${url}`,
  cancelled: 'Cancelled. Nothing changed.',

  depositArrived: (display: string) =>
    `${display} arrived. Moving it into your vault now…`,
  depositInVault: (a: { display: string; url: string }) =>
    `✅ ${a.display} is in your vault. View transaction: ${a.url}`,
  depositFailed: (display: string) =>
    `Your ${display} arrived, but moving it into your vault failed. It's safe in your deposit address, and I'm retrying.`,
  faucet: "Devnet test money: sending you 10 USDC-dev. This isn't real money.",
  // weekly* entries live in the block appended at the end of msg.
  faucetWrongCluster: 'The faucet only works on devnet test money.',
  faucetStoreUnavailable:
    "I can't check the faucet limit right now, so I won't send test money. Please try again in a bit.",
  faucetRateLimited: (mins: number) =>
    `Please wait ${mins} more minute${mins === 1 ? '' : 's'} before using the faucet again.`,

  bought: (a: { ui: string; symbol: string; display: string; url: string }) =>
    `Bought ${a.ui} ${a.symbol} for ${a.display}. View: ${a.url}`,
  buysSplit: (
    legs: { ui: string; symbol: string; display: string; url: string }[],
  ) =>
    `Bought for your vault:\n${legs.map((l) => `• ${l.ui} ${l.symbol} for ${l.display} View: ${l.url}`).join('\n')}`,

  txFailed: (reason: string) =>
    `That didn't go through: ${reason}. Nothing changed and your money is safe.`,

  greeting:
    "Hi, I'm Pacer. I help you put small amounts into US stocks every day, from as little as ₦200 a day.",

  faq: {
    wallet_address:
      'Your Solana address is the long string of letters and numbers at the top of Phantom, Solflare or Backpack (tap it to copy). One address works on every Solana network, so there is no separate devnet or mainnet address. Use a wallet you control, not an exchange.',
    network:
      'This demo runs on Solana devnet, which uses test money with no real value: USDC-dev and stand-in stocks priced from real market quotes. Your wallet address is the same on devnet and mainnet. Most wallets have a developer or testnet switch to show devnet tokens.',
    change_address:
      'No. Your withdrawal address is fixed once you confirm it, so nobody, including me, can send your money anywhere else. Double-check it before you confirm.',
    fees: 'You never need SOL. Pacer pays the network fees and account setup costs.',
    safety:
      "Your money sits in a vault that can only buy the stocks you chose, at the pace you set, and can only pay out to your own wallet. The agent can't withdraw. Values can still fall, and the companies behind these stock tokens keep the powers of a regulated issuer, such as freezing or pausing tokens. This demo uses test money.",
    live_price: `I can't give live prices or quotes. What I can show is how the S&P 500, Apple and Nvidia did over the past five years, with the worst drops beside the gains. Ask "is investing worth it?" It's past performance only, never a forecast.`,
    withdraw_how: `When you withdraw, everything goes to your wallet exactly as it is: your USDC arrives as USDC, and your stocks arrive as stock tokens (like AAPLx), not as cash. ${withdrawSellNote}\n\nI can't sell them for you yet. Selling is a swap you do yourself, so check the price your wallet shows before you confirm. Getting from USDC to naira is a further step, through an exchange or a person you trust.`,
    how_it_works:
      'You send USDC once and pick a daily amount. Each day that much unlocks, and the agent buys your chosen stocks as it builds up. You can pause, change the pace or withdraw everything at any time.',
  } as const,

  /** The user's own deposit address, and how it differs from the withdrawal address. */
  depositAddressInfo: (address: string) =>
    `Your deposit address, where money comes in:\n${address}\n\nSend USDC on Solana to this address (USDC only, on the Solana network; other tokens or networks may be lost). I notice it within about 30 seconds and move it into your vault right away, then I tell you. It's a wallet Pacer controls, which is why the money doesn't stay there.\n\nThis is not your withdrawal address. Withdrawals go only to your own wallet, the address you confirmed, and that can't change.\n\nOn this test version you can type /faucet to get test USDC instead.`,

  help: `Here's what I can do:
• /deposit: your deposit address
• /balance: your deposit wallet and vault balances
• /status: how your vault is doing
• /pause and /resume: pause or restart your daily plan
• /withdraw: take everything out to your withdrawal address (stocks arrive as stock tokens; you sell them in your wallet's Swap screen)
• /faucet: 10 test USDC (test version only)
• /about: what Pacer is, and the small print

Or just tell me, for example: "₦500 a day into Apple" or "is investing worth it?"`,

  about: `Pacer helps you put small daily amounts of USDC into tokenized US stocks on Solana. Your money sits in a vault that only buys the stocks you choose, at the pace you set, and it can only be withdrawn to your own wallet.

Pacer is software, not a financial adviser. It doesn't recommend investments or promise returns. The stocks are tokenized versions of US shares (xStocks) issued by Backed Finance, which keeps powers such as freezing tokens. The value of stocks can go down as well as up, and you can lose money. Past performance is not a guide to future results. Naira values use the parallel-market rate and are approximate. Pacer isn't available to people in the US.

This is a test version on Solana devnet. Stock tokens are stand-ins priced from real xStocks, and no real money is involved.`,

  addressReminder: "When you're ready, paste your Solana wallet address.",

  stuckOnAddress: `I'm still waiting for your Solana wallet address: a long string of 32 to 44 letters and numbers from Phantom, Solflare or Backpack. One address works on both devnet and mainnet. You can ask me about it, or paste it when you're ready.`,

  didntUnderstand: `Sorry, I didn't get that. You can say things like:
• "₦500 a day into Apple"
• "How am I doing?"
• "Pause"
• "Withdraw everything"

Type /help to see everything I can do.`,

  refusePrediction: `Honestly, nobody knows, and anyone who promises returns is a red flag. Stocks can go down as well as up.

I can show you what happened in the past, including the bad years.`,
  explainOptions: `I don't pick stocks for people. Here's how they differ:

• S&P 500 (SPYx): 500 large US companies in one token. It moves less than any single company.
• Apple (AAPLx), Nvidia (NVDAx): one company each. They can rise or fall much more.

Many people start with a broad fund and add single companies later, but that's your call.`,
  offTopic: `I can help with your Pacer vault: your plan, deposits, withdrawals and how you're doing. Try "how am I doing?" or "pause".`,

  currencyReminder: "When you're ready, tell me: naira or US dollars.",
  clarifyAmount: `How much do you want to put in each day? You can say it like "₦300 a day".`,
  clarifyAsset: `Which stock or stocks? You can pick the S&P 500, Apple, Nvidia, or a mix. I explain the options but I don't pick for you.`,
  openComparison: 'Open the comparison',
  pastPerformance: 'Past performance. Not a prediction or a promise.',

  welcomeWithDeposit: (address: string) =>
    `${msg.welcome}\n\nYour deposit address: ${address}`,
  currencySaved: (currency: string) =>
    `Okay, I'll show amounts in ${currency}.`,
  cardExpired: 'That card has expired or was already used. Nothing changed.',
  addressAlreadySet: (addrShort: string) =>
    `Your withdrawal wallet is already set to ${addrShort} and can never be changed.`,
  confirmAddressCard: (addrShort: string) =>
    `Your withdrawal wallet:\n${addrShort}\n\nIs this a wallet you control, not an exchange? This can't be changed later.`,
  paceNote: (a: { daily: string; days: number }) =>
    `One thing to know: the agent buys once about $1 has unlocked (fees make smaller buys wasteful).\n\nAt ${a.daily} a day, that's about every ${a.days} days. That's normal; it's a slow, steady habit. If you want buys more often, pick a higher daily amount.`,
  pauseCard: `Pause your plan?\n\nThe agent stops buying, and nothing unlocks while paused. Your money stays in your vault, and you can withdraw any time.`,
  pausedDone: 'Paused. Say "resume" whenever you want to start again.',
  resumeCard: (pace: string) => `Resume your plan at ${pace} a day?`,
  resumedDone: 'Resumed. The next day of your pace starts now.',
  withdrawCard: (a: {
    addrShort: string;
    lines: string;
    hasStocks?: boolean;
  }) =>
    `Withdraw everything?\n\nThis sends everything in your vault to your wallet ${a.addrShort}:\n${a.lines}\n\nIt all goes in one transaction. Your plan will be paused.${a.hasStocks ? `\n\n${withdrawInKindNote}` : ''}`,
  withdrawDone: (url: string, hasStocks = false) =>
    `Sent to your wallet. View transaction: ${url}${hasStocks ? `\n\n${withdrawDoneNote}` : ''}`,
  vaultEmpty: 'Your vault is empty. Type /deposit to see where to send USDC.',
  nothingToWithdraw: 'Your vault is empty, so there is nothing to withdraw.',
  buyAlertsOn: "Buy alerts on. I'll message you each time the agent buys.",
  buyAlertsOff:
    'Buy alerts off. Buys will show in your weekly summary instead.',
  depositAddressCard: (a: {
    address: string;
    suggested: string;
    weeks: string;
  }) =>
    `Add money to your vault\n\nSend USDC on Solana to this address:\n${a.address}\n\n• USDC only, on the Solana network. Other tokens or networks may be lost.\n• Any amount works. For your pace, ${a.suggested} covers about ${a.weeks} weeks.\n• I'll message you when it arrives and moves into your vault.`,
  statusReport: (a: {
    total: string;
    invested: string;
    change: string;
    lines: string;
    waiting: string;
    pace: string;
    status: string;
    rate: number;
    negative: boolean;
  }) =>
    `Your vault\n\nValue now: ${a.total}\nPut in so far: ${a.invested}\nChange: ${a.change}\n\n${a.lines}\n• Waiting to be invested: ${a.waiting}\n\nPace: ${a.pace}/day · ${a.status}\nNaira values use ₦${a.rate}/$, the market rate.${a.negative ? '\n\nPrices go up and down. Your plan keeps buying at your pace unless you pause it.' : ''}`,
  balanceReport: (a: {
    depositUsdc: string;
    depositUrl: string;
    pendingNote: boolean;
    lines: string;
    total: string;
    vaultUrl: string;
  }) =>
    `Your balances\n\nDeposit wallet (money on its way in)\n• ${a.depositUsdc} USDC\n${a.depositUrl}${a.pendingNote ? '\nThis moves into your vault within about 30 seconds.' : ''}\n\nVault (your money)\n${a.lines}\nTotal in vault: ${a.total}\nCheck it yourself: ${a.vaultUrl}`,
  /**
   * Side by side, always: naira, USDC and all three stocks, each with its
   * worst drop. A question about one stock still gets every option, so no
   * stock's gain is shown without its risk or without the others.
   */
  historyReport: (a: {
    naira: string;
    rows: { label: string; end: string; drop: string }[];
    focusName?: string;
  }) =>
    `Good question to ask. I can't tell you what will happen, but I can show what did happen.${a.focusName ? `\n\nYou asked about ${a.focusName}. Here it is next to the other options, because the risk matters as much as the gain.` : ''}\n\nExample: ₦20,000 put away 5 years ago (Oct 2021 → Oct 2026), side by side:\n• Kept in naira: ${a.naira}\n${a.rows.map((r) => `• ${r.label}: ${r.end}, but at its worst point it was ${r.drop} down`).join('\n')}\n\nDrops are the worst fall from a high point, measured in naira. Much of the gain came simply from holding dollars while the naira fell.\n\nPast performance. Not a prediction or a promise.`,
  weeklySummary: (a: {
    week: string;
    buys: string;
    total: string;
    vaultUrl: string;
  }) =>
    `Your week with Pacer\n\nSaved this week: ${a.week}\nBuys: ${a.buys}\nTotal saved so far: ${a.total}\n\nEverything is in your vault, and you can check it yourself: ${a.vaultUrl}\n\nWant to see how it's doing? Just ask "how am I doing?"`,
  weeklyPaused: `Your plan is paused, so nothing was bought this week. Your money is safe in your vault. Say "resume" to start again.`,
  weeklyOutOfUsdc: (address: string) =>
    `Your vault has run out of USDC to invest. Your stocks are still there. To keep your pace going, add more USDC:\n${address}`,
};

/** SPEC/bot-messages §11.2 error → short_reason map. */
export function shortReason(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/SlippageTooHigh/.test(m)) return 'the price moved too much';
  if (/StalePrice/.test(m)) return 'prices are updating';
  if (/Paused/.test(m)) return 'your plan is paused';
  if (/ExceedsMaxRate/.test(m)) return "that's above Pacer's daily limit";
  return 'the network is busy';
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-6)}`;
}

export function explorerTx(sig: string, cluster = 'devnet'): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
}

export function explorerAddress(address: string, cluster = 'devnet'): string {
  return `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}

/** Shown in Telegram's command menu (registered at startup via setMyCommands). */
export const BOT_COMMANDS: { command: string; description: string }[] = [
  { command: 'start', description: 'Set up your wallet and currency' },
  { command: 'deposit', description: 'Show your deposit address' },
  { command: 'balance', description: 'Deposit wallet and vault balances' },
  { command: 'status', description: 'How your vault is doing' },
  { command: 'pause', description: 'Pause your daily plan' },
  { command: 'resume', description: 'Restart your daily plan' },
  {
    command: 'withdraw',
    description: 'Withdraw everything to your own wallet',
  },
  { command: 'faucet', description: 'Get 10 test USDC (test version only)' },
  { command: 'about', description: 'What Pacer is, and the small print' },
  { command: 'help', description: 'What I can do' },
];
