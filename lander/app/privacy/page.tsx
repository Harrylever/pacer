import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Pacer",
  description:
    "What Pacer collects, what it never collects, and what is public on-chain.",
};

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "This page",
    body: [
      "This website is one static page. It sets no cookies, runs no analytics or tracking, and never calls our backend. Nothing about your visit is collected, stored, or shared.",
    ],
  },
  {
    title: "The Pacer bot and Mini App",
    body: [
      "If you use Pacer in Telegram, we process what the service needs to work: your Telegram user ID, the wallet addresses you give us (your deposit address and the withdrawal address you confirm at setup), your settings (display currency, daily pace, chosen stocks, buy-alert and summary preferences), and records of deposits and buys so the bot can answer “how am I doing?” and send your weekly summary.",
      "Messages you send the bot are read to work out what you asked for. When the AI model is switched on, message text is sent to the model provider to parse your intent; messages containing a Solana address are never sent to the model. The model never signs anything and never speaks to you directly.",
      "For this demo, Pacer holds encrypted server-side keys for vaults it creates, labelled demo-only custody in the project documentation. On-chain vault rules — not our server — decide what those keys can do: buys only at your pace, withdrawals only to your fixed address.",
    ],
  },
  {
    title: "What is public",
    body: [
      "Pacer vaults live on Solana devnet. Vault addresses, deposits, buys, and withdrawals are public blockchain records that anyone can read on a block explorer. That is by design — it is how you can check the agent yourself — but it also means on-chain activity cannot be made private or deleted.",
    ],
  },
  {
    title: "What we never do",
    body: [
      "We never sell personal data, show ads, or share your information with marketers. We never ask for your seed phrase or private key, and the Mini App never signs anything or holds a key.",
    ],
  },
  {
    title: "This demo",
    body: [
      "Pacer is a hackathon demo on Solana devnet using test money with no real value. It is not available to people in the US, and nothing here is financial advice.",
    ],
  },
  {
    title: "Your choices and contact",
    body: [
      "You can pause or withdraw everything at any time in the bot. To ask what we hold about your Telegram account, or to ask us to delete off-chain records linked to it, message the Pacer bot or open an issue on the Pacer GitHub repository. On-chain records cannot be deleted, as explained above.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="ground-paper">
      <div className="mx-auto max-w-[760px] px-4 py-20 md:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">
          Pacer
        </p>
        <h1 className="mt-4 font-display text-[clamp(36px,6vw,56px)] font-[380] leading-[1.02] tracking-[-0.02em]">
          Privacy
        </h1>
        <p className="mt-5 text-[17px] leading-relaxed text-ink-muted">
          Plainly: what Pacer collects, what it never collects, and what is
          public by design. Last updated November 2026.
        </p>
        {SECTIONS.map((s) => (
          <section key={s.title} className="mt-12">
            <h2 className="font-display text-[24px] font-[480] leading-tight">
              {s.title}
            </h2>
            {s.body.map((p) => (
              <p
                key={p.slice(0, 32)}
                className="mt-4 text-[16px] leading-relaxed text-ink-muted"
              >
                {p}
              </p>
            ))}
          </section>
        ))}
        <p className="mt-16">
          <Link href="/" className="footer-link">
            ← Back to Pacer
          </Link>
        </p>
      </div>
    </main>
  );
}
