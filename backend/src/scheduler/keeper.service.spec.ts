import { KeeperService } from './keeper.service';
import { WalletsService } from '../wallets/wallets.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VaultProgramError } from '../solana/anchor-vault-client';
import { FakeVaultClient } from '../solana/fake-vault-client';
import type { AppConfig } from '../config/app-config';

const cfg: AppConfig = {
  keeperPublicKey: 'k',
  oraclePublicKey: 'o',
  gasPublicKey: 'g',
  periodSeconds: 10,
  minTradeMicroUsdc: 100_000n,
  maxSlippageBps: 100,
  maxPriceAgeSecs: 600,
  demoRepublish: false,
  cluster: 'devnet',
  rpcUrl: 'https://api.devnet.solana.com',
};

async function seeded(allowance: bigint) {
  const client = new FakeVaultClient();
  await client.createVault({
    owner: 'OWNER',
    withdrawalDestination: 'DEST',
    ratePerPeriod: 500_000n,
    mints: ['SPY', 'AAPL'],
  });
  client.setAllowance('OWNER', allowance);
  client.setMintMeta('SPY', { decimals: 8, multiplier: 1.0075 });
  client.setMintMeta('AAPL', { decimals: 8, multiplier: 1.0033 });
  await client.updatePriceAsOracle('SPY', 750_000_000n);
  await client.updatePriceAsOracle('AAPL', 336_470_000n);
  return client;
}

describe('KeeperService.tick', () => {
  it('buys nothing in period 0 (no allowance yet)', async () => {
    const client = await seeded(0n);
    const keeper = new KeeperService(client, cfg);
    keeper.registerVault('OWNER');
    const r = await keeper.tick();
    expect(r.buys).toHaveLength(0);
    expect(client.buys).toHaveLength(0);
  });

  it('buys nothing while paused', async () => {
    const client = await seeded(500_000n);
    client.setPaused('OWNER', true);
    const keeper = new KeeperService(client, cfg);
    keeper.registerVault('OWNER');
    const r = await keeper.tick();
    expect(r.buys).toHaveLength(0);
  });

  it('buys nothing below min_trade', async () => {
    const client = await seeded(50_000n);
    const keeper = new KeeperService(client, cfg);
    keeper.registerVault('OWNER');
    const r = await keeper.tick();
    expect(r.buys).toHaveLength(0);
  });

  it('splits one period across two chosen stocks with a slippage floor', async () => {
    const client = await seeded(500_000n);
    const keeper = new KeeperService(client, cfg);
    keeper.registerVault('OWNER');
    const r = await keeper.tick();
    expect(r.buys).toHaveLength(2);
    expect(client.buys.map((b) => b.mint).sort()).toEqual(['AAPL', 'SPY']);
    for (const b of client.buys) {
      expect(b.usdcIn).toBe(250_000n);
      expect(b.minOut).toBeGreaterThan(0n);
    }
  });

  it('buys from the settled allowance even when the stored field is still 0', async () => {
    const client = await seeded(0n);
    const keeper = new KeeperService(client, cfg);
    keeper.registerVault('OWNER');
    const vault = await client.getVault('OWNER');
    const later = vault!.lastCheckpointTs + cfg.periodSeconds;
    client.clock = () => later;
    // One whole period later: 500_000 accrues in the settled view; stored field is still 0.
    expect(vault!.allowance).toBe(0n);
    const r = await keeper.tick(later);
    expect(r.buys).toHaveLength(2);
  });

  it('buys one stock (rotating) when an equal split would fall below min_trade', async () => {
    const client = await seeded(150_000n); // split would be 75_000 < 100_000
    const keeper = new KeeperService(client, cfg);
    keeper.registerVault('OWNER');
    const r = await keeper.tick();
    expect(r.buys).toHaveLength(1);
    expect(r.buys[0].usdcIn).toBe(150_000n);
  });

  it('skips a mint whose decimals are unknown instead of assuming 8', async () => {
    const client = await seeded(500_000n);
    (client as unknown as { mintMeta: Map<string, unknown> }).mintMeta.delete('AAPL');
    const keeper = new KeeperService(client, cfg);
    keeper.registerVault('OWNER');
    const r = await keeper.tick();
    expect(r.buys.map((b) => b.mint)).toEqual(['SPY']);
  });

  it('skips a stale price', async () => {
    const client = await seeded(500_000n);
    const keeper = new KeeperService(client, cfg);
    keeper.registerVault('OWNER');
    const r = await keeper.tick(Math.floor(Date.now() / 1000) + cfg.maxPriceAgeSecs + 1);
    expect(r.buys).toHaveLength(0);
  });
});

