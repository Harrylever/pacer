import { Module } from '@nestjs/common';
import { SolanaModule } from '../solana/solana.module';
import { WalletsModule } from '../wallets/wallets.module';
import { HistoryModule } from '../history/history.module';
import { VaultsService } from './vaults.service';
import { VaultsController } from './vaults.controller';

@Module({
  imports: [SolanaModule, WalletsModule, HistoryModule],
  controllers: [VaultsController],
  providers: [VaultsService],
  exports: [VaultsService],
})
export class VaultsModule {}
