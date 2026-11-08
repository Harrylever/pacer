import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  IntentSchema,
  type Asset,
  type FaqTopic,
  type Intent,
} from './intent.schema';
import type { LlmCall } from './gemini-llm';

export const LLM_CALL = 'LLM_CALL';
export type { LlmCall };

/** Free-tier guard: at most 20 LLM calls per user per minute. */
export const LLM_RATE_LIMIT_PER_MINUTE = 20;
const SOLANA_ADDRESS = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;

/**
 * Which fixed FAQ answer a question needs, or null. Order matters: the
 * most specific topic first. Deterministic, so it works with the model off.
 */
export function faqTopic(lower: string): FaqTopic | null {
  const net = /\b(mainnet|main net|devnet|dev net|testnet|test net)\b/.test(
    lower,
  );
  if (
    /(change|edit|update|replace|wrong).{0,30}\baddress\b|\baddress\b.{0,30}(change|wrong|later)/.test(
      lower,
    )
  )
    return 'change_address';
  if (
    /deposit.{0,20}\b(address|wallet)\b|\b(address|wallet)\b.{0,20}deposit|where (do|can|should) i (send|deposit|put|add)|how (do|can) i (deposit|fund|top up|add (more )?(money|usdc))/.test(
      lower,
    )
  )
    return 'deposit_address';
  if (net && /\b(address|wallet)\b/.test(lower)) return 'wallet_address';
  if (
    /(which|what|where).{0,25}\b(address|wallet)\b|how.{0,20}(find|get|copy).{0,20}\baddress\b|\bsolana address\b/.test(
      lower,
    )
  )
    return 'wallet_address';
  if (net || /real money|is this real|test money|fake money/.test(lower))
    return 'network';
  if (/\b(fees?|gas)\b|(need|have to).{0,15}\bsol\b/.test(lower)) return 'fees';
  if (
    /(how|what).{0,30}(withdraw|cash ?out|sell)|(sell|convert|swap|cash ?out).{0,25}(stocks?|tokens?|my (apple|nvidia|s&p|holdings|money)|usdc|naira)|withdraw.{0,25}\b(as|in|into)\b.{0,5}(usdc|cash|naira|stocks?|tokens?)|(what|will).{0,5}\bi (get|receive).{0,40}(cash|stocks?|tokens?|usdc|naira|withdraw|money)/.test(
      lower,
    )
  )
    return 'withdraw_how';
  if (
    /(current|latest|live|right now|today|now).{0,30}\b(price|value|quote|worth)\b|\b(price|value|quote)\b.{0,12}\b(of|for)\b.{0,30}(s&p|s and p|spy|apple|aapl|nvidia|nvda|stock|index)|how much is (the |an? )?(s&p|s and p|spy|apple|aapl|nvidia|nvda)/.test(
      lower,
    )
  )
    return 'live_price';
  if (/\b(safe|safety|scam|steal|trust|secure)\b/.test(lower)) return 'safety';
  if (
    /how (does|do|is) (it|this|pacer) work|what (is|does) pacer|what is this|how it works/.test(
      lower,
    )
  )
    return 'how_it_works';
  return null;
}

/**
 * Numbers that are not amounts: the 500 in "S&P 500" (also "S&P500",
 * "s and p 500", "500 index"), lengths of time ("5 years", "3 months")
 * and years after a date word ("since 2021").
 * The bare-number fallback in parseDailyAmount used to read the first as
 * ₦500 a day and would read the second as ₦5, and the model could make the
 * same mistakes.
 */
export function withoutNonAmounts(text: string): string {
  return text
    .replace(/\b(?:s\s*&\s*p|s\s+and\s+p|sp)\s*500\b|\b500\s+index\b/gi, ' ')
    .replace(/\b\d+\s*(?:years?|yrs?|months?|weeks?)\b/gi, ' ')
    .replace(
      /\b(?:since|from|in|until|before|after|by)\s+(?:19|20)\d{2}\b/gi,
      ' ',
    );
}

/** True when the message names an amount (digits, "k", or hundred/thousand), index names aside. */
export function mentionsAmount(text: string): boolean {
  const t = withoutNonAmounts(text);
  return /\d/.test(t) || /\b(hundred|thousand)\b/i.test(t);
}

/**
 * The daily amount, preferring a number next to ₦/N or "a day" so the
 * "500" in "S&P 500" is never mistaken for the pace (review item 11).
 */
