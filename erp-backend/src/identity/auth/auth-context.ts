import {
  ExecutionContext,
  SetMetadata,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthSession } from '../entities/auth-session.entity.js';
import type { User } from '../entities/user.entity.js';

// The signed-in person and the session the request belongs to.
export interface AuthContext {
  user: User;
  session: AuthSession;
}

declare module 'express' {
  interface Request {
    auth?: AuthContext;
    // Set on POST /auth/two-factor-challenge (TwoFactorAttemptsMiddleware).
    twoFactorAccountId?: string | null;
  }
}

export const IS_PUBLIC = 'identity:public';
export const ALLOW_DURING_PASSWORD_CHANGE =
  'identity:allow-during-password-change';

// No access token needed (sign-in, refresh, links from emails, health).
export const Public = () => SetMetadata(IS_PUBLIC, true);

// Reachable while the person must still choose a new password.
export const AllowDuringPasswordChange = () =>
  SetMetadata(ALLOW_DURING_PASSWORD_CHANGE, true);

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthContext => {
    const auth = context.switchToHttp().getRequest<Request>().auth;
    if (!auth) throw new Error('CurrentAuth used on a public route');
    return auth;
  },
);

// Where the request came from, for the sessions list.
export interface ClientInfo {
  ipAddress: string | null;
  userAgent: string | null;
}

export const Client = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ClientInfo => {
    const req = context.switchToHttp().getRequest<Request>();
    const userAgent = req.headers['user-agent'];
    return {
      ipAddress: req.ip ?? null,
      userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 512) : null,
    };
  },
);
