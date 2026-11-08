import { Module } from '@nestjs/common';
import { SolanaModule } from '../solana/solana.module';
import { PricesService } from './prices.service';

@Module({
  imports: [SolanaModule],
  providers: [
    {
      provide: PricesService,
      useFactory: (client: unknown) =>
        new PricesService(
          client as never,
          (process.env.MAINNET_PRICE_MINTS ?? '').split(',').filter(Boolean),
          undefined,
          process.env.DEMO_REPUBLISH === 'true',
          process.env.JUPITER_API_KEY,
        ),
      inject: ['VAULT_CLIENT'],
    },
  ],
  exports: [PricesService],
})
export class PricesModule {}
