import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  // Start-up messages wait until the JSON logger is ready.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  setupApp(app);
  // Closes the database pool, Redis and the queue workers cleanly on
  // `docker compose down`.
  app.enableShutdownHooks();

  const port = app.get(ConfigService).get<string>('PORT', '5000');
  await app.listen(port);
  app.get(Logger).log(`SPS ERP backend listening on port ${port}`, 'Bootstrap');
}
await bootstrap();
