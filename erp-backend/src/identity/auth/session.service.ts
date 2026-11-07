import { Injectable } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  IsNull,
  LessThan,
  MoreThan,
  Not,
} from 'typeorm';
import { Clock } from '../../common/clock/clock.js';
import {
  randomToken,
  safeEqual,
  sha256,
} from '../../common/crypto/app-crypto.service.js';
import { TransactionService } from '../../common/database/transaction.service.js';
import { AuthSession } from '../entities/auth-session.entity.js';
import { User } from '../entities/user.entity.js';
import type { ClientInfo } from './auth-context.js';

export const SESSION_LIFETIME_MS = 30 * 24 * 3_600_000;
export const REFRESH_GRACE_MS = 30_000;
export const CHALLENGE_LIFETIME_MS = 5 * 60_000;
export const PASSWORD_CONFIRMATION_MS = 3 * 3_600_000; // reference password_timeout 10800

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// A refresh token is "<session id>.<256 random bits>". Only the SHA-256 of
// the random part is stored.
export function parseRefreshToken(
  token: string | undefined,
): { sessionId: string; secret: string } | null {
  if (!token) return null;
  const [sessionId, secret, extra] = token.split('.');
  if (extra !== undefined || !sessionId || !secret) return null;
  if (!UUID.test(sessionId) || !/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
  return { sessionId, secret };
}

export type RefreshOutcome =
  // The current token: a new refresh token replaces it.
  | { kind: 'rotated'; session: AuthSession; user: User; refreshToken: string }
  // The previous token within 30 s of rotation (two tabs, a lost
  // response): a new access token only, no rotation, no cookie.
  | { kind: 'grace'; session: AuthSession; user: User }
  // An inactive account: the session was revoked.
  | { kind: 'inactive'; user: User }
  // Unknown, expired, revoked or reused token (a reused one revokes the
  // session).
  | { kind: 'refused' };

export interface SessionSummary {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: Date;
  createdAt: Date;
  current: boolean;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly clock: Clock,
  ) {}

  // A signed-in session with its refresh token.
  async create(
    manager: EntityManager,
    userId: string,
    client: ClientInfo,
  ): Promise<{ session: AuthSession; refreshToken: string }> {
    const secret = randomToken(32);
    const now = this.clock.now();
    const session = await manager.save(
      manager.create(AuthSession, {
        userId,
        refreshTokenHash: sha256(secret),
        userAgent: client.userAgent,
        ipAddress: client.ipAddress,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
      }),
    );
    return { session, refreshToken: `${session.id}.${secret}` };
  }

  // A pending session waiting for the two-factor code. It cannot refresh
  // and is not listed until the challenge is answered.
  async createChallenge(
    manager: EntityManager,
    userId: string,
    client: ClientInfo,
  ): Promise<{ session: AuthSession; challengeToken: string }> {
    const challengeToken = randomToken(32);
    const now = this.clock.now();
    const session = await manager.save(
      manager.create(AuthSession, {
        userId,
        challengeTokenHash: sha256(challengeToken),
        challengeExpiresAt: new Date(now.getTime() + CHALLENGE_LIFETIME_MS),
        userAgent: client.userAgent,
        ipAddress: client.ipAddress,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
      }),
    );
    return { session, challengeToken };
  }

  // The pending session a challenge token belongs to, locked; null when
  // unknown, used or older than 5 minutes.
  async lockChallenge(
    manager: EntityManager,
    challengeToken: string,
  ): Promise<AuthSession | null> {
    return manager.findOne(AuthSession, {
      where: {
        challengeTokenHash: sha256(challengeToken),
        challengeExpiresAt: MoreThan(this.clock.now()),
        revokedAt: IsNull(),
      },
      lock: { mode: 'pessimistic_write' },
    });
  }

  // The account a challenge token was issued to, expired or not (for the
  // per-account limit on code attempts); null for an unknown token.
  async challengeAccount(challengeToken: string): Promise<string | null> {
    const session = await this.dataSource.manager.findOne(AuthSession, {
      where: { challengeTokenHash: sha256(challengeToken) },
      select: { id: true, userId: true },
    });
    return session?.userId ?? null;
  }

  // Turns a pending session into a signed-in one (single use). The 30 days
  // start here: this is when a two-factor sign-in completes.
  async completeChallenge(
    manager: EntityManager,
    session: AuthSession,
  ): Promise<string> {
    const secret = randomToken(32);
    const now = this.clock.now();
    session.challengeTokenHash = null;
    session.challengeExpiresAt = null;
    session.refreshTokenHash = sha256(secret);
    session.lastUsedAt = now;
    session.expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
    await manager.save(session);
    return `${session.id}.${secret}`;
  }

  async refresh(
    token: string | undefined,
    client: ClientInfo,
  ): Promise<RefreshOutcome> {
    const parsed = parseRefreshToken(token);
    if (!parsed) return { kind: 'refused' };

    return this.transactions.run(async (tx) => {
      const session = await tx.lockOne(AuthSession, { id: parsed.sessionId });
      const now = this.clock.now();
      if (
        !session ||
        session.revokedAt ||
        !session.refreshTokenHash ||
        session.expiresAt.getTime() <= now.getTime()
      ) {
        return { kind: 'refused' } as const;
      }

      const user = await tx.manager.findOne(User, {
        where: { id: session.userId },
      });
      const presented = sha256(parsed.secret);
      const isCurrent = safeEqual(presented, session.refreshTokenHash);
      const withinGrace =
        !isCurrent &&
        session.previousRefreshTokenHash !== null &&
        session.rotatedAt !== null &&
        safeEqual(presented, session.previousRefreshTokenHash) &&
        now.getTime() - session.rotatedAt.getTime() <= REFRESH_GRACE_MS;

      if (!user || (!isCurrent && !withinGrace)) {
        // Unknown account, or a token used again after the grace period:
        // someone else may hold it, so the whole session ends.
        await this.revokeSession(tx.manager, session);
        return { kind: 'refused' } as const;
      }
      if (user.accountStatus !== 'active') {
        await this.revokeSession(tx.manager, session);
        return { kind: 'inactive', user } as const;
      }

      session.lastUsedAt = now;
      session.ipAddress = client.ipAddress;
      session.userAgent = client.userAgent ?? session.userAgent;
      if (withinGrace) {
        await tx.manager.save(session);
        return { kind: 'grace', session, user } as const;
      }

      const secret = randomToken(32);
      session.previousRefreshTokenHash = session.refreshTokenHash;
      session.refreshTokenHash = sha256(secret);
      session.rotatedAt = now;
      // expiresAt stays as set at sign-in: a session ends 30 days after
      // sign-in, however often it is refreshed.
      await tx.manager.save(session);
      return {
        kind: 'rotated',
        session,
        user,
        refreshToken: `${session.id}.${secret}`,
      } as const;
    });
  }

  // The session of a refresh token whose secret matches (current or the
  // previous one within the grace period), for logout.
  async findByRefreshToken(
    token: string | undefined,
  ): Promise<AuthSession | null> {
    const parsed = parseRefreshToken(token);
    if (!parsed) return null;
    const session = await this.dataSource.manager.findOne(AuthSession, {
      where: { id: parsed.sessionId },
    });
    if (!session) return null;
    const presented = sha256(parsed.secret);
    const matches =
      (session.refreshTokenHash !== null &&
        safeEqual(presented, session.refreshTokenHash)) ||
      (session.previousRefreshTokenHash !== null &&
        safeEqual(presented, session.previousRefreshTokenHash));
    return matches ? session : null;
  }

  // The session an access token names, with its account, when it is still
  // a signed-in session (not revoked, not pending, not expired).
  async findForRequest(
    sessionId: string,
    userId: string,
  ): Promise<AuthSession | null> {
    const session = await this.dataSource.manager.findOne(AuthSession, {
      where: {
        id: sessionId,
        userId,
        revokedAt: IsNull(),
        refreshTokenHash: Not(IsNull()),
        expiresAt: MoreThan(this.clock.now()),
      },
      relations: { user: true },
    });
    return session?.user && !session.user.deletedAt ? session : null;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const session = await tx.lockOne(AuthSession, { id: sessionId });
      if (session) await this.revokeSession(tx.manager, session);
    });
  }

  // Ends every session of an account, or every other one; returns how many.
  async revokeAllForUser(
    manager: EntityManager,
    userId: string,
    exceptSessionId?: string,
  ): Promise<number> {
    const result = await manager.update(
      AuthSession,
      {
        userId,
        revokedAt: IsNull(),
        ...(exceptSessionId ? { id: Not(exceptSessionId) } : {}),
      },
      { revokedAt: this.clock.now() },
    );
    return result.affected ?? 0;
  }

  async list(
    userId: string,
    currentSessionId: string,
  ): Promise<SessionSummary[]> {
    const sessions = await this.dataSource.manager.find(AuthSession, {
      where: {
        userId,
        revokedAt: IsNull(),
        refreshTokenHash: Not(IsNull()),
        expiresAt: MoreThan(this.clock.now()),
      },
      order: { lastUsedAt: 'DESC' },
    });
    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      lastUsedAt: session.lastUsedAt,
      createdAt: session.createdAt,
      current: session.id === currentSessionId,
    }));
  }

  async confirmPassword(sessionId: string): Promise<void> {
    await this.dataSource.manager.update(
      AuthSession,
      { id: sessionId },
      { passwordConfirmedAt: this.clock.now() },
    );
  }

  hasRecentPasswordConfirmation(session: AuthSession): boolean {
    return (
      session.passwordConfirmedAt !== null &&
      this.clock.now().getTime() - session.passwordConfirmedAt.getTime() <
        PASSWORD_CONFIRMATION_MS
    );
  }

  // Hourly: pending two-factor sessions older than 5 minutes (their
  // challenge has expired) are deleted.
  async deleteStalePending(): Promise<number> {
    const result = await this.dataSource.manager.delete(AuthSession, {
      refreshTokenHash: IsNull(),
      challengeExpiresAt: LessThan(this.clock.now()),
    });
    return result.affected ?? 0;
  }

  private async revokeSession(
    manager: EntityManager,
    session: AuthSession,
  ): Promise<void> {
    if (session.revokedAt) return;
    session.revokedAt = this.clock.now();
    await manager.save(session);
  }
}
