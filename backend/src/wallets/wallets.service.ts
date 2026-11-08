import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Keypair } from '@solana/web3.js';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UserFacingError } from '../common/errors';

export const WALLET_ENCRYPTION_KEY = 'WALLET_ENCRYPTION_KEY';

export interface UserWallet {
  telegramId: string;
  ownerPublicKey: string;
}

export interface UserSettings {
  displayCurrency: 'NGN' | 'USD';
  notifyBuys: boolean;
  summaryCadence: 'weekly' | 'monthly';
}

export const DEFAULT_SETTINGS: UserSettings = {
  displayCurrency: 'NGN',
  notifyBuys: false,
  summaryCadence: 'weekly',
};

/**
 * Demo-custody fallback from the SPEC cut list: server keypairs encrypted
 * at rest (AES-256-GCM, key from env). Privy server wallets slot in behind
 * this same interface. Encrypted blobs and keys are never logged.
 *
 * The owner key is the only key that can withdraw from the user's vault, so
 * losing it strands their money. With a database configured, the encrypted
 * key is written and awaited BEFORE the user is shown their deposit address,
 * and every key is reloaded on startup. Without a database (local dev,
 * tests) keys live in memory only and a warning says so.
 */
@Injectable()
export class WalletsService implements OnModuleInit {
  private readonly logger = new Logger(WalletsService.name);
  private store = new Map<string, { blob: string; publicKey: string }>();
  private withdrawalAddresses = new Map<string, string>();
  private settings = new Map<string, UserSettings>();

