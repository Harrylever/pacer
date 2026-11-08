import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import type { AppConfig } from '../config/app-config';
import { APP_CONFIG } from '../config/config.module';
import { VAULT_CLIENT } from '../vaults/vaults.service';
import type { VaultClient } from './vault-client';
import { AnchorVaultClient } from './anchor-vault-client';

/**
 * Fail-fast boot check (round 3, task 5): the on-chain GlobalConfig must
 * agree with the environment, or pace.ts's settled-allowance mirror and
 * the keeper's thresholds silently disagree with the program. Runs only
 * when the Anchor client is bound (VAULT_CLIENT != fake). Mismatches name
 * the setting, never a key.
 */
@Injectable()
export class ChainConfigCheckService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChainConfigCheckService.name);

  constructor(
    @Inject(VAULT_CLIENT) private readonly client: VaultClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() private readonly enabled?: boolean,
  ) {}

  private isEnabled(): boolean {
    // Key off the actually bound client: the fake (VAULT_CLIENT=fake) has a
    // placeholder config that would never match the environment.
    return this.enabled ?? this.client instanceof AnchorVaultClient;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.isEnabled()) return;
    await this.assertMatches();
    this.logger.log('on-chain config matches the environment');
  }

  async assertMatches(): Promise<void> {
    let chain;
    try {
      chain = await this.client.getConfig();
    } catch (err) {
      throw new Error(
        `boot config check failed: could not read the on-chain config (${(err as Error).message})`,
      );
    }
    const mismatches: string[] = [];
    if (chain.periodSeconds !== this.config.periodSeconds)
      mismatches.push(
        `PERIOD_SECONDS (env ${this.config.periodSeconds}, chain ${chain.periodSeconds})`,
      );
    if (chain.minTrade !== this.config.minTradeMicroUsdc)
      mismatches.push(
        `MIN_TRADE_MICRO_USDC (env ${this.config.minTradeMicroUsdc}, chain ${chain.minTrade})`,
      );
    if (chain.maxSlippageBps !== this.config.maxSlippageBps)
      mismatches.push(
        `MAX_SLIPPAGE_BPS (env ${this.config.maxSlippageBps}, chain ${chain.maxSlippageBps})`,
      );
    if (chain.maxPriceAgeSecs !== this.config.maxPriceAgeSecs)
      mismatches.push(
        `MAX_PRICE_AGE_SECS (env ${this.config.maxPriceAgeSecs}, chain ${chain.maxPriceAgeSecs})`,
      );
    if (chain.keeper !== this.config.keeperPublicKey)
      mismatches.push('KEEPER_SECRET_KEY (public key does not match the on-chain keeper)');
    if (chain.oracleAuthority !== this.config.oraclePublicKey)
      mismatches.push('ORACLE_SECRET_KEY (public key does not match the on-chain oracle)');
    if (mismatches.length > 0) {
      throw new Error(
        `boot config check failed, refusing to start: ${mismatches.join('; ')}`,
      );
    }
  }
}
