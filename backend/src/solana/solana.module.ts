import { Logger, Module } from '@nestjs/common';
import { Connection } from '@solana/web3.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VAULT_CLIENT } from '../vaults/vaults.service';
import { FakeVaultClient } from './fake-vault-client';
import {
  AnchorVaultClient,
  type DeploymentFile,
} from './anchor-vault-client';
import {
  loadSigner,
  redactRpcUrl,
  type AppConfig,
} from '../config/app-config';
import { APP_CONFIG } from '../config/config.module';
import { WalletsService } from '../wallets/wallets.service';
import { WalletsModule } from '../wallets/wallets.module';
import type { VaultClient } from './vault-client';
import { ChainConfigCheckService } from './chain-config-check.service';

/** Loads the committed deployment manifest (devnet addresses, public). */
export function loadDeployment(): DeploymentFile {
  const candidates = [
    join(__dirname, 'deployments', 'devnet.json'),
    join(__dirname, '..', 'src', 'solana', 'deployments', 'devnet.json'),
    join(process.cwd(), 'src', 'solana', 'deployments', 'devnet.json'),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error('deployments/devnet.json not found');
  return JSON.parse(readFileSync(found, 'utf8')) as DeploymentFile;
}

/**
 * Selects the VaultClient implementation: VAULT_CLIENT=anchor|fake
 * (default anchor). Signers come from loadSigner (this module only) and
 * are never logged. Only an explicit VAULT_CLIENT=fake binds the fake;
 * a failure to build the Anchor client throws and stops the app.
 */
export function createVaultClient(
  config: AppConfig,
  wallets: WalletsService,
): VaultClient {
  const logger = new Logger('SolanaModule');
  if (process.env.VAULT_CLIENT === 'fake') {
    logger.log('VAULT_CLIENT=fake; binding the in-memory client');
    return new FakeVaultClient();
  }
  // No silent fallback: if the real client can't be built, refuse to start.
  // A fake bound by accident would show users fake successes with nothing
  // on-chain. Offline development opts in with VAULT_CLIENT=fake.
  const keeper = loadSigner('keeper');
  const oracle = loadSigner('oracle');
  const gas = loadSigner('gas');
  const deployment = loadDeployment();
  logger.log(
    `VAULT_CLIENT=anchor; binding the devnet client (${deployment.programs.pacer_vault}) via ${redactRpcUrl(config.rpcUrl)}`,
  );
  return new AnchorVaultClient({
    connection: new Connection(config.rpcUrl, 'confirmed'),
    keeper,
    oracle,
    gas,
    ownerKeypair: (owner) => wallets.keypairByOwner(owner),
    deployment,
    cluster: config.cluster,
  });
}

@Module({
  imports: [WalletsModule],
  providers: [
    {
      provide: VAULT_CLIENT,
      inject: [APP_CONFIG, WalletsService],
      useFactory: (config: AppConfig, wallets: WalletsService) =>
        createVaultClient(config, wallets),
    },
    ChainConfigCheckService,
  ],
  exports: [VAULT_CLIENT],
})
export class SolanaModule {}
