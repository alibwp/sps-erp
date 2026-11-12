import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { currentRequest } from '../../common/request-context/request-context.js';
import { accessDeniedMessage } from '../account-status.js';
import {
  AccountNotActive,
  PasswordChangeRequired,
  Unauthenticated,
} from '../identity.constants.js';
import { ALLOW_DURING_PASSWORD_CHANGE, IS_PUBLIC } from './auth-context.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

// Global guard 1 of 3 (authentication, forced password change, rate limit).
// Every route needs a Bearer access token unless marked @Public(). The
// session and account are read on every request, so a revoked session
// stops at once, and an account that is no longer active gets the
// reference's message and its session is ended (EnsureAccountIsActive).
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublic(context)) return true;
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string } }>();

    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ')
      ? header.slice(7).trim()
      : undefined;
    const claims = token ? await this.tokens.verify(token) : null;
    if (!claims) throw new Unauthenticated();

    const session = await this.sessions.findForRequest(claims.sid, claims.sub);
    if (!session) throw new Unauthenticated();

    const { user } = session;
    if (user.accountStatus !== 'active') {
      await this.sessions.revoke(session.id);
      throw new AccountNotActive(accessDeniedMessage(user.accountStatus));
    }

    req.auth = { user, session };
    // Read by the rate limiter (per user) and the audit log (actor).
    req.user = { id: user.id };
    const requestContext = currentRequest();
    if (requestContext) requestContext.userId = user.id;
    return true;
  }

  private isPublic(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}

// Global guard 2 of 3. While an administrator requires a new password, only
// GET /me, PUT /me/password, refresh and logout answer.
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const auth = context.switchToHttp().getRequest<Request>().auth;
    if (!auth?.user.passwordChangeRequiredAt) return true;
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_DURING_PASSWORD_CHANGE,
      [context.getHandler(), context.getClass()],
    );
    if (!allowed) throw new PasswordChangeRequired();
    return true;
  }
}
