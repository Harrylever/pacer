import { Logger } from '@nestjs/common';
import { TOOLS } from './tools/registry';

export type FetchLike = (
  url: string,
  init?: Record<string, unknown>,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface FunctionResultStep {
  type: 'function_result';
  name: string;
  call_id: string;
  result: { type: 'text'; text: string }[];
}

export interface ToolCallRequest {
  input: string | FunctionResultStep[];
  previousInteractionId?: string;
}

export interface ToolInteraction {
  id?: string;
  calls: { id: string; name: string; arguments: unknown }[];
}

export type ToolLlmCall = (req: ToolCallRequest) => Promise<ToolInteraction>;

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const API_REVISION = '2026-05-20';

/** MCP-shaped registry tools in the Gemini function declaration shape. */
export function geminiToolDeclarations() {
  return TOOLS.map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
  }));
}

/**
 * Gemini function calling via the Interactions API (live docs, Nov 5 2026):
 * tools are `{type:"function", name, description, parameters}`, tool use is
 * forced with generation_config.tool_choice mode "any", replies continue
 * with previous_interaction_id and function_result steps. Plain injectable
 * fetch; never logs the key or the user's text.
 */
export function createGeminiToolCall(args: {
  apiKey: string;
  model: string;
  fetchFn?: FetchLike;
  timeoutMs?: number;
}): ToolLlmCall {
  const logger = new Logger('GeminiToolCall');
  const fetchFn: FetchLike =
    args.fetchFn ?? ((url, init) => fetch(url, init as RequestInit) as never);
  const timeoutMs = args.timeoutMs ?? 5000;
  return async (req: ToolCallRequest): Promise<ToolInteraction> => {
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
          input: req.input,
          tools: geminiToolDeclarations(),
          generation_config: {
            tool_choice: {
              allowed_tools: {
                mode: 'any',
                tools: TOOLS.map((t) => t.name),
              },
            },
          },
          ...(req.previousInteractionId
            ? { previous_interaction_id: req.previousInteractionId }
            : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        logger.warn(`gemini model=${args.model} outcome=http-${res.status}`);
        throw new Error(`gemini http ${res.status}`);
      }
      const body = (await res.json()) as {
        id?: string;
        steps?: Record<string, unknown>[];
      };
      const calls = (body.steps ?? [])
        .filter((s) => s.type === 'function_call')
        .map((s) => ({
          id: String(s.id ?? ''),
          name: String(s.name ?? ''),
          arguments: s.arguments ?? {},
        }));
      logger.log(`gemini model=${args.model} outcome=tool-turn calls=${calls.length}`);
      return { id: body.id, calls };
    } finally {
      clearTimeout(timer);
    }
  };
}
