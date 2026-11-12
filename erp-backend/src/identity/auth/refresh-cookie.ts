import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { corsOrigins } from '../../setup-app.js';

export const REFRESH_COOKIE = 'sps_refresh_token';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

// httpOnly, SameSite=Lax, scoped to the auth routes; Secure everywhere but
// local development and tests.
export function refreshCookieOptions(config: ConfigService): CookieOptions {
  const env = config.get<string>('NODE_ENV', 'development');
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env !== 'development' && env !== 'test',
    path: REFRESH_COOKIE_PATH,
  };
}

// The cookie lives exactly as long as the session has left (sessions end
// 30 days after sign-in, refreshes do not extend them).
export function setRefreshCookie(
  res: Response,
  config: ConfigService,
  token: string,
  session: { expiresAt: Date; now: Date },
): void {
  const maxAge = Math.max(
    0,
    session.expiresAt.getTime() - session.now.getTime(),
  );
  res.cookie(REFRESH_COOKIE, token, {
    ...refreshCookieOptions(config),
    maxAge,
  });
}

export function clearRefreshCookie(res: Response, config: ConfigService): void {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions(config));
}

export function readRefreshCookie(req: Request): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[
    REFRESH_COOKIE
  ];
  return typeof value === 'string' ? value : undefined;
}

// The cookie travels with every request to /api/v1/auth, also ones another
// site makes the browser send. Refresh and logout therefore answer only
// requests whose Origin is one of the frontend origins (CORS_ORIGIN).
export function assertAllowedOrigin(req: Request, config: ConfigService): void {
  const origin = req.headers.origin;
  if (!origin || !corsOrigins(config).includes(origin)) {
    throw new ForbiddenException('Request origin is not allowed.');
  }
}