export function parseDailyAmount(rawText: string): number | null {
  const text = withoutNonAmounts(rawText);
  const patterns = [
    /₦\s*([\d,]+)/,
    /#\s*([\d,]+)/,
    /\bN\s*([\d,]+)/,
    /([\d,]+)\s*(?:a day|per day|\/day)/i,
    /([\d,]+)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

const HISTORY_WORDS =
  /\b(how (did|has|have|is|was|does)|perform\w*|history|past|last|over the|years?|since|happened)\b/;

const ASSET_WORDS: [RegExp, Asset][] = [
  [/apple|aapl/i, 'AAPLx'],
  [/s&p|s and p|\bspy\b|index fund/i, 'SPYx'],
  [/nvidia|nvda/i, 'NVDAx'],
];

/**
 * Parses user text into a zod-validated Intent. An injected LLM caller
 * (structured JSON out) is tried first when present; its output is never
 * trusted — zod validates it, and on ANY failure the deterministic parser
 * handles that message instead. A failure never reaches the user as an
 * error. This service never builds transactions.
 *
 * Safety: a message containing a Solana address is never sent to the
 * model (the address flow handles it), and LLM calls are rate-limited
 * per user. Logs record only the outcome, never the user's text.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private llmHits = new Map<string, number[]>();
  /** Injectable clock for rate-limit tests. */
  now: () => number = Date.now;

  constructor(
    @Optional() @Inject(LLM_CALL) private readonly llmCall?: LlmCall,
  ) {}

  private llmAllowed(userId: string): boolean {
    const cutoff = this.now() - 60_000;
    const hits = (this.llmHits.get(userId) ?? []).filter((t) => t > cutoff);
    if (hits.length >= LLM_RATE_LIMIT_PER_MINUTE) {
      this.llmHits.set(userId, hits);
      return false;
    }
    hits.push(this.now());
    this.llmHits.set(userId, hits);
    return true;
  }

  private lastSource = new Map<string, 'llm' | 'parser'>();

  /** Whether the user's last intent came from the model or the parser. */
  lastIntentSource(userId: string): 'llm' | 'parser' {
    return this.lastSource.get(userId) ?? 'parser';
  }

  markIntentSource(userId: string, source: 'llm' | 'parser'): void {
    this.lastSource.set(userId, source);
  }

  /**
   * Gate for any model call: address-bearing messages never go to the
   * model, and calls are rate-limited per user. Consumes one slot when true.
   */
  llmGate(text: string, userId: string): boolean {
    if (SOLANA_ADDRESS.test(text)) return false;
    return this.llmAllowed(userId);
  }

  async parseIntent(text: string, userId = 'anonymous'): Promise<Intent> {
    if (this.llmCall && !SOLANA_ADDRESS.test(text) && this.llmAllowed(userId)) {
      try {
        const raw = await this.llmCall(text);
        const intent = IntentSchema.parse(JSON.parse(raw));
        this.lastSource.set(userId, 'llm');
        this.logger.log('intent outcome=llm');
        return intent;
      } catch {
        this.logger.log('intent outcome=fallback');
      }
    }
    this.lastSource.set(userId, 'parser');
    return this.parseDeterministic(text);
  }

  /** The deterministic parser alone (eval + fallback). */
  parseDeterministicIntent(raw: string): Intent {
    return this.parseDeterministic(raw);
  }

  private parseDeterministic(raw: string): Intent {
    const text = raw.trim();
    const lower = text.toLowerCase();
    if (
      /^(hi|hello|hey|howdy|sup|yo|good (morning|afternoon|evening)|how far|how you dey)\W*$/.test(
        lower,
      )
    )
      return { type: 'greeting' };
    if (/will i make|how much will i (have|make)|guarantee/.test(lower))
      return { type: 'refuse_prediction' };
    if (/which stock|what.?s best|should i buy/.test(lower))
      return { type: 'explain_options' };
    if (/withdraw everything|withdraw all/.test(lower))
      return { type: 'withdraw_all' };
    if (/^(pause|stop)\b/.test(lower)) return { type: 'pause' };
    if (/^resume\b/.test(lower)) return { type: 'resume' };
    if (/how am i doing|my balance|portfolio|status/.test(lower))
      return { type: 'status' };
    if (/worth it|investing worth/.test(lower)) return { type: 'history' };

    const assets = ASSET_WORDS.filter(([re]) => re.test(text)).map(
      ([, a]) => a,
    );
    const dailyNgn = parseDailyAmount(text);
    // How a stock did over time. A question, not a plan: no amount in it.
    if (dailyNgn === null && assets.length > 0 && HISTORY_WORDS.test(lower)) {
      return assets.length === 1
        ? { type: 'history', focus: assets[0] }
        : { type: 'history' };
    }
    if (dailyNgn !== null && assets.length > 0) {
      const parsed = IntentSchema.safeParse({
        type: 'set_plan',
        dailyNgn,
        assets,
      });
      if (parsed.success) return parsed.data;
    }
    if (dailyNgn === null) {
      const topic = faqTopic(lower);
      if (topic) return { type: 'faq', topic };
    }
    if (dailyNgn !== null) return { type: 'clarify', missing: 'asset' };
    if (assets.length > 0) return { type: 'clarify', missing: 'amount' };
    return { type: 'unknown' };
  }
}
