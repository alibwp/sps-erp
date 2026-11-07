import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TransactionService } from '../../common/database/transaction.service.js';
import { RuleViolation } from '../../common/errors/api-exception.js';
import { accessDeniedMessage } from '../account-status.js';
import { User } from '../entities/user.entity.js';
import {
  AccountNotActive,
  InvalidCredentials,
  Messages,
  Unauthenticated,
  normalizeEmail,
} from '../identity.constants.js';
import { PasswordHasher } from '../password-hasher.js';
import { TwoFactorService } from '../two-factor/two-factor.service.js';
import type { ClientInfo } from './auth-context.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

export type SignInResult =
  | {
      kind: 'signed-in';
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
    }
  | { kind: 'two-factor'; challengeToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  // Only active accounts sign in. The account status is revealed only after
  // a correct password, so it cannot be probed.
  async login(
    email: string,
    password: string,
    client: ClientInfo,
  ): Promise<SignInResult> {
    const user = await this.dataSource.manager.findOne(User, {
      where: { email: normalizeEmail(email) },
    });
    if (!(await this.hasher.verify(user?.passwordHash, password)) || !user) {
      throw new InvalidCredentials();
    }
    if (user.accountStatus !== 'active') {
      throw new AccountNotActive(accessDeniedMessage(user.accountStatus));
    }

    return this.transactions.run(async (tx) => {
      if (user.twoFactorConfirmedAt) {
        const { challengeToken } = await this.sessions.createChallenge(
          tx.manager,
          user.id,
          client,
        );
        return { kind: 'two-factor', challengeToken } as const;
      }
      const { session, refreshToken } = await this.sessions.create(
        tx.manager,
        user.id,
        client,
      );
      const accessToken = await this.tokens.issue({
        sub: user.id,
        sid: session.id,
      });
      return {
        kind: 'signed-in',
        accessToken,
        refreshToken,
        expiresAt: session.expiresAt,
      } as const;
    });
  }

  // Answers a two-factor challenge with a TOTP code or an unused recovery
  // code. A wrong code keeps the challenge (attempts are rate limited).
  async answerChallenge(
    challengeToken: string,
    answer: { code?: string; recoveryCode?: string },
  ): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
    return this.transactions.run(async (tx) => {
      const session = await this.sessions.lockChallenge(
        tx.manager,
        challengeToken,
      );
      if (!session) throw new Unauthenticated(Messages.signInExpired);

      const user = await tx.manager.findOne(User, {
        where: { id: session.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new Unauthenticated(Messages.signInExpired);
      if (user.accountStatus !== 'active') {
        throw new AccountNotActive(accessDeniedMessage(user.accountStatus));
      }

      if (answer.code !== undefined) {
        if (!(await this.twoFactor.verifyCode(tx.manager, user, answer.code))) {
          throw new RuleViolation(Messages.invalidTwoFactorCode, {
            code: [Messages.invalidTwoFactorCode],
          });
        }
      } else if (
        !(await this.twoFactor.useRecoveryCode(
          tx.manager,
          user,
          answer.recoveryCode ?? '',
        ))
      ) {
        throw new RuleViolation(Messages.invalidRecoveryCode, {
          recoveryCode: [Messages.invalidRecoveryCode],
        });
      }

      const refreshToken = await this.sessions.completeChallenge(
        tx.manager,
        session,
      );
      const accessToken = await this.tokens.issue({
        sub: user.id,
        sid: session.id,
      });
      return { accessToken, refreshToken, expiresAt: session.expiresAt };
    });
  }
}
