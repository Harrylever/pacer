import { Global, Logger, Module } from '@nestjs/common';
import { buildRpcUrl, loadConfig, type AppConfig } from './app-config';

export const APP_CONFIG = 'APP_CONFIG';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => {
        try {
          return loadConfig(process.env);
        } catch (err) {
          // In production a missing or malformed signing key must stop the
          // app, not leave it running with placeholder keys.
          if (process.env.NODE_ENV === 'production') throw err;
          // Local dev / tests without secrets: placeholder public keys only.
          // Signing paths stay unavailable until real env is provided.
          new Logger('AppConfig').warn(
            `Signing keys not loaded (${(err as Error).message}); running with placeholder keys. Signing is disabled.`,
          );
          return {
            keeperPublicKey: '11111111111111111111111111111111',
            oraclePublicKey: '11111111111111111111111111111111',
            gasPublicKey: '11111111111111111111111111111111',
            periodSeconds: Number(process.env.PERIOD_SECONDS ?? 86_400),
            minTradeMicroUsdc: BigInt(
              process.env.MIN_TRADE_MICRO_USDC ?? '1000000',
            ),
            maxSlippageBps: 100,
            maxPriceAgeSecs: 600,
            demoRepublish: process.env.DEMO_REPUBLISH === 'true',
            cluster: process.env.SOLANA_CLUSTER ?? 'devnet',
            rpcUrl: buildRpcUrl(process.env),
          };
        }
      },
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
