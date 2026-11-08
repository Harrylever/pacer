import { Test } from '@nestjs/testing';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { VaultsService, VAULT_CLIENT } from './vaults.service';
import { FakeVaultClient } from '../solana/fake-vault-client';

const OWNER = 'OwnerPubkey1111111111111111111111111111111';
const DEST = 'DestPubkey11111111111111111111111111111111';

async function seeded() {
  const client = new FakeVaultClient();
  await client.createVault({
    owner: OWNER,
    withdrawalDestination: DEST,
    ratePerPeriod: 500_000n,
    mints: ['SPY', 'AAPL'],
  });
  return { client, svc: new VaultsService(client) };
}

describe('VaultsService deposit sweep', () => {
  it('sweeps a deposit balance once; a second sweep moves zero', async () => {
    const { client, svc } = await seeded();
    client.creditDepositWallet(OWNER, 10_000_000n);
    await expect(svc.sweepDeposits(OWNER)).resolves.toEqual({
      sweptMicroUsdc: 10_000_000n,
      needsRetry: false,
      signature: 'fake-deposit-sig',
    });
    await expect(svc.sweepDeposits(OWNER)).resolves.toEqual({
      sweptMicroUsdc: 0n,
      needsRetry: false,
    });
  });

  it('flags retry and keeps the balance when the sweep fails', async () => {
    const { client, svc } = await seeded();
    client.creditDepositWallet(OWNER, 5_000_000n);
    client.failNextDeposit = true;
    await expect(svc.sweepDeposits(OWNER)).resolves.toEqual({
      sweptMicroUsdc: 0n,
      needsRetry: true,
    });
    await expect(svc.sweepDeposits(OWNER)).resolves.toEqual({
      sweptMicroUsdc: 5_000_000n,
      needsRetry: false,
      signature: 'fake-deposit-sig',
    });
  });
});

describe('VaultsService withdraw-all', () => {
  it('packs every held mint to the fixed destination only', async () => {
    const { client, svc } = await seeded();
    client.creditVault(OWNER, 'USDC', 2_000_000n);
    client.creditVault(OWNER, 'SPY', 100_000n);
    client.creditVault(OWNER, 'AAPL', 50_000n);
    const plan = await svc.buildWithdrawAll(OWNER);
    expect(plan.destination).toBe(DEST);
    expect(plan.legs.map((l) => l.mint).sort()).toEqual([
      'AAPL',
      'SPY',
      'USDC',
    ]);
  });

  it('refuses any withdraw path carrying a keeper identity', async () => {
    const { svc } = await seeded();
    await expect(
      svc.buildWithdrawAll(OWNER, 'keeper'),
    ).rejects.toThrow(/owner/);
  });
});

describe('VaultsService plan / pause / resume', () => {
  it('creates the vault on first plan and updates rules on the next', async () => {
    const client = new FakeVaultClient();
    const svc = new VaultsService(client);
    const first = await svc.applyPlan(OWNER, {
      dailyNgn: 300,
      ngnPerUsd: 1000,
      assets: ['AAPLx', 'SPYx'],
      withdrawalDestination: DEST,
    });
    expect(first.created).toBe(true);
    expect(first.ratePerPeriod).toBe(300_000n);
    const vault = await client.getVault(OWNER);
    expect(vault?.chosenMints).toEqual(['AAPLx', 'SPYx']);
    expect(vault?.withdrawalDestination).toBe(DEST);

    const second = await svc.applyPlan(OWNER, {
      dailyNgn: 500,
      ngnPerUsd: 1000,
      assets: ['NVDAx'],
      withdrawalDestination: DEST,
    });
    expect(second.created).toBe(false);
    expect(second.ratePerPeriod).toBe(500_000n);
    expect((await client.getVault(OWNER))?.chosenMints).toEqual(['NVDAx']);
  });

  it('pause and resume preserve rate and mints', async () => {
    const { client, svc } = await seeded();
    await svc.pause(OWNER);
    let vault = await client.getVault(OWNER);
    expect(vault?.paused).toBe(true);
    expect(vault?.ratePerPeriod).toBe(500_000n);
    expect(vault?.chosenMints).toEqual(['SPY', 'AAPL']);
    await svc.resume(OWNER);
    vault = await client.getVault(OWNER);
    expect(vault?.paused).toBe(false);
  });
});

