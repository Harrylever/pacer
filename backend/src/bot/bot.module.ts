import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { WalletsModule } from '../wallets/wallets.module';
import { VaultsModule } from '../vaults/vaults.module';
import { HistoryModule } from '../history/history.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BotService } from './bot.service';
import { ConfirmationService } from './confirmation.service';

@Module({
  imports: [
    AgentModule,
    WalletsModule,
    VaultsModule,
    HistoryModule,
    SchedulerModule,
    NotificationsModule,
  ],
  providers: [BotService, ConfirmationService],
  exports: [BotService, ConfirmationService],
})
export class BotModule {}
