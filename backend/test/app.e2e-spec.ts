import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET)', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.cluster).toBeDefined();
    expect(['anchor', 'fake']).toContain(res.body.vaultClient);
    expect(res.body).toHaveProperty('lastPriceRefreshAt');
    expect(JSON.stringify(res.body)).not.toMatch(/SECRET|TOKEN/);
  });

  it('/history/compare shows the ₦20k past-performance example', async () => {
    const res = await request(app.getHttpServer())
      .get('/history/compare?amountNgn=20000')
      .expect(200);
    expect(res.body.disclaimer).toBe(
      'Past performance. Not a prediction or a promise.',
    );
    expect(res.body.usdc.endNgn).toBeGreaterThan(48_000);
    expect(res.body.sp500.endNgn).toBeGreaterThan(84_000);
  });

  afterEach(async () => {
    await app.close();
  });
});
