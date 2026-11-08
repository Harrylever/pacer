import { Logger, Module } from '@nestjs/common';
import { AgentService, LLM_CALL } from './agent.service';
import { createGeminiLlmCall, type LlmCall } from './gemini-llm';
import { ToolAgentService, TOOL_LLM_CALL } from './tool-agent.service';
import { createGeminiToolCall, type ToolLlmCall } from './gemini-tools';

const logger = new Logger('AgentModule');
let loggedDisabled = false;

function envCreds(env: NodeJS.ProcessEnv): { apiKey: string; model: string } | undefined {
  const apiKey = env.GEMINI_API_KEY?.trim();
  const model = env.LLM_MODEL?.trim();
  if (!apiKey || !model) {
    if (!loggedDisabled) {
      loggedDisabled = true;
      logger.log('LLM disabled (GEMINI_API_KEY/LLM_MODEL blank); using the deterministic parser');
    }
    return undefined;
  }
  return { apiKey, model };
}

/** Legacy one-shot classifier binding (kept for eval/back-compat). */
export function llmCallFromEnv(env: NodeJS.ProcessEnv = process.env): LlmCall | undefined {
  const creds = envCreds(env);
  return creds ? createGeminiLlmCall(creds) : undefined;
}

/** Tool-calling binding used by the bot. No creds = parser only. */
export function toolLlmCallFromEnv(env: NodeJS.ProcessEnv = process.env): ToolLlmCall | undefined {
  const creds = envCreds(env);
  return creds ? createGeminiToolCall(creds) : undefined;
}

@Module({
  providers: [
    AgentService,
    ToolAgentService,
    { provide: LLM_CALL, useFactory: () => llmCallFromEnv() },
    { provide: TOOL_LLM_CALL, useFactory: () => toolLlmCallFromEnv() },
  ],
  exports: [AgentService, ToolAgentService],
})
export class AgentModule {}
