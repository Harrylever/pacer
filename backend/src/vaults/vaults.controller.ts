import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Logger,
  NotFoundException,
  Optional,
  Param,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { VaultsService } from './vaults.service';
import { WalletsService } from '../wallets/wallets.service';
import { HistoryService } from '../history/history.service';
import { verifyTelegramInitData } from '../common/telegram-init-data';

type HoldingSymbol = 'USDC' | 'SPYx' | 'AAPLx' | 'NVDAx';

/** Short holdings cache: the Mini App polls this; 5 s absorbs bursts. */
export const HOLDINGS_CACHE_TTL_MS = 5_000;

@Controller('vaults')
export class VaultsController {
  private readonly logger = new Logger(VaultsController.name);
  private readonly holdingsCache = new Map<
    string,
    { expiresAt: number; value: unknown }
  >();

  constructor(
    private readonly vaults: VaultsService,
    private readonly wallets: WalletsService,
    @Optional() private readonly history?: HistoryService,
  ) {}

  private verifiedUser(initData?: string): string {
    const verified = verifyTelegramInitData(
      initData,
      process.env.TELEGRAM_BOT_TOKEN,
    );
    if (!verified) throw new UnauthorizedException('invalid initData');
    return verified.userId;
  }

  private ownerFor(userId: string): string {
    const owner = this.wallets.ownerForTelegram(userId);
    if (!owner) throw new NotFoundException('no wallet for this user');
    return owner;
  }

  /**
   * Mini App holdings: `me` is the Telegram user in verified initData.
   * Declared before `:owner/holdings` so `me` is never read as an owner.
   * Unpriced lines carry valueUsd null and make the total null — never a guess.
   */
  @Get('me/holdings')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async myHoldings(@Headers('x-telegram-init-data') initData?: string) {
    const startedAt = Date.now();
    // Request log: user id and timings only — never the initData itself.
    let userId = 'unknown';
    try {
      userId = this.verifiedUser(initData);
      const cached = this.holdingsCache.get(userId);
      if (cached && cached.expiresAt > Date.now()) {
        this.logger.log(
          `GET /vaults/me/holdings user=${userId} cache=hit durationMs=${Date.now() - startedAt}`,
        );
        return cached.value as Awaited<ReturnType<VaultsController['computeHoldings']>>;
      }
      const result = await this.computeHoldings(userId);
      this.holdingsCache.set(userId, {
        expiresAt: Date.now() + HOLDINGS_CACHE_TTL_MS,
        value: result,
      });
      this.logger.log(
        `GET /vaults/me/holdings user=${userId} cache=miss holdings=${result.holdings.length} durationMs=${Date.now() - startedAt}`,
      );
      return result;
    } catch (err) {
      this.logger.warn(
        `GET /vaults/me/holdings user=${userId} error=${(err as Error).name} durationMs=${Date.now() - startedAt}`,
      );
      throw err;
    }
  }

  private async computeHoldings(userId: string) {
    const owner = this.ownerFor(userId);
    const ngnPerUsd = this.history?.latestNgnPerUsd() ?? 0;
    const displayCurrency = this.wallets.getSettings(userId).displayCurrency;
    const v = await this.vaults.valuation(owner);
    if (!v) {
      return {
        displayCurrency,
        ngnPerUsd,
        totalValueUsd: 0,
        putInUsd: 0,
        waitingUsdc: 0,
        holdings: [],
        vault: null,
        recentBuys: [],
      };
    }
    const [vault, recentBuys] = await Promise.all([
      this.vaults.vaultRules(owner),
      this.vaults.recentBuys(owner),
    ]);
    const holdings = v.holdings.map((h) => ({
      symbol: h.mint as HoldingSymbol,
      uiAmount: h.uiAmount,
      valueUsd: h.priced ? h.valueUsd : null,
      priced: h.priced,
    }));
    const anyUnpriced = holdings.some((h) => !h.priced);
    return {
      displayCurrency,
      ngnPerUsd,
      totalValueUsd: anyUnpriced ? null : v.totalUsd,
      putInUsd: v.investedUsd,
      waitingUsdc: v.waitingUsdc,
      holdings,
      vault,
      recentBuys,
    };
  }

  /**
   * Owner in the URL is never trusted on its own: it must match the owner
   * resolved server-side from verified Telegram initData.
   */
  @Get(':owner/holdings')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async holdings(
    @Param('owner') ownerParam: string,
    @Headers('x-telegram-init-data') initData?: string,
  ) {
    const userId = this.verifiedUser(initData);
    const owner = this.ownerFor(userId);
    if (ownerParam && ownerParam !== owner)
      throw new ForbiddenException('owner does not match initData user');
    const holdings = await this.vaults.holdings(owner);
    return holdings.map((h) => ({
      mint: h.mint,
      raw: h.raw.toString(),
      uiAmount: h.uiAmount,
    }));
  }
}
