import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { setupOpenApi } from './common/openapi/openapi.js';

// Frontend URLs allowed to call this API: CORS_ORIGIN, comma-separated.
export function corsOrigins(config: ConfigService): string[] {
  return config
    .get<string>('CORS_ORIGIN', 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((origin) => origin.trim());
}

// TRUST_PROXY: how many proxies (load balancer, CDN) sit in front of the
// backend, so rate limits see the client's IP. Unset or 0 = none.
export function trustProxy(config: ConfigService): number | boolean {
  const value = config.get<string>('TRUST_PROXY', '0').trim();
  if (value === 'true') return true;
  const hops = Number(value);
  return Number.isInteger(hops) && hops > 0 ? hops : false;
}

// OpenAPI is served everywhere except production, unless OPENAPI_ENABLED
// says otherwise.
export function openApiEnabled(config: ConfigService): boolean {
  const flag = config.get<string>('OPENAPI_ENABLED');
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return config.get<string>('NODE_ENV') !== 'production';
}

// Shared by main.ts and the e2e tests so both run the same configuration.
export function setupApp(app: INestApplication) {
  const config = app.get(ConfigService);
  app.useLogger(app.get(Logger));
  (app as NestExpressApplication).set('trust proxy', trustProxy(config));
  app.use(helmet());
  // Reads the refresh-token cookie on /api/v1/auth/*.
  app.use(cookieParser());

  // Every resource lives under /api/v1/...: the version prefix carries "api".
  // There is deliberately no global prefix: with one, Nest's 404 handler and
  // the request logger would cover /api/* only, and any other path would get
  // Express's HTML page without a request id. Unversioned routes (/, /api,
  // /api/health) spell out their full path.
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'api/v',
    defaultVersion: '1',
  });

  app.enableCors({
    origin: corsOrigins(config),
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
  });

  if (openApiEnabled(config)) setupOpenApi(app);
}
