/**
 * Screen copy, taken from docs/bot-messages.md §9. Components render
 * these strings; no user-facing copy lives inline in components.
 */
export const copy = {
  appTitle: 'Pacer',
  comparisonTitleOnce: 'What ₦20,000 would have become',
  comparisonTitleDaily: 'What ₦200 a day would have become',
  modeOnce: '₦20,000 once',
  modeDaily: '₦200 a day for 12 months',
  nairaRow: 'Kept in naira',
  usdcRow: 'Kept in USDC',
  spRow: 'In the S&P 500',
  worstDrop: (pct: number) => `worst drop ${pct.toFixed(1)}%`,
  worstDropLabel: 'Worst drop',
  chartLabel: 'Chart of what ₦20,000 would have become, October 2021 to October 2026. Drag or use the arrow keys to move through the months.',
  sourceLine: (startMonth: string, asOf: string) =>
    `${startMonth} to ${asOf}`,
  honestHook:
    'Much of the gain came simply from holding dollars while the naira fell.',
  marketRateCaption: (rate: number) =>
    `Naira values use ₦${rate.toLocaleString('en-NG')}/$, the market rate.`,
  agentRulesTitle: "What the AI agent can and can't do",
  withdrawalsOnlyTo: 'Withdrawals only go to',
  yourPace: 'Your pace',
  pacePerDay: (amount: string) => `${amount} a day`,
  demoPeriodNote: (seconds: number) => `(demo: one day = ${seconds} s)`,
  stocksItCanBuy: 'Stocks it can buy',
  stockName: (symbol: string) =>
    ({ SPYx: 'S&P 500 (SPYx)', AAPLx: 'Apple (AAPLx)', NVDAx: 'Nvidia (NVDAx)' })[symbol] ?? symbol,
  agentCanDoLabel: 'What the agent can do',
  agentCanDo:
    "Only buy, at your pace. It can't withdraw or send your money anywhere else. The vault program enforces this.",
  pausedBadge: 'Paused',
  explorerLink: 'Check your vault on Solana Explorer ↗',
  recentBuysTitle: 'Recent buys',
  buyStockName: (symbol: string) =>
    ({ SPYx: 'the S&P 500', AAPLx: 'Apple', NVDAx: 'Nvidia' })[symbol] ?? symbol,
  holdingsTitle: 'Your vault',
  holdingsEmpty:
    'Your vault is empty. Send /deposit to the bot to put USDC in.',
  holdingsOutsideTelegram: 'Open this from the bot to see your holdings.',
  putIn: 'Put in so far',
  change: 'Change since the start',
  waiting: 'Waiting to be invested',
  priceUnavailable: 'price unavailable',
  demoFooter: 'This is a hackathon demo on Solana devnet.',
} as const;
