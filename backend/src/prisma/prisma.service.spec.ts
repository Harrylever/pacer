import { PrismaService } from './prisma.service';

describe('PrismaService (Prisma 7, driver adapter)', () => {
  const OLD = process.env.DATABASE_URL;
  afterEach(() => {
    process.env.DATABASE_URL = OLD;
  });

  it('is disabled without DATABASE_URL and init is a no-op', async () => {
    delete process.env.DATABASE_URL;
    const svc = new PrismaService();
    expect(svc.enabled).toBe(false);
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
    await expect(svc.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('is enabled with DATABASE_URL and exposes the generated models', () => {
    process.env.DATABASE_URL = 'postgresql://pacer:pacer@localhost:5432/pacer';
    const svc = new PrismaService();
    expect(svc.enabled).toBe(true);
    expect(svc.user).toBeDefined();
    expect(svc.vaultRecord).toBeDefined();
    expect(svc.depositSweep).toBeDefined();
  });
});
