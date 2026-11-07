import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { SessionService } from './session.service.js';

// Runs before the guards on POST /auth/two-factor-challenge: finds which
// account the challenge token belongs to, so the rate limit counts code
// attempts per account (5 a minute, as the reference keys its two-factor
// limiter by login.id), however many sign-ins or addresses are used.
@Injectable()
export class TwoFactorAttemptsMiddleware implements NestMiddleware {
  constructor(private readonly sessions: SessionService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      const token = (req.body as Record<string, unknown> | undefined)
        ?.challengeToken;
      req.twoFactorAccountId =
        typeof token === 'string' && token
          ? await this.sessions.challengeAccount(token)
          : null;
      next();
    } catch (error) {
      next(error);
    }
  }
}

// The rate-limit key for a two-factor attempt: the account, or the IP for
// a token that matches no sign-in.
export function twoFactorTracker(req: Record<string, any>): string {
  return req.twoFactorAccountId
    ? `two-factor:${req.twoFactorAccountId}`
    : `two-factor:unknown:${req.ip}`;
}
