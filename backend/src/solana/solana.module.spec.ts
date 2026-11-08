import { Keypair } from '@solana/web3.js';
import { createVaultClient, loadDeployment } from './solana.module';
import { AnchorVaultClient } from './anchor-vault-client';
import { FakeVaultClient } from './fake-vault-client';
import { loadConfig, type AppConfig } from '../config/app-config';
import type { WalletsService } from '../wallets/wallets.service';

const secret = () => JSON.stringify(Array.from(Keypair.generate().secretKey));

function cfg(): AppConfig {
  return loadConfig({
    KEEPER_SECRET_KEY: secret(),
    ORACLE_SECRET_KEY: secret(),
    GAS_SECRET_KEY: secret(),
    WALLET_ENCRYPTION_KEY: 'ab'.repeat(32),
    SOLANA_RPC_URL: 'https://api.devnet.solana.com',
  });
}

const wallets = {
  keypairByOwner: () => null,
} as unknown as WalletsService;

describe('createVaultClient selection', () => {
  const OLD = process.env.VAULT_CLIENT;
  const OLD_ENV = process.env.NODE_ENV;
  afterEach(() => {
    if (OLD === undefined) delete process.env.VAULT_CLIENT;
    else process.env.VAULT_CLIENT = OLD;
    process.env.NODE_ENV = OLD_ENV;
  });

  it('binds the fake when VAULT_CLIENT=fake', () => {
    process.env.VAULT_CLIENT = 'fake';
    expect(createVaultClient(cfg(), wallets)).toBeInstanceOf(FakeVaultClient);
  });

  it('binds the Anchor client by default (addresses from devnet.json)', () => {
    delete process.env.VAULT_CLIENT;
    const client = createVaultClient(cfg(), wallets);
    expect(client).toBeInstanceOf(AnchorVaultClient);
    expect((client as AnchorVaultClient).programId.toBase58()).toBe(
      loadDeployment().programs.pacer_vault,
    );
  });

  it('refuses to start, and does not bind the fake, when the real client cannot be built', () => {
    delete process.env.VAULT_CLIENT;
    process.env.NODE_ENV = 'development';
    const config = cfg();
    // A failed load clears the signers, as a bad .env would.
    expect(() => loadConfig({})).toThrow();
    expect(() => createVaultClient(config, wallets)).toThrow(
      /loadConfig must run/,
    );
  });
});
