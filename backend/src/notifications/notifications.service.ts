import { Injectable, Logger } from '@nestjs/common';

export type NotificationSender = (
  telegramId: string,
  text: string,
) => Promise<void>;

/**
 * Outbound Telegram messages, decoupled from the bot: BotService registers
 * the grammY sender on startup, background jobs send through here. This
 * keeps SchedulerModule free of any BotModule import (no cycle). A failed
 * send is logged and swallowed — it must never break a sweep or a buy.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private sender?: NotificationSender;

  registerSender(sender: NotificationSender): void {
    this.sender = sender;
  }

  async send(telegramId: string, text: string): Promise<boolean> {
    if (!this.sender) return false;
    try {
      await this.sender(telegramId, text);
      return true;
    } catch (err) {
      this.logger.warn(`notification failed: ${(err as Error).message}`);
      return false;
    }
  }
}