describe('VaultsService recordIntent', () => {
  it('hashes the canonical intent and records it; asset order does not matter', async () => {
    const { client, svc } = await seeded();
    const sig = await svc.recordIntent(
      OWNER,
      { type: 'set_plan', dailyNgn: 500, assets: ['SPYx', 'AAPLx'] },
      new Uint8Array(16),
    );
    expect(sig).toBe('fake-record-intent-sig');
    await svc.recordIntent(
      OWNER,
      { type: 'set_plan', dailyNgn: 500, assets: ['AAPLx', 'SPYx'] },
      new Uint8Array(16),
    );
    expect(client.intentRecords).toHaveLength(2);
    expect(client.intentRecords[0].intentHash).toEqual(
      client.intentRecords[1].intentHash,
    );
    expect(client.intentRecords[0].intentHash).toHaveLength(32);
  });

  it('never throws when the chain call fails', async () => {
    const { client, svc } = await seeded();
    client.recordIntent = async () => {
      throw new Error('rpc down');
    };
    await expect(
      svc.recordIntent(OWNER, { type: 'pause' }, new Uint8Array(16)),
    ).resolves.toBeNull();
  });
});

describe('VaultsService executeWithdrawAll', () => {
  it('sends every held mint to the fixed destination in one transaction, and pauses', async () => {
    const { client, svc } = await seeded();
    client.creditVault(OWNER, 'USDC', 2_000_000n);
    client.creditVault(OWNER, 'SPY', 100_000n);
    const r = await svc.executeWithdrawAll(OWNER);
    expect(r.destination).toBe(DEST);
    expect(r.signature).toBe('fake-withdraw-all-sig');
    expect(client.withdrawAllTxs).toHaveLength(1);
    expect((await client.getVault(OWNER))?.paused).toBe(true);
    expect(client.withdrawals.map((w) => w.mint).sort()).toEqual([
      'SPY',
      'USDC',
    ]);
    expect(
      client.withdrawals.every((w) => w.destination === DEST),
    ).toBe(true);
    expect(await client.getVaultBalance(OWNER, 'USDC')).toBe(0n);
  });

  it('resumes a running vault and says nothing was lost when the withdrawal fails', async () => {
    const { client, svc } = await seeded();
    client.creditVault(OWNER, 'USDC', 2_000_000n);
    client.withdrawAllAsOwner = async () => {
      throw new Error('SlippageTooHigh');
    };
    await expect(svc.executeWithdrawAll(OWNER)).rejects.toThrow(
      /didn't go through.*nothing was lost/i,
    );
    expect((await client.getVault(OWNER))?.paused).toBe(false);
    expect(await client.getVaultBalance(OWNER, 'USDC')).toBe(2_000_000n);
  });

  it('refuses execution for a keeper role before touching the client', async () => {
    const { client, svc } = await seeded();
    client.creditVault(OWNER, 'USDC', 1n);
    await expect(svc.executeWithdrawAll(OWNER, 'keeper')).rejects.toThrow(
      /owner/,
    );
    expect(client.withdrawals).toHaveLength(0);
  });
});

describe('VaultsService stranded stocks', () => {
  it('withdraws a stock the user no longer chooses', async () => {
    const { client, svc } = await seeded();
    client.creditVault(OWNER, 'NVDA', 70_000n); // held from an earlier plan
    const plan = await svc.buildWithdrawAll(OWNER);
    expect(plan.legs.map((l) => l.mint)).toContain('NVDA');
  });

  it('returns no signature when there is nothing to withdraw', async () => {
    const { svc } = await seeded();
    expect((await svc.executeWithdrawAll(OWNER)).signature).toBeNull();
  });
});

describe('VaultsService holdings display', () => {
  it('shows UI amounts with the ScaledUiAmount multiplier', async () => {
    const { client, svc } = await seeded();
    client.creditVault(OWNER, 'SPY', 100_300_000n);
    client.setMintMeta('SPY', { decimals: 8, multiplier: 1.003 });
    const h = await svc.holdings(OWNER);
    const spy = h.find((x) => x.mint === 'SPY');
    expect(spy?.uiAmount).toBeCloseTo(1.006009, 6);
    expect(spy?.raw).toBe(100_300_000n);
  });
});

