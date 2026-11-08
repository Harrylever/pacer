import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NoPendingConfirmation } from '../common/errors';

export interface PendingAction {
  kind: string;
  summary: string;
  execute: () => Promise<string>;
  /** Renders the success reply from execute()'s result. */
  done?: (result: string) => string;
}

export interface ConfirmationCard {
  id: string;
  text: string;
  buttons: ['Confirm', 'Cancel'];
}

/** A card left untapped this long can no longer be confirmed. */
export const CARD_TTL_MS = 15 * 60 * 1000;

/**
 * Nothing is signed without an explicit Confirm tap (SPEC guardrail).
 * A pending action executes exactly once, for its own user only, and
 * only within CARD_TTL_MS of being shown.
 */
@Injectable()
export class ConfirmationService {
  private pending = new Map<
    string,
    PendingAction & { userId: string; expiresAt: number }
  >();

  /** Clock, replaceable in tests. Not a constructor parameter: Nest would try to inject it. */
  now: () => number = Date.now;

  propose(userId: string, action: PendingAction): ConfirmationCard {
    const id = randomUUID();
    this.pending.set(id, { ...action, userId, expiresAt: this.now() + CARD_TTL_MS });
    return { id, text: action.summary, buttons: ['Confirm', 'Cancel'] };
  }

  async confirm(userId: string, id: string): Promise<string> {
    return (await this.confirmWithReply(userId, id)).result;
  }

  /** Executes the card and returns its result plus the reply to show. */
  async confirmWithReply(
    userId: string,
    id: string,
  ): Promise<{ result: string; reply?: string }> {
    const entry = this.pending.get(id);
    if (!entry || entry.userId !== userId) throw new NoPendingConfirmation();
    this.pending.delete(id);
    if (this.now() > entry.expiresAt) throw new NoPendingConfirmation();
    const result = await entry.execute();
    return { result, reply: entry.done?.(result) };
  }

  cancel(userId: string, id: string): boolean {
    const entry = this.pending.get(id);
    if (!entry || entry.userId !== userId) return false;
    this.pending.delete(id);
    return true;
  }
}
