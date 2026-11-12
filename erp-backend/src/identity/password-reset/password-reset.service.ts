import { Injectable, Logger } from '@nestjs/common';
import { DataSource, IsNull, MoreThan } from 'typeorm';
import { Clock } from '../../common/clock/clock.js';
import { randomToken, sha256 } from '../../common/crypto/app-crypto.service.js';
import { TransactionService } from '../../common/database/transaction.service.js';
import { RuleViolation } from '../../common/errors/api-exception.js';
import { MailService } from '../../mail/mail.service.js';
import { SessionService } from '../auth/session.service.js';
import { PasswordResetToken } from '../entities/password-reset-token.entity.js';
import { User } from '../entities/user.entity.js';
import { FrontendLinks, resetPasswordMail } from '../identity-mails.js';
import { Messages, normalizeEmail } from '../identity.constants.js';
import { PasswordHasher } from '../password-hasher.js';

// Laravel's password broker settings (config/auth.php): links expire after
// 60 minutes and an account gets at most one email a minute.
export const RESET_TOKEN_MINUTES = 60;
export const RESET_THROTTLE_MS = 60_000;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly mail: MailService,
    private readonly links: FrontendLinks,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
  ) {}

  // Never says whether the email has an account: the caller answers 202
  // either way. The email is queued after commit without waiting, so a
  // known address takes as long as an unknown one, even while Redis is
  // down; a failure is logged.
  async requestReset(email: string): Promise<void> {
    const user = await this.dataSource.manager.findOne(User, {
      where: { email: normalizeEmail(email) },
    });
    if (!user) return;

    await this.transactions.run(async (tx) => {
      await tx.lockOne(User, { id: user.id });
      const now = this.clock.now();
      const latest = await tx.manager.findOne(PasswordResetToken, {
        where: { userId: user.id },
        order: { createdAt: 'DESC' },
      });
      if (
        latest &&
        now.getTime() - latest.createdAt.getTime() < RESET_THROTTLE_MS
      )
        return;

      await tx.manager.delete(PasswordResetToken, { userId: user.id });
      const token = randomToken(32);
      await tx.manager.save(
        tx.manager.create(PasswordResetToken, {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(now.getTime() + RESET_TOKEN_MINUTES * 60_000),
          createdAt: now,
        }),
      );

      const message = resetPasswordMail(
        user.email,
        this.links.resetPassword(token),
        RESET_TOKEN_MINUTES,
      );
      tx.afterCommit(() => {
        void this.mail.send(message).catch((error: unknown) => {
          this.logger.warn(
            `Password reset email for account ${user.id} not queued: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      });
    });
  }

  // Sets the new password, uses up the token and ends every session.
  async reset(token: string, password: string): Promise<void> {
    const passwordHash = await this.hasher.hash(password);
    await this.transactions.run(async (tx) => {
      const record = await tx.manager.findOne(PasswordResetToken, {
        where: {
          tokenHash: sha256(token),
          usedAt: IsNull(),
          expiresAt: MoreThan(this.clock.now()),
        },
        lock: { mode: 'pessimistic_write' },
      });
      const user = record
        ? await tx.lockOne(User, { id: record.userId })
        : null;
      if (!record || !user) {
        throw new RuleViolation(Messages.invalidResetToken, {
          token: [Messages.invalidResetToken],
        });
      }

      user.passwordHash = passwordHash;
      user.passwordChangeRequiredAt = null;
      await tx.manager.save(user);
      record.usedAt = this.clock.now();
      await tx.manager.save(record);
      await this.sessions.revokeAllForUser(tx.manager, user.id);
    });
  }
}
