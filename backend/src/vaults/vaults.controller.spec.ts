import { createHmac } from 'node:crypto';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { VaultsController } from './vaults.controller';
import type { VaultsService } from './vaults.service';
import type { WalletsService } from '../wallets/wallets.service';
import type { HistoryService } from '../history/history.service';

const TOKEN = '123456:test-bot-token';

function initDataFor(userId: number): string {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId }),
  };
  const check = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

describe('VaultsController holdings auth', () => {
  const OLD = process.env.TELEGRAM_BOT_TOKEN;
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  });
  afterEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = OLD;
  });

  function controller(
    valuation: unknown = null,
    extra: { vault?: unknown; recentBuys?: unknown[] } = {},
  ) {
    const vaults = {
      holdings: async (owner: string) => [
        { mint: 'USDC', raw: 1_500_000n, uiAmount: 1.5 },
      ].filter(() => owner === 'OWNER1'),
      valuation: async () => valuation,
      vaultRules: async () => extra.vault ?? null,
      recentBuys: async () => extra.recentBuys ?? [],
    } as unknown as VaultsService;
    const wallets = {
      ownerForTelegram: (id: string) =>
        id === '424242' ? 'OWNER1' : undefined,
      getSettings: () => ({
        displayCurrency: 'NGN',
        notifyBuys: false,
        summaryCadence: 'weekly',
      }),
    } as unknown as WalletsService;
    const history = {
      latestNgnPerUsd: () => 1385,
    } as unknown as HistoryService;
    return new VaultsController(vaults, wallets, history);
  }

  it('resolves the owner from verified initData', async () => {
    const rows = await controller().holdings(
      'OWNER1',
      initDataFor(424242),
    );
    expect(rows).toEqual([{ mint: 'USDC', raw: '1500000', uiAmount: 1.5 }]);
  });

  it('rejects missing initData and a URL owner that does not match', async () => {
    await expect(controller().holdings('OWNER1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      controller().holdings('SOMEONE_ELSE', initDataFor(424242)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('GET /vaults/me/holdings', () => {
    it('returns priced holdings with totals', async () => {
      const c = controller({
        holdings: [
          { mint: 'USDC', raw: 5_000_000n, uiAmount: 5, valueUsd: 5, priced: true },
          { mint: 'SPYx', raw: 100n, uiAmount: 0.5, valueUsd: 10, priced: true },
        ],
        totalUsd: 15,
        investedUsd: 12,
        waitingUsdc: 5,
        paused: false,
        ratePerPeriod: 1_000_000n,
      });
      const r = await c.myHoldings(initDataFor(424242));
      expect(r).toEqual({
        displayCurrency: 'NGN',
        ngnPerUsd: 1385,
        totalValueUsd: 15,
        putInUsd: 12,
        waitingUsdc: 5,
        holdings: [
          { symbol: 'USDC', uiAmount: 5, valueUsd: 5, priced: true },
          { symbol: 'SPYx', uiAmount: 0.5, valueUsd: 10, priced: true },
        ],
        vault: null,
        recentBuys: [],
      });
    });

    it('returns the vault rules and recent buys alongside holdings', async () => {
      const vault = {
        address: 'VaultPda111',
        explorerUrl:
          'https://explorer.solana.com/address/VaultPda111?cluster=devnet',
        withdrawalAddress: 'Dest111',
        paceUsdPerPeriod: 1.05,
        periodSeconds: 10,
        stocks: ['AAPLx'],
        paused: true,
      };
      const recentBuys = [
        { symbol: 'AAPLx', usdcIn: 1.05, at: '2026-11-06T00:00:00.000Z' },
      ];
      const c = controller(
        {
          holdings: [],
          totalUsd: 0,
          investedUsd: 0,
          waitingUsdc: 0,
          paused: true,
          ratePerPeriod: 1_050_000n,
        },
        { vault, recentBuys },
      );
      const r = await c.myHoldings(initDataFor(424242));
      expect(r.vault).toEqual(vault);
      expect(r.recentBuys).toEqual(recentBuys);
    });

    it('returns totalValueUsd null when any line is unpriced', async () => {
      const c = controller({
        holdings: [
          { mint: 'SPYx', raw: 100n, uiAmount: 0.5, valueUsd: 0, priced: false },
        ],
        totalUsd: 0,
        investedUsd: 12,
        waitingUsdc: 0,
        paused: false,
        ratePerPeriod: 1_000_000n,
      });
      const r = await c.myHoldings(initDataFor(424242));
      expect(r.totalValueUsd).toBeNull();
      expect(r.holdings[0]).toEqual({
        symbol: 'SPYx',
        uiAmount: 0.5,
        valueUsd: null,
        priced: false,
      });
    });

    it('returns an empty summary when there is no vault yet', async () => {
      const r = await controller(null).myHoldings(initDataFor(424242));
      expect(r).toEqual({
        displayCurrency: 'NGN',
        ngnPerUsd: 1385,
        totalValueUsd: 0,
        putInUsd: 0,
        waitingUsdc: 0,
        holdings: [],
        vault: null,
        recentBuys: [],
      });
    });

    it('serves a short cache: a second call within the TTL returns the same result', async () => {
      const c = controller({
        holdings: [],
        totalUsd: 0,
        investedUsd: 0,
        waitingUsdc: 0,
        paused: false,
        ratePerPeriod: 1_000_000n,
      });
      const first = await c.myHoldings(initDataFor(424242));
      const second = await c.myHoldings(initDataFor(424242));
      expect(second).toBe(first);
    });

    it('rejects bad initData and a user with no wallet', async () => {
      await expect(controller().myHoldings('bogus')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(
        controller().myHoldings(initDataFor(999999)),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
