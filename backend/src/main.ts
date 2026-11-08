import './load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { miniappCorsOptions } from './common/cors';
import { createAppLogger } from './common/logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: createAppLogger(),
  });
  const cors = miniappCorsOptions();
  if (cors) app.enableCors(cors);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
