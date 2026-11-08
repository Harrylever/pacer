import { JobsService, PRICE_REFRESH_CRON } from './jobs.service';
import { KeeperService } from './keeper.service';
import { VaultsService } from '../vaults/vaults.service';
import { WalletsService } from '../wallets/wallets.service';
import { FakeVaultClient } from '../solana/fake-vault-client';
import { NotificationsService } from '../notifications/notifications.service';
import type { PricesService } from '../prices/prices.service';
import type { AppConfig } from '../config/app-config';

const cfg: AppConfig = {
  keeperPublicKey: 'k', oraclePublicKey: 'o', gasPublicKey: 'g',
  periodSeconds: 10, minTradeMicroUsdc: 100_000n, maxSlippageBps: 100,
  maxPriceAgeSecs: 600, demoRepublish: false, cluster: 'devnet',
  rpcUrl: 'https://api.devnet.solana.com',
};

async function setup() {
  const client = new FakeVaultClient();
  const vaults = new VaultsService(client);
  const wallets = new WalletsService('ab'.repeat(32));
  const wallet = await wallets.createWallet('42');
  await client.createVault({ owner: wallet.ownerPublicKey, withdrawalDestination: 'DEST', ratePerPeriod: 500_000n, mints: ['SPYx'] });
  const keeper = new KeeperService(client, cfg);
  keeper.registerVault(wallet.ownerPublicKey);
  const notifications = new NotificationsService();
  const sent: { id: string; text: string }[] = [];
  notifications.registerSender(async (id, text) => { sent.push({ id, text }); });
  const prices = { refreshPrices: async () => ({ published: [], kept: [] }) } as unknown as PricesService;
  const history = { latestNgnPerUsd: () => 1000 } as never;
  const jobs = new JobsService(keeper, vaults, prices, wallets, notifications, history);
  return { client, jobs, sent, owner: wallet.ownerPublicKey, wallets };
}

describe('JobsService deposit notifications (§3.2-3.4)', () => {
  it('sends arrived and in-your-vault exactly once per deposit', async () => {
    const { client, jobs, sent, owner } = await setup();
    client.creditDepositWallet(owner, 10_000_000n);
    await jobs.sweepAll();
    await jobs.sweepAll();
    expect(sent.filter((m) => m.text.includes('arrived'))).toHaveLength(1);
    expect(sent.filter((m) => m.text.includes('in your vault'))).toHaveLength(1);
    expect(sent.every((m) => m.id === '42')).toBe(true);
  });

  it('sends the failure message once, not on every tick', async () => {
    const { client, jobs, sent, owner } = await setup();
    client.creditDepositWallet(owner, 5_000_000n);
    client.failNextDeposit = true;
    await jobs.sweepAll();
    client.failNextDeposit = true;
    await jobs.sweepAll();
    expect(sent.filter((m) => m.text.includes('failed'))).toHaveLength(1);
    // Recovery: the same deposit then sweeps without a second failure note.
    await jobs.sweepAll();
    expect(sent.filter((m) => m.text.includes('failed'))).toHaveLength(1);
    expect(sent.filter((m) => m.text.includes('in your vault'))).toHaveLength(1);
  });

  it('weekly summary: normal, paused and out-of-USDC variants, never twice', async () => {
    const { client, jobs, sent, owner, wallets } = await setup();
    const vault = await client.getVault(owner);
    vault!.totalInvested = 5_000_000n;
    client.creditVault(owner, 'USDC', 2_000_000n);
    const monday = new Date('2026-11-02T09:00:00');
    await jobs.sendSummaries(monday);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('Your week with Pacer');
    expect(sent[0].text).not.toContain('Change:');
    // The link points at the vault, not the owner's deposit wallet.
    expect(sent[0].text).toContain(`fake-vault-${owner}`);
    await jobs.sendSummaries(monday);
    expect(sent).toHaveLength(1); // NudgeLog dedupe: a restart never sends twice

    await wallets.setSummaryCadence('42', 'monthly');
    await jobs.sendSummaries(new Date('2026-11-16T09:00:00'));
    expect(sent).toHaveLength(1); // monthly users are not due mid-month
  });

  it('weekly summary: paused variant', async () => {
    const { client, jobs, sent, owner } = await setup();
    (await client.getVault(owner))!.totalInvested = 5_000_000n;
    client.setPaused(owner, true);
    await jobs.sendSummaries(new Date('2026-11-02T09:00:00'));
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('paused');
  });

  it('weekly summary: out-of-USDC variant and empty-vault skip', async () => {
    const { client, jobs, sent, owner } = await setup();
    await jobs.sendSummaries(new Date('2026-11-02T09:00:00'));
    expect(sent).toHaveLength(0); // empty, inactive vault: never sent
    (await client.getVault(owner))!.totalInvested = 5_000_000n;
    await jobs.sendSummaries(new Date('2026-11-09T09:00:00'));
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('run out of USDC');
  });

  it('refreshes prices at boot and at least every 4 minutes', async () => {
    const { jobs } = await setup();
    expect(PRICE_REFRESH_CRON).toBe('0 */2 * * * *');
    const prices = (
      jobs as never as { prices: { refreshPrices: () => Promise<unknown> } }
    ).prices;
    let calls = 0;
    const original = prices.refreshPrices.bind(prices);
    prices.refreshPrices = async () => {
      calls++;
      return original();
    };
    jobs.onApplicationBootstrap();
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBeGreaterThanOrEqual(1);
  });

  it('a failing Telegram send never breaks the sweep', async () => {
    const { client, jobs, owner } = await setup();
    client.creditDepositWallet(owner, 10_000_000n);
    const failing = new NotificationsService();
    failing.registerSender(async () => { throw new Error('down'); });
    const jobs2 = new JobsService(
      (jobs as never as { keeper: KeeperService }).keeper,
      (jobs as never as { vaults: VaultsService }).vaults,
      (jobs as never as { prices: PricesService }).prices,
      (jobs as never as { wallets: WalletsService }).wallets,
      failing,
      { latestNgnPerUsd: () => 1000 } as never,
    );
    await expect(jobs2.sweepAll()).resolves.toBeUndefined();
    expect(await client.getVaultBalance(owner, 'USDC')).toBe(10_000_000n);
  });
});
