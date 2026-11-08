import { z } from 'zod';
import {
  ASSETS,
  FAQ_TOPICS,
  modelIdBytes,
  type FaqTopic,
  type Intent,
} from '../intent.schema';
import type { ToolContext, ToolDefinition, ToolOutcome } from './types';
import { explorerTx, msg, shortAddress } from '../../bot/messages';
import { formatMoney } from '../../common/money';
import { UserFacingError } from '../../common/errors';

const READ = { readOnlyHint: true, destructiveHint: false };
const PROPOSE = { readOnlyHint: false, destructiveHint: false };
const DONE = 'done';
const AWAITING = 'awaiting confirmation';

const noArgs = z.object({}).strict();
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

function tool(
  def: Omit<ToolDefinition, 'execute'> & {
    execute: ToolDefinition['execute'];
  },
): ToolDefinition {
  return def;
}

export const TOOLS: ToolDefinition[] = [
  tool({
    name: 'get_status',
    description:
      "Show the user's vault value, what they put in, and their pace.",
    inputSchema: obj({}),
    annotations: READ,
    argsSchema: noArgs,
    execute: async (ctx) => {
      const v = await ctx.vaults.valuation(ctx.owner);
      if (!v || v.holdings.length === 0)
        return { reply: { text: msg.vaultEmpty }, modelResult: DONE };
      const settings = ctx.wallets.getSettings(ctx.userId);
      const rate = ctx.history.latestNgnPerUsd();
      const money = (usd: number) =>
        formatMoney(usd, settings.displayCurrency, rate);
      // "Put in" counts only what was bought, and the total also holds the
      // USDC still waiting to be invested: take that cash out first, or idle
      // cash would show up as a gain.
      const change = v.totalUsd - v.waitingUsdc - v.investedUsd;
      const pct =
        v.investedUsd > 0
          ? ` (${change >= 0 ? '+' : ''}${((change / v.investedUsd) * 100).toFixed(1)}%)`
          : '';
      const lines = v.holdings
        .map(
          (h) =>
            `• ${h.mint}: ${h.uiAmount} — ${h.priced ? money(h.valueUsd) : 'price unavailable'}`,
        )
        .join('\n');
      const paceUsd = Number(v.ratePerPeriod) / 1_000_000;
      return {
        reply: {
          text: msg.statusReport({
            total: money(v.totalUsd),
            invested: money(v.investedUsd),
            change: `${money(change)}${pct}`,
            lines,
            waiting: `${v.waitingUsdc} USDC`,
            pace:
              settings.displayCurrency === 'USD'
                ? `$${paceUsd.toFixed(2)}`
                : `₦${Math.round(paceUsd * rate).toLocaleString('en-NG')}`,
            status: v.paused ? 'paused' : 'active',
            rate,
            negative: change < 0,
          }),
        },
        modelResult: DONE,
      };
    },
  }),
  tool({
    name: 'compare_history',
    description:
      "Show what a past lump sum became in naira, USDC, the S&P 500, Apple and Nvidia, side by side with each one's worst drop. Set focus when the user asked about exactly one stock.",
    inputSchema: obj({
      amountNgn: {
        type: 'number',
        description: 'Naira amount (default 20000).',
      },
      focus: {
        type: 'string',
        enum: ['SPYx', 'AAPLx', 'NVDAx'],
        description: 'The one stock the user asked about, if exactly one.',
      },
    }),
    annotations: READ,
    argsSchema: z
      .object({
        amountNgn: z.number().positive().max(1_000_000_000).optional(),
        focus: z.enum(['SPYx', 'AAPLx', 'NVDAx']).optional(),
      })
      .strict(),
    execute: async (
      ctx,
      args: { amountNgn?: number; focus?: 'SPYx' | 'AAPLx' | 'NVDAx' },
    ) => {
      const c = ctx.history.compareLumpSum({
        amountNgn: args.amountNgn ?? 20_000,
      });
      const fmt = (n: number) => `₦${n.toLocaleString('en-NG')}`;
      const miniappUrl = process.env.MINIAPP_URL?.trim();
      return {
        reply: {
          text: msg.historyReport({
            naira: fmt(c.naira.endNgn),
            rows: [
              ['Kept in USDC', c.usdc],
              ['In the S&P 500', c.sp500],
              ['In Apple', c.apple],
              ['In Nvidia', c.nvidia],
            ].map(([label, r]) => ({
              label: label as string,
              end: fmt((r as typeof c.usdc).endNgn),
              drop: `${(r as typeof c.usdc).maxDrawdownPct.toFixed(1)}%`,
            })),
            focusName: args.focus ? FOCUS_NAMES[args.focus] : undefined,
          }),
          ...(miniappUrl
            ? { webApp: { url: miniappUrl, label: msg.openComparison } }
            : {}),
        },
        modelResult: DONE,
      };
    },
  }),
  tool({
    name: 'answer_faq',
    description:
      'Answer a question about the withdrawal or deposit address, network, fees, safety or how Pacer works.',
    inputSchema: obj(
      {
        topic: {
          type: 'string',
          enum: [...FAQ_TOPICS],
        },
      },
      ['topic'],
    ),
    annotations: READ,
    argsSchema: z.object({ topic: z.enum(FAQ_TOPICS) }).strict(),
    execute: async (ctx, args: { topic: FaqTopic }) => ({
      reply: { text: faqText(ctx, args.topic) },
      modelResult: DONE,
    }),
  }),
  tool({
    name: 'show_options',
    description: 'Explain how the stocks differ without recommending one.',
    inputSchema: obj({}),
    annotations: READ,
    argsSchema: noArgs,
    execute: async () => ({
      reply: { text: msg.explainOptions },
      modelResult: DONE,
    }),
  }),
  tool({
    name: 'refuse_prediction',
    description: 'Decline to predict returns or guarantee money.',
    inputSchema: obj({}),
    annotations: READ,
    argsSchema: noArgs,
    execute: async () => ({
      reply: { text: msg.refusePrediction },
      modelResult: DONE,
    }),
  }),
  tool({
    name: 'greet',
    description: 'Greet the user.',
    inputSchema: obj({}),
    annotations: READ,
    argsSchema: noArgs,
    execute: async (ctx) => ({
      reply: { text: greetText(ctx) },
      modelResult: DONE,
    }),
  }),
  tool({
    name: 'clarify',
    description:
      'Ask for the missing amount or stock, or say the message was not understood.',
    inputSchema: obj(
      { missing: { type: 'string', enum: ['amount', 'asset', 'both'] } },
      ['missing'],
    ),
    annotations: READ,
    argsSchema: z
      .object({ missing: z.enum(['amount', 'asset', 'both']) })
      .strict(),
    execute: async (ctx, args: { missing: string }) => ({
      reply: { text: clarifyText(ctx, args.missing) },
      modelResult: DONE,
    }),
  }),
  tool({
    name: 'propose_plan',
    description:
      'Propose a daily savings plan. Creates a Confirm card; nothing is saved until the user confirms.',
    inputSchema: obj(
      {
        dailyNgn: { type: 'number', description: 'Naira to save per day.' },
        assets: {
          type: 'array',
          items: { type: 'string', enum: [...ASSETS] },
          description: 'Stocks the user named.',
        },
      },
      ['dailyNgn', 'assets'],
    ),
    annotations: PROPOSE,
    argsSchema: z
      .object({
        dailyNgn: z.number().positive().max(10_000_000),
        assets: z.array(z.enum(ASSETS)).min(1),
      })
      .strict(),
    execute: async (
      ctx,
      args: { dailyNgn: number; assets: (typeof ASSETS)[number][] },
    ) => {
      const destination = ctx.wallets.getWithdrawalAddress(ctx.userId);
      if (!destination) {
        return { reply: { text: msg.askWithdrawalAddress }, modelResult: DONE };
      }
      const rate = ctx.history.latestNgnPerUsd();
      const existing = await ctx.vaults.getVault(ctx.owner);
      const minTradeUsd =
        Number(ctx.config?.minTradeMicroUsdc ?? 1_000_000n) / 1_000_000;
      const days = Math.max(1, Math.ceil(minTradeUsd / (args.dailyNgn / rate)));
      const settings0 = ctx.wallets.getSettings(ctx.userId);
      const dailyDisplay =
        settings0.displayCurrency === 'USD'
          ? `$${(args.dailyNgn / rate).toFixed(2)}`
          : `₦${args.dailyNgn.toLocaleString('en-NG')}`;
      const cardText = msg.planCard({
        dailyDisplay,
        usdDaily: `$${(args.dailyNgn / rate).toFixed(2)}`,
        rate,
        stocks: args.assets.join(', '),
        addrShort: shortAddress(destination),
      });
      const intent: Intent = {
        type: 'set_plan',
        dailyNgn: args.dailyNgn,
        assets: [...args.assets],
      };
      const turnSource = ctx.source();
      const card = ctx.confirmations.propose(ctx.userId, {
        kind: 'set_plan',
        summary: existing
          ? cardText
          : `${msg.paceNote({ daily: dailyDisplay, days })}\n\n${cardText}`,
        execute: async () => {
          const result = await ctx.vaults.applyPlan(ctx.owner, {
            dailyNgn: args.dailyNgn,
            ngnPerUsd: ctx.history.latestNgnPerUsd(),
            assets: [...args.assets],
            withdrawalDestination: destination,
          });
          ctx.keeper?.registerVault(ctx.owner);
          // Audit trail only; recordIntent never fails the plan.
          await ctx.vaults.recordIntent(
            ctx.owner,
            intent,
            modelIdBytes(turnSource, process.env.LLM_MODEL),
          );
          return result.signature;
        },
      });
      return {
        reply: { text: card.text, cardId: card.id },
        modelResult: AWAITING,
      };
    },
  }),
  tool({
    name: 'propose_pause',
    description: 'Propose pausing the daily plan. Creates a Confirm card.',
    inputSchema: obj({}),
    annotations: PROPOSE,
    argsSchema: noArgs,
    execute: async (ctx) => {
      const card = ctx.confirmations.propose(ctx.userId, {
        kind: 'pause',
        summary: msg.pauseCard,
        execute: async () => ctx.vaults.pause(ctx.owner),
        done: () => msg.pausedDone,
      });
      return {
        reply: { text: card.text, cardId: card.id },
        modelResult: AWAITING,
      };
    },
  }),
  tool({
    name: 'propose_resume',
    description: 'Propose resuming a paused plan. Creates a Confirm card.',
    inputSchema: obj({}),
    annotations: PROPOSE,
    argsSchema: noArgs,
    execute: async (ctx) => {
      const card = ctx.confirmations.propose(ctx.userId, {
        kind: 'resume',
        summary: msg.resumeCard('your saved pace'),
        execute: async () => ctx.vaults.resume(ctx.owner),
      });
      return {
        reply: { text: card.text, cardId: card.id },
        modelResult: AWAITING,
      };
    },
  }),
  tool({
    name: 'propose_withdraw_all',
    description:
      'Propose withdrawing everything to the fixed withdrawal wallet. Creates a Confirm card.',
    inputSchema: obj({}),
    annotations: PROPOSE,
    argsSchema: noArgs,
    execute: async (ctx) => {
      const heldNow = await ctx.vaults.holdings(ctx.owner);
      // Stocks leave as stock tokens, so only then explain how to sell them.
      const hasStocks = heldNow.some((h) => h.mint !== 'USDC');
      const card = ctx.confirmations.propose(ctx.userId, {
        kind: 'withdraw_all',
        summary: msg.withdrawCard({
          addrShort: shortAddress(
            (await ctx.vaults.getVault(ctx.owner))?.withdrawalDestination ?? '',
          ),
          lines: heldNow.map((h) => `• ${h.uiAmount} ${h.mint}`).join('\n'),
          hasStocks,
        }),
        execute: async () => {
          const r = await ctx.vaults.executeWithdrawAll(ctx.owner);
          if (!r.signature) throw new UserFacingError(msg.nothingToWithdraw);
          return r.signature;
        },
        done: (sig) => msg.withdrawDone(explorerTx(sig), hasStocks),
      });
      return {
        reply: { text: card.text, cardId: card.id },
        modelResult: AWAITING,
      };
    },
  }),
];

