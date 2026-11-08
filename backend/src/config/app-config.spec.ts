import { loadConfig } from './app-config';
import { Keypair } from '@solana/web3.js';

const secret = () => JSON.stringify(Array.from(Keypair.generate().secretKey));

describe('loadConfig', () => {
  it('throws when a signing secret is missing', () => {
    expect(() => loadConfig({})).toThrow(/KEEPER_SECRET_KEY/);
  });

  it('exposes only public keys and never serialises secrets', () => {
    const keeper = secret();
    const cfg = loadConfig({
      KEEPER_SECRET_KEY: keeper,
      ORACLE_SECRET_KEY: secret(),
      GAS_SECRET_KEY: secret(),
      WALLET_ENCRYPTION_KEY: 'ab'.repeat(32),
    });
    expect(cfg.keeperPublicKey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    const serialised = JSON.stringify(cfg, (_k, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
    expect(serialised).not.toContain(keeper);
    expect(serialised).not.toContain(
      (JSON.parse(keeper) as number[]).slice(0, 8).join(','),
    );
    expect(Object.keys(cfg)).not.toContain('keeperSecretKey');
  });

  it('defaults to the demo pace values from SPEC', () => {
    const cfg = loadConfig({
      KEEPER_SECRET_KEY: secret(),
      ORACLE_SECRET_KEY: secret(),
      GAS_SECRET_KEY: secret(),
      WALLET_ENCRYPTION_KEY: 'ab'.repeat(32),
    });
    expect(cfg.periodSeconds).toBe(86400);
    expect(cfg.minTradeMicroUsdc).toBe(1_000_000n);
  });

  it('refuses the same key for two roles (keeper must not be the oracle)', () => {
    const same = secret();
    expect(() =>
      loadConfig({ KEEPER_SECRET_KEY: same, ORACLE_SECRET_KEY: same, GAS_SECRET_KEY: secret() }),
    ).toThrow(/three different keys/);
  });
});