  constructor(
    @Optional()
    @Inject(WALLET_ENCRYPTION_KEY)
    private readonly encryptionKeyHex?: string,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  private get durable(): boolean {
    return Boolean(this.prisma?.enabled);
  }

  async onModuleInit(): Promise<void> {
    if (!this.durable) {
      this.logger.warn(
        'No DATABASE_URL: owner keys are kept in memory only and are lost on restart (dev only)',
      );
      return;
    }
    const users = await this.prisma!.user.findMany({
      select: { telegramId: true, ownerPublicKey: true, ownerSecretEnc: true, withdrawalAddress: true, displayCurrency: true, notifyBuys: true, summaryCadence: true },
    });
    for (const u of users) {
      if (u.ownerSecretEnc) this.store.set(u.telegramId, { blob: u.ownerSecretEnc, publicKey: u.ownerPublicKey });
      if (u.withdrawalAddress) this.withdrawalAddresses.set(u.telegramId, u.withdrawalAddress);
      this.settings.set(u.telegramId, {
        displayCurrency: u.displayCurrency === 'USD' ? 'USD' : 'NGN',
        notifyBuys: u.notifyBuys,
        summaryCadence: u.summaryCadence === 'monthly' ? 'monthly' : 'weekly',
      });
    }
    this.logger.log(`Loaded ${this.store.size} owner wallet(s)`);
  }

  /** Every owner public key known to the service (used to re-register vaults on startup). */
  allOwners(): string[] {
    return [...this.store.values()].map((r) => r.publicKey);
  }

  getWithdrawalAddress(telegramId: string): string | undefined {
    return this.withdrawalAddresses.get(telegramId);
  }

  /** Owner public key for a Telegram user, if they have a wallet. */
  ownerForTelegram(telegramId: string): string | undefined {
    return this.store.get(telegramId)?.publicKey;
  }

  /** Reverse lookup: Telegram id for an owner public key. */
  telegramIdByOwner(owner: string): string | undefined {
    for (const [telegramId, rec] of this.store) {
      if (rec.publicKey === owner) return telegramId;
    }
    return undefined;
  }

  getSettings(telegramId: string): UserSettings {
    return this.settings.get(telegramId) ?? { ...DEFAULT_SETTINGS };
  }

  listUsers(): { telegramId: string; ownerPublicKey: string; settings: UserSettings }[] {
    return [...this.store.entries()].map(([telegramId, rec]) => ({
      telegramId,
      ownerPublicKey: rec.publicKey,
      settings: this.getSettings(telegramId),
    }));
  }

  async setDisplayCurrency(telegramId: string, currency: 'NGN' | 'USD'): Promise<void> {
    await this.updateSettings(telegramId, { displayCurrency: currency });
  }

  async setNotifyBuys(telegramId: string, on: boolean): Promise<void> {
    await this.updateSettings(telegramId, { notifyBuys: on });
  }

  async setSummaryCadence(telegramId: string, cadence: 'weekly' | 'monthly'): Promise<void> {
    await this.updateSettings(telegramId, { summaryCadence: cadence });
  }

  private async updateSettings(telegramId: string, patch: Partial<UserSettings>): Promise<void> {
    this.settings.set(telegramId, { ...this.getSettings(telegramId), ...patch });
    if (this.durable) {
      await this.prisma!.user.updateMany({ where: { telegramId }, data: patch as never });
    }
  }

  /**
   * Fixed at onboarding; the vault can never pay anywhere else. Set once:
   * a different address later is refused (the on-chain destination is
   * fixed at create_vault, so the bot must never show a different one).
   */
  async setWithdrawalAddress(telegramId: string, address: string): Promise<void> {
    const current = this.withdrawalAddresses.get(telegramId);
    if (current && current !== address)
      throw new UserFacingError('Your withdrawal wallet is already set and can never be changed.');
    if (this.durable) {
      await this.prisma!.user.update({ where: { telegramId }, data: { withdrawalAddress: address } });
    }
    this.withdrawalAddresses.set(telegramId, address);
  }

  private key(): Buffer {
    const hex = this.encryptionKeyHex ?? process.env.WALLET_ENCRYPTION_KEY;
    if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex))
      throw new Error('WALLET_ENCRYPTION_KEY must be 64 hex chars');
    return Buffer.from(hex, 'hex');
  }

  /**
   * Returns the user's wallet, creating it on first call. The new key is
   * persisted (when a database is configured) before this resolves; if that
   * write fails, no wallet is handed out.
   */
  async createWallet(telegramId: string): Promise<UserWallet> {
    if (!telegramId) throw new Error('missing Telegram user id');
    const existing = this.store.get(telegramId);
    if (existing) return { telegramId, ownerPublicKey: existing.publicKey };
    const kp = Keypair.generate();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const enc = Buffer.concat([cipher.update(Buffer.from(kp.secretKey)), cipher.final()]);
    const blob = [iv.toString('hex'), cipher.getAuthTag().toString('hex'), enc.toString('hex')].join(':');
    const publicKey = kp.publicKey.toBase58();
    if (this.durable) {
      try {
        await this.prisma!.user.create({ data: { telegramId, ownerPublicKey: publicKey, ownerSecretEnc: blob } });
      } catch (err) {
        this.logger.error(`could not save a new owner wallet: ${(err as Error).message}`);
        throw new UserFacingError('Something went wrong setting up your wallet. Nothing was created; please try /start again.');
      }
    }
    this.store.set(telegramId, { blob, publicKey });
    return { telegramId, ownerPublicKey: publicKey };
  }

  /** Owner keypair by owner public key (for the Anchor adapter), or null. */
  keypairByOwner(ownerPublicKey: string): Keypair | null {
    for (const [telegramId, rec] of this.store) {
      if (rec.publicKey === ownerPublicKey)
        return this.loadOwnerKeypair(telegramId);
    }
    return null;
  }

  /** Owner signing stays server-side this weekend (SPEC: demo custody). */
  loadOwnerKeypair(telegramId: string): Keypair {
    const rec = this.store.get(telegramId);
    if (!rec) throw new Error('wallet not found');
    const [ivHex, tagHex, encHex] = rec.blob.split(':');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const secret = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
    return Keypair.fromSecretKey(new Uint8Array(secret));
  }
}