/** Pending-step reminder appended after FAQ/greeting replies. */
export function stepReminder(ctx: ToolContext): string {
  if (ctx.step.awaiting === 'withdrawal_address') return msg.addressReminder;
  if (ctx.step.awaiting === 'currency') return msg.currencyReminder;
  return '';
}

function withReminder(ctx: ToolContext, text: string): string {
  const r = stepReminder(ctx);
  return r ? `${text}\n\n${r}` : text;
}

const FOCUS_NAMES = {
  SPYx: 'the S&P 500',
  AAPLx: 'Apple',
  NVDAx: 'Nvidia',
} as const;

function faqText(ctx: ToolContext, topic: FaqTopic): string {
  const body =
    topic === 'deposit_address'
      ? msg.depositAddressInfo(ctx.owner)
      : msg.faq[topic];
  return withReminder(ctx, body);
}

function greetText(ctx: ToolContext): string {
  return withReminder(ctx, msg.greeting);
}

function clarifyText(ctx: ToolContext, missing: string): string {
  if (missing === 'amount') return msg.clarifyAmount;
  if (missing === 'asset') return msg.clarifyAsset;
  // Nothing understood: at the address step say what that step needs.
  return ctx.step.awaiting === 'withdrawal_address'
    ? msg.stuckOnAddress
    : msg.didntUnderstand;
}