describe('KeeperService buy notifications (§4)', () => {
  async function setupNotify(notifyBuys: boolean) {
    const client = await seeded(500_000n);
    const wallets = new WalletsService('ab'.repeat(32));
    const w = await wallets.createWallet('42');
    // Point the seeded vault owner at the wallet owner for the reverse lookup.
    await client.createVault({ owner: w.ownerPublicKey, withdrawalDestination: 'DEST', ratePerPeriod: 500_000n, mints: ['SPY', 'AAPL'] });
    client.setMintMeta('SPY', { decimals: 8, multiplier: 1.0075 });
    client.setMintMeta('AAPL', { decimals: 8, multiplier: 1.0033 });
    await client.updatePriceAsOracle('SPY', 750_000_000n);
    await client.updatePriceAsOracle('AAPL', 336_470_000n);
    client.setAllowance(w.ownerPublicKey, 500_000n);
    await wallets.setNotifyBuys('42', notifyBuys);
    const notifications = new NotificationsService();
    const sent: { id: string; text: string }[] = [];
    notifications.registerSender(async (id, text) => { sent.push({ id, text }); });
    const keeper = new KeeperService(client, cfg, notifications, wallets, { latestNgnPerUsd: () => 1000 } as never);
    keeper.registerVault(w.ownerPublicKey);
    return { keeper, sent };
  }

  it('sends one split message when notifyBuys is on', async () => {
    const { keeper, sent } = await setupNotify(true);
    await keeper.tick();
    expect(sent).toHaveLength(1);
    expect(sent[0].id).toBe('42');
    expect(sent[0].text).toContain('Bought for your vault');
  });

  it('sends nothing when notifyBuys is off', async () => {
    const { keeper, sent } = await setupNotify(false);
    await keeper.tick();
    expect(sent).toHaveLength(0);
  });
});

describe('KeeperService actual bought amount', () => {
  it('reports the balance delta (quoted out), not the min_out floor', async () => {
    const client = await seeded(500_000n);
    const keeper = new KeeperService(client, cfg);
    keeper.registerVault('OWNER');
    const r = await keeper.tick();
    expect(r.buys).toHaveLength(2);
    for (const b of r.buys) {
      expect(b.outRaw).toBeDefined();
      expect(b.outRaw!).toBeGreaterThan(b.minOut);
    }
  });
});

describe('KeeperService buy records (DB)', () => {
  it('writes BuyRecord rows and reads buysSince from the DB when enabled', async () => {
    const client = await seeded(500_000n);
    const rows: { owner: string; mint: string; usdcIn: string; createdAt: Date }[] = [];
    const prisma = {
      enabled: true,
      buyRecord: {
        create: async ({ data }: { data: { owner: string; mint: string; usdcIn: string } }) => {
          rows.push({ ...data, createdAt: new Date() });
        },
        findMany: async ({ where }: { where: { owner: string; createdAt: { gte: Date } } }) =>
          rows.filter(
            (r) => r.owner === where.owner && r.createdAt >= where.createdAt.gte,
          ),
      },
    };
    const keeper = new KeeperService(
      client, cfg, undefined, undefined, undefined, prisma as never,
    );
    keeper.registerVault('OWNER');
    await keeper.tick();
    expect(rows).toHaveLength(2);
    const since = await keeper.buysSince('OWNER', 0);
    expect(since.map((b) => b.mint).sort()).toEqual(['AAPL', 'SPY']);
    expect(since[0].usdcIn).toBe(250_000n);
  });
});

describe('KeeperService program-error handling', () => {
  it('treats expected rejections as a quiet skip and never throws', async () => {
    const client = await seeded(500_000n);
    client.buyAsKeeper = async () => { throw new VaultProgramError('StalePrice'); };
    const keeper = new KeeperService(client, cfg);
    keeper.registerVault('OWNER');
    await expect(keeper.tick()).resolves.toEqual({ buys: [] });
  });
});
