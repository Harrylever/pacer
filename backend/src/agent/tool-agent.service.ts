import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { AgentService, mentionsAmount } from './agent.service';
import type { ToolLlmCall } from './gemini-tools';
import { buildToolPrompt } from './tool-prompt';
import {
  executeTool,
  intentToToolCall,
  toolByName,
  type StepContext,
  type ToolContext,
  type ToolReply,
} from './tools';

export const TOOL_LLM_CALL = 'TOOL_LLM_CALL';

const MESSAGE_BUDGET_MS = 8000;

/**
 * The tool-calling agent. The model only ever chooses a tool; every reply
 * the user sees is a template from a tool. One model request per message,
 * 8 s for the whole message. On ANY failure the
 * deterministic parser runs the same tools instead. The user never
 * sees an error from this layer.
 */
@Injectable()
export class ToolAgentService {
  private readonly logger = new Logger(ToolAgentService.name);
  now: () => number = Date.now;

  constructor(
    @Optional()
    @Inject(TOOL_LLM_CALL)
    private readonly toolCall?: ToolLlmCall,
    @Optional() private readonly agent?: AgentService,
  ) {}

  async handle(args: {
    text: string;
    userId: string;
    step: StepContext;
    ctx: ToolContext;
  }): Promise<{
    reply: ToolReply;
    source: 'llm' | 'parser';
    toolsUsed: string[];
    calls: { name: string; args: unknown }[];
  }> {
    const started = this.now();
    if (this.toolCall && this.agent) {
      try {
        return await this.runLoop(args, started);
      } catch (err) {
        this.logger.log(
          `tool-agent outcome=fallback reason=${(err as Error).message.slice(0, 80)}`,
        );
      }
    }
    return this.runParser(args);
  }

  /**
   * One model request per message: the model picks a tool, the first call
   * runs, and its template is the reply. There is no second model turn:
   * the model's own words are never shown, so a second turn only added
   * latency, and chained calls let a later tool's reply replace the right
   * one (a greeting could end up as "I didn't get that"). Extra calls in
   * the same response are ignored, so at most one proposal card can exist.
   */
  private async runLoop(
    args: { text: string; userId: string; step: StepContext; ctx: ToolContext },
    started: number,
  ): Promise<{
    reply: ToolReply;
    source: 'llm' | 'parser';
    toolsUsed: string[];
    calls: { name: string; args: unknown }[];
  }> {
    if (this.now() - started > MESSAGE_BUDGET_MS)
      throw new Error('message budget exceeded');
    if (!this.agent!.llmGate(args.text, args.userId))
      throw new Error('llm gated');
    const res = await this.toolCall!({
      input: buildToolPrompt(args.text, args.step),
    });
    const call = res.calls[0];
    if (!call) throw new Error('no tool call');
    if (!toolByName(call.name)) throw new Error(`unknown tool: ${call.name}`);
    // A plan needs an amount the user actually stated. A question about the
    // S&P 500 once became a ₦500-a-day plan card, so the model can't propose
    // a plan for a message with no amount in it; the parser answers instead.
    if (call.name === 'propose_plan' && !mentionsAmount(args.text))
      throw new Error('plan proposed without an amount');
    // Bad arguments throw here, before anything is created: the parser takes over.
    const outcome = await executeTool(call.name, call.arguments, args.ctx);
    this.agent!.markIntentSource(args.userId, 'llm');
    this.logger.log(`tool-agent outcome=llm tools=${call.name}`);
    return {
      reply: outcome.reply,
      source: 'llm',
      toolsUsed: [call.name],
      calls: [{ name: call.name, args: call.arguments }],
    };
  }

  private async runParser(args: {
    text: string;
    userId: string;
    ctx: ToolContext;
  }): Promise<{
    reply: ToolReply;
    source: 'parser';
    toolsUsed: string[];
    calls: { name: string; args: unknown }[];
  }> {
    this.agent?.markIntentSource(args.userId, 'parser');
    const intent = this.agent
      ? this.agent.parseDeterministicIntent(args.text)
      : ({ type: 'unknown' } as const);
    const call = intentToToolCall(intent);
    const outcome = await executeTool(call.name, call.args, args.ctx);
    this.logger.log(`tool-agent outcome=parser tools=${call.name}`);
    return {
      reply: outcome.reply,
      source: 'parser',
      toolsUsed: [call.name],
      calls: [{ name: call.name, args: call.args }],
    };
  }
}
