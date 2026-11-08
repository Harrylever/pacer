import { Module } from '@nestjs/common';
import { SolanaModule } from '../solana/solana.module';
import { VaultsModule } from '../vaults/vaults.module';
import { PricesModule } from '../prices/prices.module';
import { WalletsModule } from '../wallets/wallets.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HistoryModule } from '../history/history.module';
import { KeeperService } from './keeper.service';
import { JobsService } from './jobs.service';

@Module({
  imports: [SolanaModule, VaultsModule, PricesModule, WalletsModule, NotificationsModule, HistoryModule],
  providers: [KeeperService, JobsService],
  exports: [KeeperService, JobsService],
})
export class SchedulerModule {}
