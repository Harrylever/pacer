import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Optional,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { VaultsService } from './vaults.service';
import { WalletsService } from '../wallets/wallets.service';
import { HistoryService } from '../history/history.service';
import { verifyTelegramInitData } from '../common/telegram-init-data';

type HoldingSymbol = 'USDC' | 'SPYx' | 'AAPLx' | 'NVDAx';

@Controller('vaults')
export class VaultsController {
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
  async myHoldings(@Headers('x-telegram-init-data') initData?: string) {
    const userId = this.verifiedUser(initData);
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
