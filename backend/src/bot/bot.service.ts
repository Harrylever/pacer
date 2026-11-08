import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Bot, InlineKeyboard } from 'grammy';
import { AgentService } from '../agent/agent.service';
import { ToolAgentService } from '../agent/tool-agent.service';
import {
  executeTool,
  intentToToolCall,
  type ToolContext,
} from '../agent/tools';
import type { Intent } from '../agent/intent.schema';
import { ConfirmationService } from './confirmation.service';
import { WalletsService } from '../wallets/wallets.service';
import { VaultsService } from '../vaults/vaults.service';
import { HistoryService } from '../history/history.service';
import { KeeperService } from '../scheduler/keeper.service';
import {
  BOT_COMMANDS,
  explorerAddress,
  explorerTx,
  msg,
  shortAddress,
  shortReason,
} from './messages';
import { parseDisplayCurrency } from './currency';
import { formatMoney } from '../common/money';
import { NoPendingConfirmation, UserFacingError } from '../common/errors';
import { NotificationsService } from '../notifications/notifications.service';
import type { AppConfig } from '../config/app-config';
import type { PrismaService } from '../prisma/prisma.service';
import { APP_CONFIG } from '../config/config.module';
import { Inject } from '@nestjs/common';
import { pollWithBackoff } from './polling';

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface BotReply {
  text: string;
  cardId?: string;
  webApp?: { url: string; label: string };
}

/**
 * grammY wrapped as a Nest provider (~20 lines of wiring, per SPEC).
 * Long polling locally only when TELEGRAM_BOT_TOKEN is set; all decision
 * logic sits in handleText/AgentService/ConfirmationService for testability.
 */
/** The command word in "/pause" or "/pause@PacerFinanceBot", lowercased, else null. */
export function slashCommand(text: string): string | null {
  const m = /^\/(\w+)(?:@\w+)?(?:\s|$)/.exec(text);
  return m ? m[1].toLowerCase() : null;
}

