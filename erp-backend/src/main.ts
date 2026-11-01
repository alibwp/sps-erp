import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  // Closes the database pool cleanly on `docker compose down`.
  app.enableShutdownHooks();

  const port = app.get(ConfigService).get<string>('PORT', '5000');
  await app.listen(port);
  Logger.log(`SPS ERP backend listening on port ${port}`, 'Bootstrap');
}
await bootstrap();
