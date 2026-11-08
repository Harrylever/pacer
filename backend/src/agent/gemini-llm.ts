import { Logger } from '@nestjs/common';
import { buildIntentPrompt } from './prompt';
import { INTENT_JSON_SCHEMA } from './intent-json-schema';

export type LlmCall = (prompt: string) => Promise<string>;
export type FetchLike = (
  url: string,
  init?: Record<string, unknown>,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text?(): Promise<string> }>;

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const API_REVISION = '2026-05-20';

function extractOutputText(body: unknown): string {
  if (!body || typeof body !== 'object') throw new Error('gemini: empty response');
  const b = body as Record<string, unknown>;
  if (typeof b.output_text === 'string' && b.output_text.trim()) return b.output_text;
  // Defensive fallbacks for minor shape drift; output_text is the documented field.
  const steps = (b.steps ?? b.outputs) as unknown;
  if (Array.isArray(steps)) {
    for (const s of steps as Record<string, unknown>[]) {
      if (typeof s?.text === 'string' && s.text.trim()) return s.text;
      const content = s?.content as Record<string, unknown>[] | undefined;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (typeof c?.text === 'string' && c.text.trim()) return c.text as string;
        }
      }
    }
  }
  throw new Error('gemini: no output text');
}

/**
 * Binds Gemini structured output to the LLM_CALL seam. Plain fetch through
 * an injectable function so tests can mock it. Never logs the key or text.
 */
export function createGeminiLlmCall(args: {
  apiKey: string;
  model: string;
  fetchFn?: FetchLike;
  timeoutMs?: number;
}): LlmCall {
  const logger = new Logger('GeminiLlmCall');
  const fetchFn: FetchLike =
    args.fetchFn ?? ((url, init) => fetch(url, init as RequestInit) as never);
  const timeoutMs = args.timeoutMs ?? 5000;
  return async (userText: string): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(ENDPOINT, {
        method: 'POST',
        headers: {
          'x-goog-api-key': args.apiKey,
          'Content-Type': 'application/json',
          'Api-Revision': API_REVISION,
        },
        body: JSON.stringify({
          model: args.model,
          input: buildIntentPrompt(userText),
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: INTENT_JSON_SCHEMA,
          },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        logger.warn(`gemini model=${args.model} outcome=http-${res.status}`);
        throw new Error(`gemini http ${res.status}`);
      }
      const out = extractOutputText(await res.json());
      logger.log(`gemini model=${args.model} outcome=llm`);
      return out;
    } finally {
      clearTimeout(timer);
    }
  };
}
