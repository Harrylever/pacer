import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { SolanaModule } from '../solana/solana.module';
import { WalletsModule } from '../wallets/wallets.module';
import { HistoryModule } from '../history/history.module';
import { VaultsService } from './vaults.service';
import { VaultsController } from './vaults.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    SolanaModule,
    WalletsModule,
    HistoryModule,
  ],
  controllers: [VaultsController],
  providers: [VaultsService],
  exports: [VaultsService],
})
export class VaultsModule {}
