import { FakeVaultClient } from './fake-vault-client';

describe('FakeVaultClient chain config (task 2)', () => {
  it('returns the demo config by default', async () => {
    const cfg = await new FakeVaultClient().getConfig();
    expect(cfg.periodSeconds).toBe(10);
    expect(cfg.minTrade).toBe(100_000n);
    expect(cfg.maxRatePerPeriod).toBe(50_000_000n);
    expect(cfg.maxSlippageBps).toBe(100);
    expect(cfg.maxPriceAgeSecs).toBe(600);
    expect(cfg.halted).toBe(false);
  });

  it('returns constructor overrides, defensively copied', async () => {
    const client = new FakeVaultClient({
      keeper: 'KeeperX',
      periodSeconds: 86_400,
      minTrade: 1_000_000n,
    });
    const cfg = await client.getConfig();
    expect(cfg.keeper).toBe('KeeperX');
    expect(cfg.periodSeconds).toBe(86_400);
    cfg.stockMints.push('HACK');
    expect((await client.getConfig()).stockMints).not.toContain('HACK');
  });

  it('rejects buys of mints outside the allowlist (MintNotAllowed)', async () => {
    const client = new FakeVaultClient();
    await client.createVault({
      owner: 'O1',
      withdrawalDestination: 'D1',
      ratePerPeriod: 1_000_000n,
      mints: ['SPYx'],
    });
    client.setAllowance('O1', 10_000_000n);
    await expect(
      client.buyAsKeeper({ owner: 'O1', mint: 'TSLAx', usdcIn: 1_000_000n, minOut: 1n }),
    ).rejects.toThrow('MintNotAllowed');
    await expect(
      client.buyAsKeeper({ owner: 'O1', mint: 'SPYx', usdcIn: 1_000_000n, minOut: 1n }),
    ).resolves.toBe('fake-buy-sig');
  });

  it('enforces the withdraw window on delayed vaults (WithdrawWindowClosed)', async () => {
    const client = new FakeVaultClient();
    let now = 1_000_000;
    client.clock = () => now;
    await client.createVault({
      owner: 'O1',
      withdrawalDestination: 'D1',
      ratePerPeriod: 1n,
      mints: [],
      withdrawDelaySecs: 100,
    });
    client.creditVault('O1', 'USDC', 500n);
    await expect(
      client.withdrawAsOwner({ owner: 'O1', mint: 'USDC', amount: 500n }),
    ).rejects.toThrow('WithdrawWindowClosed');
    client.requestWithdraw('O1'); // unlocks at now+100, window 86400s
    now += 50;
    await expect(
      client.withdrawAsOwner({ owner: 'O1', mint: 'USDC', amount: 500n }),
    ).rejects.toThrow('WithdrawWindowClosed');
    now += 100; // inside the window
    await expect(
      client.withdrawAsOwner({ owner: 'O1', mint: 'USDC', amount: 500n }),
    ).resolves.toBe('fake-withdraw-sig');
  });

  it('stores withdrawDelaySecs on create, defaulting to 0', async () => {
    const client = new FakeVaultClient();
    await client.createVault({
      owner: 'O1',
      withdrawalDestination: 'D1',
      ratePerPeriod: 1n,
      mints: [],
    });
    expect((await client.getVault('O1'))?.withdrawDelaySecs).toBe(0);
    await client.createVault({
      owner: 'O2',
      withdrawalDestination: 'D2',
      ratePerPeriod: 1n,
      mints: [],
      withdrawDelaySecs: 20,
    });
    expect((await client.getVault('O2'))?.withdrawDelaySecs).toBe(20);
  });
});
