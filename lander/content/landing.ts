/**
 * All page copy. Voice: calm, plain standard English, short sentences.
 * No exclamation marks, no emoji. Pidgin appears once, in the chat.
 * Never promise returns; every past figure carries the disclaimer.
 */
export const LINKS = {
  bot: "https://t.me/pacerfinancebot",
  github: "https://github.com/Harrylever/pacer",
  demoVideo: "https://youtu.be/RJH9i2106_U",
} as const

export const copy = {
  nav: {
    links: [
      { label: "How it works", href: "#how" },
      { label: "Safety", href: "#safety" },
      { label: "FAQ", href: "#faq" },
    ],
    cta: "Start on Telegram",
    ctaShort: "Start",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },

  hero: {
    eyebrow: "An AI agent for steady dollar savings",
    headlineWords: ["Save", "at", "your"],
    headlineEmphasis: "pace.",
    subline:
      "Put the USDC you already hold into US stocks like Apple and the S&P 500, a little at a time. A Solana program holds your money and keeps the pace you choose. We can't rush it, and we can't take it.",
    primaryCta: "Start on Telegram",
    secondaryCta: "See how it works",
    note: "Opens in Telegram. No app to install. Not available to US users.",
  },

  chat: [
    {
      id: "deposit",
      from: "bot",
      text: "Your $10 don land. Moving it into your vault.",
    },
    {
      id: "ask",
      from: "user",
      text: "Put ₦300 a day into Apple and the S&P.",
    },
    {
      id: "card",
      from: "bot",
      text: "Put ₦300 a day into Apple and the S&P 500? You can pause or change this any time.",
      actions: ["Confirm", "Cancel"],
    },
    { id: "confirm", from: "user", text: "Confirm" },
    {
      id: "bought",
      from: "bot",
      text: "Bought $1.05 of Apple. Next buy tomorrow.",
    },
  ] as {
    id: "deposit" | "ask" | "card" | "confirm" | "bought"
    from: "bot" | "user"
    text: string
    actions?: [string, string]
  }[],

  how: {
    eyebrow: "How it works",
    title: "Set it up once. Pacer keeps the pace.",
    steps: [
      {
        title: "Deposit once.",
        body: "Send USDC from any Solana wallet or exchange to your Pacer address. Pacer moves it into your vault straight away. From there, only you can withdraw it.",
        example: {
          kind: "deposit",
          label: "Example" as string | null,
          lines: [
            "Add money to your vault",
            "Send USDC on Solana to this address:",
            "7xKX…9fQp",
            "USDC only, on the Solana network.",
            "I'll message you when it arrives and moves into your vault.",
          ],
        },
      },
      {
        title: "Set your pace.",
        body: "Tell Pacer's AI agent what you want in plain words, in English or Pidgin. It turns that into a plan and shows it to you before anything happens. ₦300 a day is fine. You can pause or change it any time.",
        example: {
          kind: "card",
          label: null as string | null,
          lines: [
            "Put ₦300 a day into Apple and the S&P 500? You can pause or change this any time.",
          ],
        },
      },
      {
        title: "Pacer buys steadily.",
        body: "Each day your amount unlocks and Pacer buys. Once a week you get a short summary. Nothing else.",
        example: {
          kind: "summary",
          label: "Example" as string | null,
          lines: [
            "Your week with Pacer",
            "Saved this week: ₦2,100",
            "Everything is in your vault, and you can check it yourself: View vault on-chain",
            'Want to see how it\'s doing? Just ask "how am I doing?"',
          ],
        },
      },
    ],
  },

  comparison: {
    eyebrow: "Past performance",
    title: "What ₦20,000 would have become",
    body: "₦20,000 kept in naira five years ago is still ₦20,000. The same money held in dollars, or in the S&P 500, would be worth far more in naira today. Pacer shows you this before you start, bad years included.",
    rows: [
      { key: "naira", label: "Kept in naira" },
      { key: "usdc", label: "Kept in USDC" },
      { key: "sp500", label: "In the S&P 500" },
    ] as { key: "naira" | "usdc" | "sp500"; label: string }[],
    worstDrop: "Worst drop",
    period: "Oct 2021 to Oct 2026",
    hint: "Drag along the chart to see any month.",
    chartLabel:
      "Value of ₦20,000 by month, kept in naira, kept in USDC and in the S&P 500. Use the arrow keys to move between months.",
    tableCaption: "What ₦20,000 would have become, month by month",
  },

  safety: {
    eyebrow: "Safety",
    title: "Nobody can rush it. Only you can take it out.",
    subline:
      "Your money sits in a vault run by a Solana program, not in our bank account. The rules are code, and they apply to us too.",
    guarantees: [
      {
        id: "out",
        title: "It only leaves to your wallet.",
        body: "When you start, you name your own Solana wallet. Withdrawals can go there and nowhere else.",
      },
      {
        id: "pace",
        title: "Your pace is enforced.",
        body: "Pacer can't buy faster than the daily amount you chose, even if our servers were broken into.",
      },
      {
        id: "buy",
        title: "The AI agent can only buy.",
        body: "Pacer's agent holds one key, and the vault program limits it to buying the stocks you picked, at the pace you set. It can't withdraw, send or move your money anywhere else, even if it misreads a message.",
      },
    ] as { id: "out" | "pace" | "buy"; title: string; body: string }[],
    note: "One thing to know: the stock tokens are issued by Backed Finance. Like any regulated asset, the issuer can freeze or reclaim tokens, for example under a court order. Stocks can also fall, and you can lose money.",
    vaultLabels: {
      in: "Your Pacer address",
      buy: "Stocks you picked",
      out: "Your wallet",
    },
    githubLabel: "Read the code on GitHub",
  },

  tickers: {
    title: "What you can own",
    items: [
      { symbol: "AAPLx", name: "Apple" },
      { symbol: "NVDAx", name: "Nvidia" },
      { symbol: "SPYx", name: "S&P 500" },
    ] as { symbol: "AAPLx" | "NVDAx" | "SPYx"; name: string }[],
    note: "Tokenized stocks on Solana that track the share price. More will follow.",
  },

  nigeria: {
    title: "Built first for Nigerians",
    body: "The naira has lost most of its value against the dollar in the last few years. Many young Nigerians moved their savings into dollars on exchanges, where the money now sits doing nothing. Pacer gives those dollars somewhere steady to go. It works the same way for anyone holding USDC outside the US.",
  },

  faq: [
    {
      q: "Is my money safe?",
      a: "Your USDC and stocks sit in a vault controlled by a Solana program. Only you can withdraw, and only to the wallet you named. The stock tokens' issuer, like any regulated issuer, can freeze or reclaim them. Like any investment, stocks can go down as well as up.",
    },
    {
      q: "Can I take my money out?",
      a: "Yes, any time. Ask the bot to withdraw and it goes to your wallet.",
    },
    {
      q: "Who can use Pacer?",
      a: "Anyone outside the US who holds USDC on Solana. Pacer started in Nigeria. It isn't available to US users.",
    },
    {
      q: "How much do I need to start?",
      a: "You choose your own daily pace, even ₦200 a day. Pacer buys once enough has built up.",
    },
    {
      q: "What does it cost?",
      a: "[Fees to be confirmed.]",
    },
    {
      q: "Is Pacer giving financial advice?",
      a: "No. Pacer shows you past performance and carries out the plan you choose. You decide.",
    },
  ],
  faqTitle: "Questions",

  cta: {
    title: "Start with what you already hold.",
    body: "Pacer opens in Telegram. Setup takes a few minutes.",
    button: "Start on Telegram",
  },

  footer: {
    tagline: "Save at your pace.",
    botLabel: "Telegram bot",
    privacyLabel: "Privacy",
    githubLabel: "GitHub",
    demoLabel: "Demo video",
    smallPrint:
      "Built for the MLH Solana Hackathon, November 2026. The demo runs on Solana devnet. Not available to US users. Figures shown are past performance, not a prediction or a promise.",
  },
}
