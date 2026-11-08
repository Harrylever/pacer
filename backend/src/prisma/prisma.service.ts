import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Prisma 7 client (driver-adapter based). Enabled only when DATABASE_URL
 * is set: without it the backend runs on its in-memory stores so local
 * dev and tests need no database. The money itself lives on-chain; this
 * only persists Telegram ID → wallet, settings, sweeps and nudges.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  readonly enabled = Boolean(process.env.DATABASE_URL);

  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL ?? '',
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('DATABASE_URL unset; Prisma disabled (in-memory mode)');
      return;
    }
    try {
      await this.$connect();
      this.logger.log('Prisma connected');
    } catch (err) {
      // Degrade, don't crash: chain state remains the source of truth.
      this.logger.warn(
        `Prisma connect failed; continuing without DB: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.enabled) await this.$disconnect();
  }
}