/** Slash commands that are just a plain-word intent. */
const SLASH_INTENT: Record<string, Intent> = {
  status: { type: 'status' },
  pause: { type: 'pause' },
  resume: { type: 'resume' },
  withdraw: { type: 'withdraw_all' },
};

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private bot?: Bot;
  private polling = true;

  /** Clean shutdown: stop long polling so SIGTERM exits promptly. */
  async onModuleDestroy(): Promise<void> {
    this.polling = false;
    try {
      await this.bot?.stop();
    } catch {
      /* already stopped */
    }
  }

  constructor(
    private readonly agent: AgentService,
    private readonly confirmations: ConfirmationService,
    private readonly wallets: WalletsService,
    private readonly vaults: VaultsService,
    private readonly history: HistoryService,
    @Optional() private readonly keeper?: KeeperService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() @Inject(APP_CONFIG) private readonly config?: AppConfig,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly toolAgent?: ToolAgentService,
  ) {}

  private awaitingCurrency = new Set<string>();

  /** /start: create (or reload) the wallet, then ask the currency question (§1.3). */
  async handleStart(userId: string): Promise<BotReply> {
    const wallet = await this.wallets.createWallet(userId);
    this.keeper?.registerVault(wallet.ownerPublicKey);
    this.awaitingCurrency.add(userId);
    return { text: `${msg.welcomeWithDeposit(wallet.ownerPublicKey)}\n\n${msg.askCurrency}` };
  }

  /** Adds a one-line reminder of the pending setup step (the address), if any. */
  private withStepReminder(userId: string, text: string): string {
    return this.wallets.getWithdrawalAddress(userId)
      ? text
      : `${text}\n\n${msg.addressReminder}`;
  }

  /** Faucet rate limit: one use per user per 10 minutes. */
  private lastFaucetAt = new Map<string, number>();
  faucetNow: () => number = Date.now;
  static readonly FAUCET_AMOUNT = 10_000_000n;
  static readonly FAUCET_COOLDOWN_MS = 10 * 60 * 1000;

  onModuleInit(): void {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      this.logger.log('TELEGRAM_BOT_TOKEN unset; bot polling disabled');
      return;
    }
    this.bot = new Bot(token);
    this.notifications?.registerSender(async (telegramId, text) => {
      await this.bot!.api.sendMessage(Number(telegramId), text);
    });
    void this.bot.api
      .setMyCommands(BOT_COMMANDS)
      .catch((err: Error) =>
        this.logger.warn(`could not set the command menu: ${err.message}`),
      );
    this.bot.command('balance', async (ctx) => {
      const reply = await this.handleText(String(ctx.from?.id ?? ''), '/balance');
      await ctx.reply(reply.text, { link_preview_options: { is_disabled: true } });
    });
    this.bot.command('deposit', async (ctx) => {
      const reply = await this.handleText(String(ctx.from?.id ?? ''), '/deposit');
      await ctx.reply(reply.text);
    });
    this.bot.command('faucet', async (ctx) => {
      const reply = await this.handleText(String(ctx.from?.id ?? ''), '/faucet');
      await ctx.reply(reply.text);
    });
    this.bot.command('start', async (ctx) => {
      try {
        const reply = await this.handleStart(String(ctx.from?.id ?? ''));
        await ctx.reply(reply.text);
      } catch (err) {
        await ctx.reply(err instanceof UserFacingError ? err.message : msg.txFailed(shortReason(err)));
      }
    });
    this.bot.on('message:text', async (ctx) => {
      let reply: BotReply;
      try {
        reply = await this.handleText(String(ctx.from?.id ?? ''), ctx.message.text);
      } catch (err) {
        reply = { text: err instanceof UserFacingError ? err.message : msg.txFailed(shortReason(err)) };
      }
      if (reply.webApp) {
        const kb = new InlineKeyboard().webApp(reply.webApp.label, reply.webApp.url);
        await ctx.reply(reply.text, { reply_markup: kb });
      } else if (reply.cardId) {
        const kb = new InlineKeyboard()
          .text('✅ Confirm', `confirm:${reply.cardId}`)
          .text('Cancel', `cancel:${reply.cardId}`);
        await ctx.reply(reply.text, { reply_markup: kb });
      } else {
        await ctx.reply(reply.text);
      }
    });
    this.bot.callbackQuery(/^confirm:(.+)$/, async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.reply(
        await this.confirmReply(String(ctx.from?.id ?? ''), ctx.match[1]),
      );
    });
    this.bot.callbackQuery(/^cancel:(.+)$/, async (ctx) => {
      this.confirmations.cancel(String(ctx.from?.id ?? ''), ctx.match[1]);
      await ctx.answerCallbackQuery();
      await ctx.reply(msg.cancelled);
    });
    const bot = this.bot;
    void pollWithBackoff({
      start: () => bot.start(),
      shouldContinue: () => this.polling,
      onConflict: () =>
        this.logger.error(
          'Telegram polling conflict (409): another Pacer instance is already polling; retrying with backoff',
        ),
      onError: (message) =>
        this.logger.error(`Telegram polling failed: ${message}; retrying with backoff`),
    });
  }

  /**
   * Runs a confirmed card and turns the outcome into the reply text.
   * A real failure is reported as one (bot-messages §11.2), never hidden
   * behind "nothing to confirm".
   */
  async confirmReply(userId: string, cardId: string): Promise<string> {
    try {
      const { result, reply } = await this.confirmations.confirmWithReply(userId, cardId);
      return reply ?? msg.confirmed(explorerTx(result));
    } catch (err) {
      if (err instanceof NoPendingConfirmation)
        return msg.cardExpired;
      if (err instanceof UserFacingError) return err.message;
      this.logger.warn(`confirmed action failed: ${(err as Error).message}`);
      return msg.txFailed(shortReason(err));
    }
  }

  /** Testable core: text in, reply out. Signing only via confirm(). */
  async handleText(userId: string, text: string): Promise<BotReply> {
    const trimmed = text.trim();
    // /pause, /resume, /withdraw and /status are the same flows as the plain
    // words, taken straight to the intent (no model call), Confirm card included.
    const cmd = slashCommand(trimmed);
    if (cmd === 'help') return { text: msg.help };
    if (cmd === 'about') return { text: msg.about };
    if (trimmed === '/faucet') {
      const cluster = this.config?.cluster ?? process.env.SOLANA_CLUSTER ?? 'devnet';
      if (cluster !== 'devnet') return { text: msg.faucetWrongCluster };
      const now = this.faucetNow();
      // Fail closed: when the durable rate-limit store is configured but
      // cannot be read, refuse instead of minting unlimited test money.
      let last = this.lastFaucetAt.get(userId) ?? 0;
      if (this.prisma?.enabled) {
        let row: { sentAt: Date } | null;
        try {
          row = await this.prisma.nudgeLog.findFirst({
            where: { telegramId: userId, kind: 'faucet' },
            orderBy: { sentAt: 'desc' },
          });
        } catch {
          return { text: msg.faucetStoreUnavailable };
        }
        if (row) last = Math.max(last, row.sentAt.getTime());
      }
      const elapsed = now - last;
      if (elapsed < BotService.FAUCET_COOLDOWN_MS) {
        const mins = Math.ceil((BotService.FAUCET_COOLDOWN_MS - elapsed) / 60_000);
        return { text: msg.faucetRateLimited(mins) };
      }
      const owner = (await this.wallets.createWallet(userId)).ownerPublicKey;
      await this.vaults.faucet(owner, BotService.FAUCET_AMOUNT);
      this.lastFaucetAt.set(userId, now);
      if (this.prisma?.enabled) {
        await this.prisma.nudgeLog
          .create({ data: { telegramId: userId, kind: 'faucet' } })
          .catch(() => undefined);
      }
      return { text: msg.faucet };
    }
    if (/^\/balance\b/i.test(trimmed)) {
      const owner = (await this.wallets.createWallet(userId)).ownerPublicKey;
      const cluster = process.env.SOLANA_CLUSTER ?? 'devnet';
      const settings = this.wallets.getSettings(userId);
      const rate = this.history.latestNgnPerUsd();
      const money = (usd: number) => formatMoney(usd, settings.displayCurrency, rate);
      const pending = Number(await this.vaults.pendingDeposit(owner)) / 1_000_000;
      const v = await this.vaults.valuation(owner);
      const lines =
        !v || v.holdings.length === 0
          ? '• Nothing in the vault yet'
          : v.holdings
              .map((h) =>
                h.mint === 'USDC'
                  ? `• USDC waiting to be invested: ${h.uiAmount}`
                  : `• ${h.mint}: ${h.uiAmount} — ${h.priced ? money(h.valueUsd) : 'price unavailable'}`,
              )
              .join('\n');
      const total =
        !v || v.holdings.some((h) => !h.priced) ? 'price unavailable' : money(v.totalUsd);
      return {
        text: msg.balanceReport({
          depositUsdc: String(pending),
          depositUrl: explorerAddress(owner, cluster),
          pendingNote: pending > 0,
          lines,
          total: v ? total : money(0),
          vaultUrl: explorerAddress(this.vaults.vaultAddress(owner), cluster),
        }),
      };
    }
    if (/^\/deposit\b/i.test(trimmed)) {
      const owner = (await this.wallets.createWallet(userId)).ownerPublicKey;
      return { text: msg.depositAddressInfo(owner) };
    }
    if (SOLANA_ADDRESS.test(trimmed)) {
      await this.wallets.createWallet(userId);
      const current = this.wallets.getWithdrawalAddress(userId);
      if (current) return { text: msg.addressAlreadySet(shortAddress(current)) };
      const card = this.confirmations.propose(userId, {
        kind: 'set_withdrawal_address',
        summary: msg.confirmAddressCard(shortAddress(trimmed)),
        execute: async () => {
          await this.wallets.setWithdrawalAddress(userId, trimmed);
          return trimmed;
        },
        done: () => msg.askPace,
      });
      return { text: card.text, cardId: card.id };
    }
    if (/^buy alerts? (on|off)$/i.test(trimmed)) {
      const on = /on$/i.test(trimmed);
      await this.wallets.setNotifyBuys(userId, on);
      return { text: on ? msg.buyAlertsOn : msg.buyAlertsOff };
    }
    const earlyIntent = this.agent.parseDeterministicIntent(trimmed);
    if (
      this.awaitingCurrency.has(userId) &&
      !(cmd && cmd in SLASH_INTENT) &&
      earlyIntent.type !== 'greeting' &&
      earlyIntent.type !== 'faq'
    ) {
      const answer = parseDisplayCurrency(trimmed);
      if (answer.kind === 'unsupported')
        return { text: msg.currencyUnsupported(answer.name) };
      if (answer.kind === 'unclear') return { text: msg.currencyUnclear };
      const currency = answer.currency;
      this.awaitingCurrency.delete(userId);
      await this.wallets.setDisplayCurrency(userId, currency);
      return {
        text: `${msg.currencySaved(currency === 'NGN' ? 'naira' : 'US dollars')}\n\n${msg.askWithdrawalAddress}`,
      };
    }
    const owner = (await this.wallets.createWallet(userId)).ownerPublicKey;
    const ctx = await this.buildToolContext(userId, owner);
    // /pause, /resume, /withdraw and /status are the same tools as the plain
    // words, called directly (no model), Confirm card included.
    if (cmd && SLASH_INTENT[cmd]) {
      const call = intentToToolCall(SLASH_INTENT[cmd]);
      return (await executeTool(call.name, call.args, ctx)).reply;
    }
    // At the address step, questions get FAQ answers (with the reminder)
    // and anything unrecognised gets step-specific help, model or not.
    if (ctx.step.awaiting === 'withdrawal_address') {
      if (earlyIntent.type === 'faq' || earlyIntent.type === 'greeting') {
        const call = intentToToolCall(earlyIntent);
        return (await executeTool(call.name, call.args, ctx)).reply;
      }
    }
    if (this.toolAgent) {
      const r = await this.toolAgent.handle({
        text,
        userId,
        step: ctx.step,
        ctx,
      });
      return r.reply;
    }
    const intent = await this.agent.parseIntent(text, userId);
    const call = intentToToolCall(intent);
    const outcome = await executeTool(call.name, call.args, ctx);
    return outcome.reply;
  }

  private async buildToolContext(
    userId: string,
    owner: string,
  ): Promise<ToolContext> {
    const hasVault = (await this.vaults.getVault(owner)) !== null;
    return {
      userId,
      owner,
      step: {
        // The pending step is derived, so nothing is lost on a restart.
        awaiting: this.awaitingCurrency.has(userId)
          ? 'currency'
          : this.wallets.getWithdrawalAddress(userId)
            ? null
            : 'withdrawal_address',
        hasVault,
      },
      wallets: this.wallets,
      vaults: this.vaults,
      history: this.history,
      confirmations: this.confirmations,
      keeper: this.keeper,
      config: this.config,
      source: () => this.agent.lastIntentSource(userId),
    };
  }
}
