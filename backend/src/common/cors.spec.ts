import { Test } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { miniappCorsOptions, miniappOrigins } from './cors';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

describe('Mini App CORS', () => {
  it('parses origins and never uses *', () => {
    expect(miniappOrigins({ MINIAPP_ORIGIN: ' https://a.example ,https://b.example ' } as never)).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(miniappCorsOptions({} as never)).toBeNull();
    expect(miniappCorsOptions({ MINIAPP_ORIGIN: '' } as never)).toBeNull();
  });

  async function appWith(originEnv: string) {
    const mod = await Test.createTestingModule({
      controllers: [PingController],
    }).compile();
    const app: INestApplication = mod.createNestApplication();
    const opts = miniappCorsOptions({ MINIAPP_ORIGIN: originEnv } as never);
    if (opts) app.enableCors(opts);
    await app.init();
    return app;
  }

  it('allows a listed origin and not a different one', async () => {
    const app = await appWith('https://mini.example');
    const allowed = await request(app.getHttpServer())
      .get('/ping')
      .set('Origin', 'https://mini.example');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://mini.example',
    );
    const denied = await request(app.getHttpServer())
      .get('/ping')
      .set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});
