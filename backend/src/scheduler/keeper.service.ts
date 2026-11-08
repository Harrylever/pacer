import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { VaultClient } from '../solana/vault-client';
import { VAULT_CLIENT } from '../vaults/vaults.service';
import { slippageFloor } from '../common/money';
import { settledAllowance } from '../common/pace';
import type { AppConfig } from '../config/app-config';
import { APP_CONFIG } from '../config/config.module';
import {
  KEEPER_SKIP_ERRORS,
  VaultProgramError,
} from '../solana/anchor-vault-client';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletsService } from '../wallets/wallets.service';
import { HistoryService } from '../history/history.service';
import { explorerTx, msg } from '../bot/messages';
import type { PrismaService } from '../prisma/prisma.service';
import { formatMoney, toUiAmount } from '../common/money';

export interface KeeperBuy {
  owner: string;
  mint: string;
  usdcIn: bigint;
  minOut: bigint;
  /** Stock actually received (vault balance delta), not the min_out floor. */
  outRaw?: bigint;
  signature: string;
}

/**
 * Keeper trigger only — all limits are enforced by the program.
 *
 * - Reads the *settled* allowance (off-chain mirror of `settle`), because the
 *   stored on-chain field only grows inside `buy`/`set_rules`.
 * - Splits equally across chosen mints when each share clears min_trade;
 *   otherwise buys one mint this time, rotating, so small paces still buy
 *   instead of sending legs the program would reject (`usdc_in < min_trade`).
 * - Skips a mint with no price, a stale price, unknown mint decimals, or a
 *   slippage floor of 0 — never `min_out = 0`, never assumed decimals.
 * - Ticks never overlap. Skips are silent to the user (bot-messages §11.3).
 */
@Injectable()
export class KeeperService {
  private readonly logger = new Logger(KeeperService.name);
  private owners = new Set<string>();
  private rotation = new Map<string, number>();
  private running = false;
  private alerted = new Set<string>();

