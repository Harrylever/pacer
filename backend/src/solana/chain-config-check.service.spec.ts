import { ChainConfigCheckService } from './chain-config-check.service';
import { FakeVaultClient } from './fake-vault-client';
import type { AppConfig } from '../config/app-config';

function appConfig(over: Partial<AppConfig> = {}): AppConfig {
  return {
    keeperPublicKey: 'KeeperPubkey11111111111111111111111111111111',
    oraclePublicKey: 'OraclePubkey11111111111111111111111111111111',
    gasPublicKey: 'gas',
    periodSeconds: 10,
    minTradeMicroUsdc: 100_000n,
    maxSlippageBps: 100,
    maxPriceAgeSecs: 600,
    demoRepublish: false,
    cluster: 'devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    ...over,
  };
}

describe('ChainConfigCheckService', () => {
  it('passes when chain and environment agree', async () => {
    const svc = new ChainConfigCheckService(
      new FakeVaultClient(),
      appConfig(),
      true,
    );
    await expect(svc.assertMatches()).resolves.toBeUndefined();
  });

  it.each([
    ['PERIOD_SECONDS', { periodSeconds: 86_400 }],
    ['MIN_TRADE_MICRO_USDC', { minTradeMicroUsdc: 1_000_000n }],
    ['MAX_SLIPPAGE_BPS', { maxSlippageBps: 50 }],
    ['MAX_PRICE_AGE_SECS', { maxPriceAgeSecs: 60 }],
    ['KEEPER_SECRET_KEY', { keeperPublicKey: 'OtherKeeper' }],
    ['ORACLE_SECRET_KEY', { oraclePublicKey: 'OtherOracle' }],
  ])('refuses to start on a %s mismatch, naming the setting', async (name, over) => {
    const svc = new ChainConfigCheckService(
      new FakeVaultClient(),
      appConfig(over as Partial<AppConfig>),
      true,
    );
    await expect(svc.assertMatches()).rejects.toThrow(
      new RegExp(`refusing to start.*${name}`),
    );
  });

  it('does not run when disabled (fake client mode)', async () => {
    const svc = new ChainConfigCheckService(
      new FakeVaultClient(),
      appConfig({ periodSeconds: 999 }),
      false,
    );
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('is disabled by default with the fake, even if env asks for anchor', async () => {
    const svc = new ChainConfigCheckService(
      new FakeVaultClient(),
      appConfig({ periodSeconds: 999 }),
    );
    await expect(svc.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
