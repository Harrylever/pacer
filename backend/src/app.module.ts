import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AgentModule } from './agent/agent.module';
import { BotModule } from './bot/bot.module';
import { HistoryModule } from './history/history.module';
import { PricesModule } from './prices/prices.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SolanaModule } from './solana/solana.module';
// (also imported directly so AppController can read the bound VAULT_CLIENT)
import { VaultsModule } from './vaults/vaults.module';
import { WalletsModule } from './wallets/wallets.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppConfigModule,
    PrismaModule,
    AgentModule,
    BotModule,
    HistoryModule,
    PricesModule,
    SchedulerModule,
    SolanaModule,
    VaultsModule,
    WalletsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
