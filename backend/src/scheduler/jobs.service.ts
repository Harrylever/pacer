import { Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { KeeperService } from './keeper.service';
import { VaultsService } from '../vaults/vaults.service';
import { PricesService } from '../prices/prices.service';
import { WalletsService } from '../wallets/wallets.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HistoryService } from '../history/history.service';
import { explorerAddress, explorerTx, msg } from '../bot/messages';
import { formatMoney } from '../common/money';
import type { PrismaService } from '../prisma/prisma.service';

/** Price refresh cadence: every 2 minutes (brief: at least every 4). */
export const PRICE_REFRESH_CRON = '0 */2 * * * *';

function periodKey(cadence: 'weekly' | 'monthly', now: Date): string {
  if (cadence === 'monthly')
    return `M${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const day = Math.floor(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) -
      Date.UTC(now.getFullYear(), 0, 0)) /
      86_400_000,
  );
  return `W${now.getFullYear()}-${Math.ceil(day / 7)}`;
}

/**
 * Background jobs for the never-cut demo path:
 * - deposit watcher every 30 s (SPEC): moves USDC into each vault and
 *   notifies §3.2-3.4 (arrived / in your vault / failed, once per deposit);
 * - price updater every 2 minutes so keeper freshness checks pass.
 * A failed notification never breaks a sweep (NotificationsService
 * swallows send errors, and notify calls are additionally guarded).
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsService.name);
  private sweeping = false;
  private pricing = false;
  /** Per-owner notice state for the deposit currently being swept. */
  private depositNotice = new Map<
    string,
    { amount: bigint; arrivedSent: boolean; failedSent: boolean }
  >();

  constructor(
    private readonly keeper: KeeperService,
    private readonly vaults: VaultsService,
    private readonly prices: PricesService,
    private readonly wallets: WalletsService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly history?: HistoryService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /** Summary dedupe for in-memory mode; the durable record is NudgeLog. */
  private sentSummaries = new Set<string>();

  /** The keeper's vault list is in memory; rebuild it from saved wallets on startup. */
  onApplicationBootstrap(): void {
    for (const owner of this.wallets.allOwners()) this.keeper.registerVault(owner);
    // Fresh prices within one refresh cycle of boot (round 3, task 6):
    // refresh immediately, then on the 2-minute cron.
    void this.refreshPrices();
  }

  private async notify(telegramId: string | undefined, text: string): Promise<void> {
    if (!telegramId || !this.notifications) return;
    try {
      await this.notifications.send(telegramId, text);
    } catch {
      // NotificationsService already swallows; belt and braces.
    }
  }

  @Cron('*/30 * * * * *')
  async sweepAll(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      for (const owner of this.keeper.registeredVaults()) {
        try {
          await this.sweepOne(owner);
        } catch (err) {
          this.logger.warn(`deposit sweep failed: ${(err as Error).message}`);
        }
      }
    } finally {
      this.sweeping = false;
    }
  }

  private async sweepOne(owner: string): Promise<void> {
    const pending = await this.vaults.pendingDeposit(owner);
    if (pending === 0n) return;
    const telegramId = this.wallets.telegramIdByOwner(owner);
    const settings = telegramId ? this.wallets.getSettings(telegramId) : undefined;
    const rate = this.history?.latestNgnPerUsd() ?? 0;
    const display = formatMoney(
      Number(pending) / 1_000_000,
      settings?.displayCurrency ?? 'NGN',
      rate,
    );
    let notice = this.depositNotice.get(owner);
    if (!notice || notice.amount !== pending) {
      notice = { amount: pending, arrivedSent: false, failedSent: false };
      this.depositNotice.set(owner, notice);
    }
    if (!notice.arrivedSent) {
      await this.notify(telegramId, msg.depositArrived(display));
      notice.arrivedSent = true;
    }
    const r = await this.vaults.sweepDeposits(owner);
    if (!r.needsRetry && r.sweptMicroUsdc > 0n) {
      await this.notify(
        telegramId,
        msg.depositInVault({ display, url: explorerTx(r.signature ?? '') }),
      );
      this.depositNotice.delete(owner);
    } else if (r.needsRetry) {
      this.logger.warn('deposit sweep failed for a vault; retrying next tick');
      if (!notice.failedSent) {
        await this.notify(telegramId, msg.depositFailed(display));
        notice.failedSent = true;
      }
    }
  }

  /**
   * Weekly summary (§8). Monthly users are due only in the first week of
   * a month. Never sent to an empty, inactive vault, never sent twice for
   * the same period (NudgeLog when a DB is configured, in-memory otherwise),
   * and deliberately carries no performance figures.
   */
  @Cron(process.env.SUMMARY_CRON ?? '0 9 * * 1')
  async summaryCron(): Promise<void> {
    await this.sendSummaries(new Date());
  }

  async sendSummaries(now: Date): Promise<void> {
    const rate = this.history?.latestNgnPerUsd() ?? 0;
    const weekAgoSeconds = Math.floor(now.getTime() / 1000) - 7 * 86_400;
    for (const user of this.wallets.listUsers()) {
      try {
        const { telegramId, ownerPublicKey: owner, settings } = user;
        if (settings.summaryCadence === 'monthly' && now.getDate() > 7)
          continue;
        const kind = `summary:${periodKey(settings.summaryCadence, now)}`;
        if (this.sentSummaries.has(`${telegramId}:${kind}`)) continue;
        if (this.prisma?.enabled) {
          const already = await this.prisma.nudgeLog.findFirst({
            where: { telegramId, kind },
          });
          if (already) continue;
        }
        const v = await this.vaults.valuation(owner);
        if (!v) continue;
        if (v.investedUsd === 0 && v.holdings.length === 0) continue;
        const money = (usd: number) =>
          formatMoney(usd, settings.displayCurrency, rate);
        let text: string;
        if (v.paused) {
          text = msg.weeklyPaused;
        } else if (v.waitingUsdc === 0 && v.investedUsd > 0) {
          text = msg.weeklyOutOfUsdc(owner);
        } else {
          const buys = await this.keeper.buysSince(owner, weekAgoSeconds);
          const savedWeek =
            Number(buys.reduce((a, b) => a + b.usdcIn, 0n)) / 1_000_000;
          text = msg.weeklySummary({
            week: money(savedWeek),
            buys:
              buys.length === 0
                ? 'none yet'
                : `${buys.length} (${[...new Set(buys.map((b) => b.mint))].join(', ')})`,
            total: money(v.investedUsd),
            vaultUrl: explorerAddress(
              this.vaults.vaultAddress(owner),
              process.env.SOLANA_CLUSTER ?? 'devnet',
            ),
          });
        }
        const sent = this.notifications
          ? await this.notifications.send(telegramId, text)
          : false;
        if (!sent) continue;
        this.sentSummaries.add(`${telegramId}:${kind}`);
        if (this.prisma?.enabled) {
          await this.prisma.nudgeLog
            .create({ data: { telegramId, kind } })
            .catch(() => undefined);
        }
      } catch (err) {
        this.logger.warn(`weekly summary failed: ${(err as Error).message}`);
      }
    }
  }

  @Cron(PRICE_REFRESH_CRON)
  async refreshPrices(): Promise<void> {
    if (this.pricing) return;
    this.pricing = true;
    try {
      const r = await this.prices.refreshPrices();
      if (r.kept.length) this.logger.warn(`price fetch missed ${r.kept.length} mint(s); kept last good price`);
    } catch (err) {
      this.logger.warn(`price refresh failed: ${(err as Error).message}`);
    } finally {
      this.pricing = false;
    }
  }
}