export function toolByName(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

export async function executeTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const def = toolByName(name);
  if (!def) throw new Error(`unknown tool: ${name}`);
  const args = def.argsSchema.parse(rawArgs ?? {});
  return def.execute(ctx, args as never);
}

/** Deterministic-parser intent → the same tool the model would call. */
export function intentToToolCall(intent: Intent): {
  name: string;
  args: unknown;
} {
  switch (intent.type) {
    case 'set_plan':
      return {
        name: 'propose_plan',
        args: { dailyNgn: intent.dailyNgn, assets: intent.assets },
      };
    case 'pause':
      return { name: 'propose_pause', args: {} };
    case 'resume':
      return { name: 'propose_resume', args: {} };
    case 'withdraw_all':
      return { name: 'propose_withdraw_all', args: {} };
    case 'status':
      return { name: 'get_status', args: {} };
    case 'history':
      return {
        name: 'compare_history',
        args: intent.focus ? { focus: intent.focus } : {},
      };
    case 'explain_options':
      return { name: 'show_options', args: {} };
    case 'refuse_prediction':
      return { name: 'refuse_prediction', args: {} };
    case 'faq':
      return { name: 'answer_faq', args: { topic: intent.topic } };
    case 'greeting':
      return { name: 'greet', args: {} };
    case 'clarify':
      return { name: 'clarify', args: { missing: intent.missing } };
    default:
      return { name: 'clarify', args: { missing: 'both' } };
  }
}
