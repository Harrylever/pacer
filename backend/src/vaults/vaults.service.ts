import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { AppConfig } from '../config/app-config';
import { APP_CONFIG } from '../config/config.module';
import type { SignerRole, VaultClient } from '../solana/vault-client';
import { toUiAmount } from '../common/money';
import { UserFacingError } from '../common/errors';
import { createHash } from 'node:crypto';
import {
  canonicalIntentJson,
  type Intent,
} from '../agent/intent.schema';
// A value import, not `import type`: Nest injects by the emitted constructor
// type, and a type-only import erases it, so Prisma would silently be undefined.
import { PrismaService } from '../prisma/prisma.service';

export const VAULT_CLIENT = 'VAULT_CLIENT';

export type StockSymbol = 'SPYx' | 'AAPLx' | 'NVDAx';

/** The vault's rules, read live from the chain (Mini App B2). */
export interface VaultRules {
  address: string;
  explorerUrl: string;
  withdrawalAddress: string;
  paceUsdPerPeriod: number;
  periodSeconds: number;
  stocks: StockSymbol[];
  paused: boolean;
}

export interface RecentBuy {
  symbol: StockSymbol;
  usdcIn: number;
  at: string;
}

/** Chain mints arrive as SPYx (or SPY in the fake); anything else is not a stock we show. */
export function toStockSymbol(mint: string): StockSymbol | null {
  switch (mint.toUpperCase().replace(/-DEV$/, '')) {
    case 'SPY':
    case 'SPYX':
      return 'SPYx';
    case 'AAPL':
    case 'AAPLX':
      return 'AAPLx';
    case 'NVDA':
    case 'NVDAX':
      return 'NVDAx';
    default:
      return null;
  }
}

export interface Holding {
  mint: string;
  raw: bigint;
  uiAmount: number;
  decimals?: number;
}

export interface WithdrawPlan {
  destination: string;
  legs: { mint: string; amount: bigint }[];
}

@Injectable()
export class VaultsService {
  private readonly logger = new Logger(VaultsService.name);

