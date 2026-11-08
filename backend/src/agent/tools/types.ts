import type { z } from 'zod';
import type { WalletsService } from '../../wallets/wallets.service';
import type { VaultsService } from '../../vaults/vaults.service';
import type { HistoryService } from '../../history/history.service';
import type { ConfirmationService } from '../../bot/confirmation.service';
import type { KeeperService } from '../../scheduler/keeper.service';
import type { AppConfig } from '../../config/app-config';

/** What the user sees: template text plus at most one interactive element. */
export interface ToolReply {
  text: string;
  cardId?: string;
  webApp?: { url: string; label: string };
}

/** The only context the model ever hears about (never balances or addresses). */
export interface StepContext {
  awaiting: 'withdrawal_address' | 'currency' | null;
  hasVault: boolean;
}

/** Everything a tool may use. Built per message by BotService. */
export interface ToolContext {
  userId: string;
  owner: string;
  step: StepContext;
  wallets: WalletsService;
  vaults: VaultsService;
  history: HistoryService;
  confirmations: ConfirmationService;
  keeper?: KeeperService;
  config?: AppConfig;
  /** Who produced this turn's call ('llm' or 'parser') for record_intent. */
  source: () => 'llm' | 'parser';
}

export interface ToolOutcome {
  reply: ToolReply;
  /** Fixed short string handed back to the model. Never vault data. */
  modelResult: string;
}

/**
 * MCP-shaped tool definition: JSON-Schema inputs and read-only/destructive
 * annotations for the model, a strict zod schema as the real gate, and an
 * execute that may only reply from templates or propose a Confirm card.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean };
  argsSchema: z.ZodType;
  execute: (ctx: ToolContext, args: never) => Promise<ToolOutcome>;
}
