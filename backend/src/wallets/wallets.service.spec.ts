import { Keypair } from '@solana/web3.js';
import { WalletsService } from './wallets.service';
import { UserFacingError } from '../common/errors';
import type { PrismaService } from '../prisma/prisma.service';

const KEY = 'ab'.repeat(32);

type Row = { telegramId: string; ownerPublicKey: string; ownerSecretEnc: string | null; withdrawalAddress: string | null };

function fakePrisma(opts: { failCreate?: boolean } = {}) {
  const rows = new Map<string, Row>();
  const prisma = {
    enabled: true,
    rows,
    user: {
      create: async ({ data }: { data: Omit<Row, 'withdrawalAddress'> }) => {
        if (opts.failCreate) throw new Error('db down');
        rows.set(data.telegramId, { ...data, withdrawalAddress: null });
      },
      update: async ({ where, data }: { where: { telegramId: string }; data: Partial<Row> }) => {
        const r = rows.get(where.telegramId);
        if (!r) throw new Error('not found');
        Object.assign(r, data);
      },
      findMany: async () => [...rows.values()],
    },
  };
  return prisma as unknown as PrismaService & { rows: Map<string, Row> };
}

describe('WalletsService durability', () => {
  it('saves the encrypted owner key before handing out the wallet, and survives a restart', async () => {
    const prisma = fakePrisma();
    const before = new WalletsService(KEY, prisma);
    const w = await before.createWallet('u1');
    expect(prisma.rows.get('u1')?.ownerSecretEnc).toBeTruthy();
    expect(prisma.rows.get('u1')?.ownerSecretEnc).not.toContain(w.ownerPublicKey);
    const dest = Keypair.generate().publicKey.toBase58();
    await before.setWithdrawalAddress('u1', dest);

    // "Restart": a fresh service instance reloads from the database.
    const after = new WalletsService(KEY, prisma);
    await after.onModuleInit();
    expect(after.loadOwnerKeypair('u1').publicKey.toBase58()).toBe(w.ownerPublicKey);
    expect(after.getWithdrawalAddress('u1')).toBe(dest);
    expect(after.allOwners()).toEqual([w.ownerPublicKey]);
  });

  it('hands out no wallet when the key cannot be saved', async () => {
    const svc = new WalletsService(KEY, fakePrisma({ failCreate: true }));
    await expect(svc.createWallet('u1')).rejects.toBeInstanceOf(UserFacingError);
    expect(svc.allOwners()).toEqual([]);
  });

  it('returns the same wallet on repeat calls', async () => {
    const svc = new WalletsService(KEY, fakePrisma());
    const a = await svc.createWallet('u1');
    const b = await svc.createWallet('u1');
    expect(b.ownerPublicKey).toBe(a.ownerPublicKey);
  });

  it('refuses a malformed encryption key', async () => {
    const svc = new WalletsService('zz'.repeat(32));
    await expect(svc.createWallet('u1')).rejects.toThrow(/64 hex/);
  });
});