  constructor(
    @Inject(VAULT_CLIENT) private readonly client: VaultClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly wallets?: WalletsService,
    @Optional() private readonly history?: HistoryService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /** Buys made by this process, for the weekly summary's "this week" figures. */
  buyLog: { owner: string; mint: string; usdcIn: bigint; atSeconds: number }[] =
    [];

  /** Buys since a time: BuyRecord table when a DB is configured (survives restarts), process memory otherwise. */
  async buysSince(
    owner: string,
    sinceSeconds: number,
  ): Promise<{ mint: string; usdcIn: bigint }[]> {
    if (this.prisma?.enabled) {
      const rows = await this.prisma.buyRecord.findMany({
        where: { owner, createdAt: { gte: new Date(sinceSeconds * 1000) } },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((r) => ({ mint: r.mint, usdcIn: BigInt(r.usdcIn) }));
    }
    return this.buyLog
      .filter((b) => b.owner === owner && b.atSeconds >= sinceSeconds)
      .map(({ mint, usdcIn }) => ({ mint, usdcIn }));
  }

  registerVault(owner: string): void {
    this.owners.add(owner);
  }

  registeredVaults(): string[] {
    return [...this.owners];
  }

  async tick(now = Math.floor(Date.now() / 1000)): Promise<{ buys: KeeperBuy[] }> {
    if (this.running) return { buys: [] };
    this.running = true;
    const buys: KeeperBuy[] = [];
    try {
      for (const owner of this.owners) {
        try {
          buys.push(...(await this.tickVault(owner, now)));
          // A successful tick re-arms the once-per-incident alert.
          for (const key of [...this.alerted]) {
            if (key.startsWith(`${owner}:`)) this.alerted.delete(key);
          }
        } catch (err) {
          if (
            err instanceof VaultProgramError &&
            KEEPER_SKIP_ERRORS.has(err.errorName)
          ) {
            // Expected rejection (stale price, paused, ...): quiet skip.
            this.logger.log(
              `keeper skipped a vault: ${err.errorName}`,
            );
          } else if (err instanceof VaultProgramError) {
            const key = `${owner}:${err.errorName}`;
            if (!this.alerted.has(key)) {
              this.alerted.add(key);
              this.logger.error(
                `keeper unexpected program error: ${err.errorName}`,
              );
            }
          } else {
            this.logger.warn(
              `keeper tick skipped for a vault: ${(err as Error).message}`,
            );
          }
        }
      }
      await this.notifyBuys(buys);
    } finally {
      this.running = false;
    }
    return { buys };
  }

  private async tickVault(owner: string, now: number): Promise<KeeperBuy[]> {
    const vault = await this.client.getVault(owner);
    if (!vault || vault.paused || vault.chosenMints.length === 0) return [];
    const minTrade = this.config.minTradeMicroUsdc;
    const allowance = settledAllowance(vault, now, this.config.periodSeconds, minTrade);
    if (allowance < minTrade) return [];

    const n = BigInt(vault.chosenMints.length);
    let legs: { mint: string; usdcIn: bigint }[];
    if (allowance / n >= minTrade) {
      legs = vault.chosenMints.map((mint) => ({ mint, usdcIn: allowance / n }));
    } else {
      const i = this.rotation.get(owner) ?? 0;
      this.rotation.set(owner, i + 1);
      legs = [{ mint: vault.chosenMints[i % vault.chosenMints.length], usdcIn: allowance }];
    }

    const out: KeeperBuy[] = [];
    for (const { mint, usdcIn } of legs) {
      const price = await this.client.getPrice(mint);
      if (!price || now - price.updatedAt > this.config.maxPriceAgeSecs) continue;
      const meta = await this.client.getMintMeta(mint);
      if (!meta) {
        this.logger.warn(`keeper: no mint metadata for ${mint}; skipping (never assume decimals)`);
        continue;
      }
      const minOut = slippageFloor({
        usdcIn,
        priceMicroUsdc: price.priceMicroUsdc,
        stockDecimals: meta.decimals,
        maxSlippageBps: this.config.maxSlippageBps,
      });
      if (minOut === 0n) continue; // floor-0 quote: refuse, never min_out=0
      const before = await this.client
        .getVaultBalance(owner, mint)
        .catch(() => null);
      const signature = await this.client.buyAsKeeper({ owner, mint, usdcIn, minOut });
      const after = await this.client
        .getVaultBalance(owner, mint)
        .catch(() => null);
      // Actual amount only when both reads succeeded; otherwise the buy
      // alert for this owner is skipped rather than reporting min_out.
      const outRaw =
        before !== null && after !== null && after > before
          ? after - before
          : undefined;
      this.buyLog.push({ owner, mint, usdcIn, atSeconds: now });
      if (this.prisma?.enabled) {
        await this.prisma.buyRecord
          .create({ data: { owner, mint, usdcIn: usdcIn.toString() } })
          .catch((err: Error) =>
            this.logger.warn(`buy record failed: ${err.message}`),
          );
      }
      out.push({ owner, mint, usdcIn, minOut, outRaw, signature });
    }
    return out;
  }

  /** Buy alerts (§4): one message per owner, split buys in a single message. Only when notifyBuys is on. */
  private async notifyBuys(buys: KeeperBuy[]): Promise<void> {
    if (!this.notifications || !this.wallets || buys.length === 0) return;
    const byOwner = new Map<string, KeeperBuy[]>();
    for (const b of buys) byOwner.set(b.owner, [...(byOwner.get(b.owner) ?? []), b]);
    for (const [owner, legs] of byOwner) {
      try {
        const telegramId = this.wallets.telegramIdByOwner(owner);
        if (!telegramId) continue;
        const settings = this.wallets.getSettings(telegramId);
        if (!settings.notifyBuys) continue;
        if (legs.some((b) => b.outRaw === undefined)) {
          this.logger.warn(
            'buy alert skipped: bought amount unreadable for a vault',
          );
          continue;
        }
        const rate = this.history?.latestNgnPerUsd() ?? 0;
        const rendered = [];
        for (const b of legs) {
          const meta = await this.client.getMintMeta(b.mint);
          rendered.push({
            ui: meta ? String(toUiAmount(b.outRaw ?? b.minOut, meta.decimals, meta.multiplier)) : String(b.outRaw ?? b.minOut),
            symbol: b.mint,
            display: formatMoney(Number(b.usdcIn) / 1_000_000, settings.displayCurrency, rate),
            url: explorerTx(b.signature),
          });
        }
        const text = rendered.length === 1 ? msg.bought(rendered[0]) : msg.buysSplit(rendered);
        await this.notifications.send(telegramId, text);
      } catch (err) {
        this.logger.warn(`buy notification failed: ${(err as Error).message}`);
      }
    }
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async scheduledTick(): Promise<void> {
    await this.tick();
  }
}
