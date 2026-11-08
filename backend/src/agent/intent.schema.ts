import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ASSETS = ['SPYx', 'AAPLx', 'NVDAx'] as const;
export type Asset = (typeof ASSETS)[number];

/** Questions the bot answers from fixed templates (never from model text). */
export const FAQ_TOPICS = [
  'wallet_address',
  'deposit_address',
  'network',
  'change_address',
  'fees',
  'safety',
  'withdraw_how',
  'live_price',
  'how_it_works',
] as const;
export type FaqTopic = (typeof FAQ_TOPICS)[number];

export const IntentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('set_plan'),
    dailyNgn: z.number().positive().max(10_000_000),
    assets: z.array(z.enum(ASSETS)).min(1),
  }),
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('withdraw_all') }),
  z.object({ type: z.literal('status') }),
  z.object({ type: z.literal('history'), focus: z.enum(ASSETS).optional() }),
  z.object({ type: z.literal('explain_options') }),
  z.object({ type: z.literal('refuse_prediction') }),
  z.object({ type: z.literal('faq'), topic: z.enum(FAQ_TOPICS) }),
  z.object({ type: z.literal('greeting') }),
  z.object({
    type: z.literal('clarify'),
    missing: z.enum(['amount', 'asset', 'both']),
  }),
  z.object({ type: z.literal('unknown') }),
]);

export type Intent = z.infer<typeof IntentSchema>;

/** Canonical JSON for hashing: sorted keys/assets, no whitespace drift. */
export function canonicalIntentJson(intent: Intent): string {
  if (intent.type === 'set_plan') {
    return JSON.stringify({
      assets: [...intent.assets].sort(),
      dailyNgn: intent.dailyNgn,
      type: intent.type,
    });
  }
  return JSON.stringify({ type: intent.type });
}

/** 16-byte model id: first 16 bytes of SHA-256(LLM_MODEL), zeros for the parser. */
export function modelIdBytes(source: 'llm' | 'parser', model?: string): Uint8Array {
  if (source !== 'llm' || !model) return new Uint8Array(16);
  return new Uint8Array(
    createHash('sha256').update(model).digest().subarray(0, 16),
  );
}
