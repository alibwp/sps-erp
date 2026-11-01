import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppService } from './app.service.js';

// Shared by main.ts and the e2e tests so both run the same configuration.
export function setupApp(app: INestApplication) {
  const config = app.get(ConfigService);
  const appService = app.get(AppService);
  const httpAdapter = app.getHttpAdapter();

  app.setGlobalPrefix('api');
  // The bare backend URL answers with the same status message as /api.
  httpAdapter.get('/', (_req: unknown, res: unknown) => {
    httpAdapter.reply(res, appService.getStatus(), 200);
  });

  // Comma-separated list of frontend URLs allowed to call this API.
  app.enableCors({
    origin: config
      .get<string>(
        'CORS_ORIGIN',
        'http://localhost:3000,http://127.0.0.1:3000',
      )
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  });
}