  constructor(
    @Inject(VAULT_CLIENT) private readonly client: VaultClient,
    @Optional() @Inject(APP_CONFIG) private readonly config?: AppConfig,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  /**
   * The rules the agent can't break, read live from Solana (never the DB).
   * Null when there is no vault yet — and also null, with a log line, when
   * the chain read fails: an RPC error must never become a guessed rule.
   */
  async vaultRules(owner: string): Promise<VaultRules | null> {
    let vault;
    try {
      vault = await this.client.getVault(owner);
    } catch (err) {
      this.logger.warn(
        `vault rules unavailable (chain read failed): ${(err as Error).message}`,
      );
      return null;
    }
    if (!vault) return null;
    let periodSeconds = this.config?.periodSeconds ?? 86_400;
    try {
      periodSeconds = (await this.client.getConfig()).periodSeconds;
    } catch (err) {
      this.logger.warn(
        `chain config unavailable, using env period: ${(err as Error).message}`,
      );
    }
    const address = this.client.getVaultAddress(owner);
    return {
      address,
      explorerUrl: `https://explorer.solana.com/address/${address}?cluster=devnet`,
      withdrawalAddress: vault.withdrawalDestination,
      paceUsdPerPeriod: Number(vault.ratePerPeriod) / 1_000_000,
      periodSeconds,
      stocks: vault.chosenMints
        .map(toStockSymbol)
        .filter((s): s is StockSymbol => s !== null),
      paused: vault.paused,
    };
  }

  /** Newest buys first, at most 5, from BuyRecord. Empty without a DB. */
  async recentBuys(owner: string): Promise<RecentBuy[]> {
    if (!this.prisma?.enabled) return [];
    const rows = await this.prisma.buyRecord.findMany({
      where: { owner },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const out: RecentBuy[] = [];
    for (const r of rows) {
      const symbol = toStockSymbol(r.mint);
      if (!symbol) continue;
      out.push({
        symbol,
        usdcIn: Number(r.usdcIn) / 1_000_000,
        at: (r.createdAt instanceof Date
          ? r.createdAt
          : new Date(r.createdAt)
        ).toISOString(),
      });
    }
    return out;
  }

  /** Move any deposit-wallet USDC into the vault. Idempotent; retry-flagged. */
  async sweepDeposits(
    owner: string,
  ): Promise<{ sweptMicroUsdc: bigint; needsRetry: boolean; signature?: string }> {
    const balance = await this.client.getDepositWalletBalance(owner);
    if (balance === 0n) return { sweptMicroUsdc: 0n, needsRetry: false };
    try {
      const signature = await this.client.deposit({ owner, amount: balance });
      return { sweptMicroUsdc: balance, needsRetry: false, signature };
    } catch (err) {
      this.logger.warn(`deposit sweep failed: ${(err as Error).message}`);
      return { sweptMicroUsdc: 0n, needsRetry: true };
    }
  }

  /** Devnet faucet: mint USDC-dev to the deposit wallet (swept next tick). */
  async faucet(owner: string, amountMicroUsdc: bigint): Promise<string> {
    return this.client.faucet(owner, amountMicroUsdc);
  }

  /** The vault's own on-chain address, for explorer links. */
  vaultAddress(owner: string): string {
    return this.client.getVaultAddress(owner);
  }

  /** USDC still sitting in the deposit wallet, waiting to be swept. */
  async pendingDeposit(owner: string): Promise<bigint> {
    return this.client.getDepositWalletBalance(owner);
  }

  /** Current vault state, or null when no vault exists yet. */
  async getVault(owner: string) {
    return this.client.getVault(owner);
  }

  /**
   * Holdings valued in USD. USDC is worth its UI amount; a stock is worth
   * raw x price (price_micro_usdc is per whole raw token). A stock with no
   * fresh price is valued at 0 and flagged, never guessed.
   */
  async valuation(owner: string): Promise<{
    holdings: (Holding & { valueUsd: number; priced: boolean })[];
    totalUsd: number;
    investedUsd: number;
    waitingUsdc: number;
    paused: boolean;
    ratePerPeriod: bigint;
  } | null> {
    const vault = await this.client.getVault(owner);
    if (!vault) return null;
    const holdings: (Holding & { valueUsd: number; priced: boolean })[] = [];
    let totalUsd = 0;
    let waitingUsdc = 0;
    for (const h of await this.holdings(owner)) {
      if (h.mint === 'USDC') {
        holdings.push({ ...h, valueUsd: h.uiAmount, priced: true });
        totalUsd += h.uiAmount;
        waitingUsdc = h.uiAmount;
        continue;
      }
      const price = await this.client.getPrice(h.mint);
      const maxAge = this.config?.maxPriceAgeSecs ?? 600;
      const stale =
        !price || Math.floor(Date.now() / 1000) - price.updatedAt > maxAge;
      if (!price || stale) {
        // Missing or stale price: unavailable, never valued at a last guess.
        holdings.push({ ...h, valueUsd: 0, priced: false });
        continue;
      }
      const valueUsd = (Number(h.raw) / 10 ** (h.decimals ?? 8)) * (Number(price.priceMicroUsdc) / 1_000_000);
      holdings.push({ ...h, valueUsd, priced: true });
      totalUsd += valueUsd;
    }
    return {
      holdings,
      totalUsd,
      investedUsd: Number(vault.totalInvested) / 1_000_000,
      waitingUsdc,
      paused: vault.paused,
      ratePerPeriod: vault.ratePerPeriod,
    };
  }

  /**
   * Everything the vault holds, including stocks the user no longer chooses.
   * A stock with unknown decimals is left out of the display rather than
   * shown with assumed decimals (8 vs 6 would be a 100x error).
   */
  async holdings(owner: string): Promise<Holding[]> {
    const vault = await this.client.getVault(owner);
    if (!vault) return [];
    const out: Holding[] = [];
    for (const { mint, amount: raw } of await this.client.listVaultBalances(owner)) {
      const meta = await this.client.getMintMeta(mint);
      const decimals = meta?.decimals ?? (mint === 'USDC' ? 6 : undefined);
      if (decimals === undefined) continue;
      out.push({ mint, raw, uiAmount: toUiAmount(raw, decimals, meta?.multiplier ?? 1), decimals });
    }
    return out;
  }

  /**
   * Confirmed plan from the bot: creates the vault on first plan
   * (create_vault), otherwise updates it (set_rules). The daily NGN
   * amount converts to a micro-USDC rate at the given parallel rate.
   */
  async applyPlan(
    owner: string,
    args: {
      dailyNgn: number;
      ngnPerUsd: number;
      assets: string[];
      withdrawalDestination: string;
    },
  ): Promise<{ signature: string; created: boolean; ratePerPeriod: bigint }> {
    if (!(args.ngnPerUsd > 0)) throw new Error('invalid NGN/USD rate');
    const ratePerPeriod = BigInt(
      Math.round((args.dailyNgn / args.ngnPerUsd) * 1_000_000),
    );
    if (ratePerPeriod <= 0n) throw new Error('daily amount rounds to zero');
    const existing = await this.client.getVault(owner);
    if (!existing) {
      const signature = await this.client.createVault({
        owner,
        withdrawalDestination: args.withdrawalDestination,
        ratePerPeriod,
        mints: args.assets,
      });
      return { signature, created: true, ratePerPeriod };
    }
    const signature = await this.client.setRules({
      owner,
      ratePerPeriod,
      mints: args.assets,
      paused: existing.paused,
    });
    return { signature, created: false, ratePerPeriod };
  }

  /**
   * Records a confirmed intent on chain (keeper-signed, audit only).
   * Best-effort by design: a failure here must never fail the plan.
   */
  async recordIntent(
    owner: string,
    intent: Intent,
    modelId: Uint8Array,
  ): Promise<string | null> {
    try {
      const hash = createHash('sha256')
        .update(canonicalIntentJson(intent))
        .digest();
      return await this.client.recordIntent(
        owner,
        new Uint8Array(hash),
        modelId,
      );
    } catch (err) {
      this.logger.warn(
        `record_intent failed (plan unaffected): ${(err as Error).message}`,
      );
      return null;
    }
  }

  async pause(owner: string): Promise<string> {
    return this.setPaused(owner, true);
  }

  async resume(owner: string): Promise<string> {
    return this.setPaused(owner, false);
  }

  private async setPaused(owner: string, paused: boolean): Promise<string> {
    const vault = await this.client.getVault(owner);
    if (!vault) throw new Error('vault not found');
    return this.client.setRules({
      owner,
      ratePerPeriod: vault.ratePerPeriod,
      mints: vault.chosenMints,
      paused,
    });
  }

  /**
   * Withdraw everything: pauses the plan (so the keeper stops buying), then
   * sends every held mint to the fixed withdrawal_destination in ONE
   * transaction. Owner only; any other role is refused before any call.
   */
  async executeWithdrawAll(
    owner: string,
    role: SignerRole = 'owner',
  ): Promise<{ destination: string; signature: string | null; legs: WithdrawPlan['legs'] }> {
    const plan = await this.buildWithdrawAll(owner, role);
    if (plan.legs.length === 0) return { destination: plan.destination, signature: null, legs: [] };
    const vault = await this.client.getVault(owner);
    const wasRunning = Boolean(vault && !vault.paused);
    if (wasRunning) await this.setPaused(owner, true);
    try {
      const signature = await this.client.withdrawAllAsOwner({ owner, legs: plan.legs });
      return { destination: plan.destination, signature, legs: plan.legs };
    } catch (err) {
      // A failed withdrawal must not strand the plan paused: resume it,
      // then surface a plain "didn't go through, nothing was lost" error.
      if (wasRunning) {
        try {
          await this.setPaused(owner, false);
        } catch {
          this.logger.warn(`could not resume vault after failed withdrawal for ${owner}`);
        }
      }
      throw new UserFacingError(
        "Your withdrawal didn't go through, and nothing was lost. Your money is still in your vault.",
        { cause: err },
      );
    }
  }

  /**
   * Builds the withdraw-everything plan: one leg per held mint (including
   * mints no longer chosen), destination fixed to the vault's
   * withdrawal_destination. Owner identity only.
   */
  async buildWithdrawAll(
    owner: string,
    role: SignerRole = 'owner',
  ): Promise<WithdrawPlan> {
    if (role !== 'owner')
      throw new Error('withdrawals require the owner signer');
    const vault = await this.client.getVault(owner);
    if (!vault) throw new Error('vault not found');
    const legs = await this.client.listVaultBalances(owner);
    return { destination: vault.withdrawalDestination, legs };
  }
}
