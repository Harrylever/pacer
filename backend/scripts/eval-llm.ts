/**
 * Runs the eval set three ways and prints accuracy + mean latency:
 *  - deterministic parser alone (intent + mapped tool)
 *  - tool-agent alone (only turns the model actually handled)
 *  - tool-agent with parser fallback (what users actually get)
 * Also prints the fallback score on the Round 4 subset (first 34 cases).
 * With GEMINI_API_KEY/LLM_MODEL unset, only the parser runs.
 * Run: bun run eval:llm   (Node + ts-node, never the Bun runtime)
 */
import '../src/load-env';
import { AgentService } from '../src/agent/agent.service';
import { ToolAgentService } from '../src/agent/tool-agent.service';
import { EVAL_CASES, ROUND4_CASE_COUNT, intentsEqual, type EvalCase } from '../src/agent/eval-cases';
import { intentToToolCall, type ToolContext } from '../src/agent/tools';
import { toolLlmCallFromEnv } from '../src/agent/agent.module';
import { FakeVaultClient } from '../src/solana/fake-vault-client';
import { VaultsService } from '../src/vaults/vaults.service';
import { ConfirmationService } from '../src/bot/confirmation.service';
import { HistoryService } from '../src/history/history.service';

const USER = 'eval-user';
const DEST = 'EvalWallet1111111111111111111111111111111111';
const OWNER = 'EvalOwner11111111111111111111111111111111111';

/** Minimal wallet stub: tools only read the fixed destination + settings. */
const walletsStub = {
  getWithdrawalAddress: () => DEST,
  getSettings: () => ({
    displayCurrency: 'NGN' as const,
    notifyBuys: false,
    summaryCadence: 'weekly' as const,
  }),
};

async function makeCtx(agent: AgentService, step: EvalCase['step']): Promise<ToolContext> {
  const client = new FakeVaultClient();
  const vaults = new VaultsService(client);
  return {
    userId: USER,
    owner: OWNER,
    step: step ?? { awaiting: null, hasVault: false },
    wallets: walletsStub as unknown as ToolContext['wallets'],
    vaults,
    history: new HistoryService(),
    confirmations: new ConfirmationService(),
    source: () => agent.lastIntentSource(USER),
  };
}

function agentCorrect(
  c: EvalCase,
  calls: { name: string; args: unknown }[],
): boolean {
  const first = calls[0];
  if (!first || first.name !== c.expectedTool) return false;
  if (c.expected.type === 'set_plan') {
    const a = first.args as { dailyNgn?: number; assets?: string[] };
    return (
      a.dailyNgn === c.expected.dailyNgn &&
      [...(a.assets ?? [])].sort().join(',') ===
        [...c.expected.assets].sort().join(',')
    );
  }
  if (c.expected.type === 'faq') {
    return (first.args as { topic?: string }).topic === c.expected.topic;
  }
  return true;
}

async function main(): Promise<void> {
  const total = EVAL_CASES.length;
  const pct = (n: number, d: number) => `${n}/${d} (${((n / d) * 100).toFixed(1)}%)`;

  const parserAgent = new AgentService();
  let parserRight = 0;
  const parserFailures: string[] = [];
  for (const c of EVAL_CASES) {
    const intent = parserAgent.parseDeterministicIntent(c.text);
    const ok =
      intentsEqual(intent, c.expected) &&
      intentToToolCall(intent).name === c.expectedTool;
    if (ok) parserRight++;
    else parserFailures.push(`parser: "${c.text}" -> ${intent.type} (want ${c.expected.type}/${c.expectedTool})`);
  }
  console.log(`parser alone: ${pct(parserRight, total)}`);

  const toolCall = toolLlmCallFromEnv();
  if (!toolCall) {
    console.log('LLM disabled (GEMINI_API_KEY/LLM_MODEL blank); skipping live eval');
    console.log(`failures:\n${parserFailures.join('\n')}`);
    return;
  }

  let agentRight = 0;
  let combinedRight = 0;
  let oldCombined = 0;
  let latencyTotal = 0;
  const failures: string[] = [];
  for (const [i, c] of EVAL_CASES.entries()) {
    // A fresh agent per case: each case is a different simulated user, so
    // the 20/min per-user LLM rate limit does not throttle the eval itself.
    const agent = new AgentService();
    const svc = new ToolAgentService(toolCall, agent);
    const ctx = await makeCtx(agent, c.step);
    const t0 = Date.now();
    const r = await svc.handle({
      text: c.text,
      userId: USER,
      step: ctx.step,
      ctx,
    });
    latencyTotal += Date.now() - t0;
    const ok = agentCorrect(c, r.calls);
    if (ok) {
      combinedRight++;
      if (i < ROUND4_CASE_COUNT) oldCombined++;
      if (r.source === 'llm') agentRight++;
      else failures.push(`agent(fallback): "${c.text}" -> ${r.toolsUsed[0]} (want ${c.expectedTool})`);
    } else {
      failures.push(
        `agent: "${c.text}" -> ${r.source}/${r.toolsUsed[0] ?? 'none'} (want ${c.expectedTool})`,
      );
    }
  }
  console.log(`tool-agent alone: ${pct(agentRight, total)}`);
  console.log(`tool-agent with fallback: ${pct(combinedRight, total)}`);
  console.log(
    `tool-agent with fallback on Round 4 subset: ${pct(oldCombined, ROUND4_CASE_COUNT)}`,
  );
  console.log(`mean latency per message: ${Math.round(latencyTotal / total)}ms`);
  if (failures.length) console.log(`failures:\n${failures.join('\n')}`);
}

void main();
