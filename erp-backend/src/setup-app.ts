import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { setupOpenApi } from './common/openapi/openapi.js';

// The live frontend. It calls the API through its own /api proxy, so the
// browser's Origin reaching refresh and logout is this one.
export const LIVE_FRONTEND_ORIGIN = 'https://sps-erp-phi.vercel.app';

const LOCAL_FRONTEND_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

// Frontend origins allowed to call this API: CORS_ORIGIN, comma-separated.
// Unset, the local frontend is allowed, or in production the live one. The
// origin of FRONTEND_URL (where the emailed links lead) is always allowed.
export function corsOrigins(config: ConfigService): string[] {
  const configured = config.get<string>('CORS_ORIGIN')?.trim();
  const origins = configured
    ? configured.split(',').map((origin) => origin.trim())
    : config.get<string>('NODE_ENV') === 'production'
      ? [LIVE_FRONTEND_ORIGIN]
      : LOCAL_FRONTEND_ORIGINS;
  const frontend = originOf(config.get<string>('FRONTEND_URL'));
  return [...new Set([...origins, ...(frontend ? [frontend] : [])])].filter(
    Boolean,
  );
}

function originOf(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).origin;
  } catch {
    return null;
  }
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
