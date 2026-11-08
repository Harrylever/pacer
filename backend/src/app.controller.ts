import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { AppService } from './app.service';
import { APP_CONFIG } from './config/config.module';
import type { AppConfig } from './config/app-config';
import { VAULT_CLIENT } from './vaults/vaults.service';
import type { VaultClient } from './solana/vault-client';
import { FakeVaultClient } from './solana/fake-vault-client';
import { PricesService } from './prices/prices.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Optional() @Inject(APP_CONFIG) private readonly config?: AppConfig,
    @Optional() @Inject(VAULT_CLIENT) private readonly client?: VaultClient,
    @Optional() private readonly prices?: PricesService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Live state for deploy checks. No secrets: cluster, client kind, freshness. */
  @Get('health')
  health(): {
    status: string;
    cluster: string;
    vaultClient: 'anchor' | 'fake';
    lastPriceRefreshAt: string | null;
  } {
    return {
      status: 'ok',
      cluster: this.config?.cluster ?? process.env.SOLANA_CLUSTER ?? 'devnet',
      vaultClient: this.client instanceof FakeVaultClient ? 'fake' : 'anchor',
      lastPriceRefreshAt:
        this.prices?.lastPriceRefreshAt?.toISOString() ?? null,
    };
  }
}