describe('VaultsService vault rules and recent buys (B2)', () => {
  function fakePrisma(
    rows: { owner: string; mint: string; usdcIn: string; createdAt: Date }[],
  ) {
    return {
      enabled: true,
      buyRecord: {
        findMany: async (args: {
          where: { owner: string };
          orderBy: { createdAt: 'desc' };
          take: number;
        }) =>
          rows
            .filter((r) => r.owner === args.where.owner)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, args.take),
      },
    };
  }

  it('returns null rules and no buys when there is no vault yet', async () => {
    const client = new FakeVaultClient();
    const svc = new VaultsService(client);
    await expect(svc.vaultRules(OWNER)).resolves.toBeNull();
    await expect(svc.recentBuys(OWNER)).resolves.toEqual([]);
  });

  it('reads the rules live from the chain via the fake vault client', async () => {
    const { svc } = await seeded();
    const rules = await svc.vaultRules(OWNER);
    expect(rules).toEqual({
      address: `fake-vault-${OWNER}`,
      explorerUrl: `https://explorer.solana.com/address/fake-vault-${OWNER}?cluster=devnet`,
      withdrawalAddress: DEST,
      paceUsdPerPeriod: 0.5,
      periodSeconds: 10,
      stocks: ['SPYx', 'AAPLx'],
      paused: false,
    });
  });

  it('reports a paused vault as paused', async () => {
    const { client, svc } = await seeded();
    client.setPaused(OWNER, true);
    await expect(svc.vaultRules(OWNER)).resolves.toMatchObject({
      paused: true,
    });
  });

  it('returns null, never a DB guess, when the chain read fails', async () => {
    const { client, svc } = await seeded();
    client.getVault = async () => {
      throw new Error('rpc down');
    };
    await expect(svc.vaultRules(OWNER)).resolves.toBeNull();
  });

  it('returns buys newest first, at most 5, in dollars', async () => {
    const { client } = await seeded();
    const base = new Date('2026-11-01T00:00:00.000Z').getTime();
    const rows = Array.from({ length: 7 }, (_, i) => ({
      owner: OWNER,
      mint: i % 2 === 0 ? 'SPYx' : 'AAPLx',
      usdcIn: String((i + 1) * 1_000_000),
      createdAt: new Date(base + i * 60_000),
    }));
    const svc = new VaultsService(
      client,
      undefined,
      fakePrisma(rows) as never,
    );
    const buys = await svc.recentBuys(OWNER);
    expect(buys).toHaveLength(5);
    expect(buys[0]).toEqual({
      symbol: 'SPYx',
      usdcIn: 7,
      at: new Date(base + 6 * 60_000).toISOString(),
    });
    expect(buys.map((b) => b.usdcIn)).toEqual([7, 6, 5, 4, 3]);
  });
});

describe('VaultsService valuation price freshness', () => {
  it('values a holding as unavailable when its price is stale or missing', async () => {
    const { client, svc } = await seeded();
    client.creditVault(OWNER, 'SPY', 100_000_000n);
    client.setMintMeta('SPY', { decimals: 8, multiplier: 1 });
    const now = Math.floor(Date.now() / 1000);
    client.setPriceAt('SPY', 750_000_000n, now - 10_000); // stale
    let v = await svc.valuation(OWNER);
    expect(v?.holdings.find((h) => h.mint === 'SPY')?.priced).toBe(false);
    client.setPriceAt('SPY', 750_000_000n, now); // fresh
    v = await svc.valuation(OWNER);
    const spy = v?.holdings.find((h) => h.mint === 'SPY');
    expect(spy?.priced).toBe(true);
    expect(spy?.valueUsd).toBeCloseTo(750, 5);
  });
});

describe('VaultsService dependency injection', () => {
  // Regression: PrismaService was imported with `import type`, which erases the
  // constructor type Nest injects by. With @Optional() it was silently
  // undefined, so recentBuys was always [] in the real app while the unit
  // tests above (which construct the service by hand) still passed.
  it('gets the real PrismaService from Nest', async () => {
    const mod = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [VaultsService, { provide: VAULT_CLIENT, useValue: new FakeVaultClient() }],
    }).compile();
    const injected = (mod.get(VaultsService) as unknown as { prisma?: unknown }).prisma;
    // By name: Jest's ESM mode can load the class twice, so instanceof
    // would compare two copies of PrismaService.
    expect(injected).toBeDefined();
    expect((injected as object).constructor.name).toBe(PrismaService.name);
  });
});
