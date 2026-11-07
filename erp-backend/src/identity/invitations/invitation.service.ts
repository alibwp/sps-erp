import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager, IsNull, LessThanOrEqual, MoreThan } from 'typeorm';
import { AuditAction, AuditService } from '../../audit/audit.service.js';
import { Clock } from '../../common/clock/clock.js';
import { randomToken, sha256 } from '../../common/crypto/app-crypto.service.js';
import { TransactionService } from '../../common/database/transaction.service.js';
import { RuleViolation } from '../../common/errors/api-exception.js';
import { MailService } from '../../mail/mail.service.js';
import { AccountInvitation } from '../entities/account-invitation.entity.js';
import { User } from '../entities/user.entity.js';
import { FrontendLinks, invitationMail } from '../identity-mails.js';
import { Messages } from '../identity.constants.js';
import { PasswordHasher } from '../password-hasher.js';

export interface SentInvitation {
  invitation: AccountInvitation;
  // The plain token; it is never stored and cannot be shown again.
  token: string;
  link: string;
}

export const AUDIT_SUBJECT = {
  user: 'user',
  invitation: 'account_invitation',
} as const;

// Reference: SendAccountInvitation, AcceptAccountInvitation,
// RevokeAccountInvitation, PruneExpiredInvitations.
@Injectable()
export class InvitationService {
  private readonly logger = new Logger(InvitationService.name);
  private readonly expiresAfterHours: number;

  constructor(
    config: ConfigService,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly links: FrontendLinks,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {
    this.expiresAfterHours = Number(
      config.get('ACCOUNT_INVITATION_EXPIRY_HOURS', '72'),
    );
  }

  // Issues a new one-time link and emails it after commit. Every new
  // invitation revokes the earlier ones, so only the newest link works.
  async send(
    userId: string,
    options: { invitedById?: string | null; notify?: boolean } = {},
  ): Promise<SentInvitation> {
    const token = randomToken(48); // 64 characters
    const sent = await this.transactions.run(async (tx) => {
      const user = await tx.lockOne(User, { id: userId });
      if (!user) throw new NotFoundException('Account not found.');
      if (user.accountStatus === 'archived') {
        throw new RuleViolation(Messages.archivedInvitation);
      }

      const now = this.clock.now();
      await this.revokePending(tx.manager, user.id, now);
      const invitation = await tx.manager.save(
        tx.manager.create(AccountInvitation, {
          userId: user.id,
          invitedById: options.invitedById ?? null,
          tokenHash: sha256(token),
          expiresAt: new Date(
            now.getTime() + this.expiresAfterHours * 3_600_000,
          ),
        }),
      );

      if (user.passwordHash === null && user.accountStatus !== 'invited') {
        user.accountStatus = 'invited';
        await tx.manager.save(user);
      }

      await this.audit.record(tx.manager, {
        action: AuditAction.AccountInvitationSent,
        subject: { type: AUDIT_SUBJECT.invitation, id: invitation.id },
        context: {
          user_id: user.id,
          email: user.email,
          expires_at: invitation.expiresAt.toISOString(),
        },
        ...(options.invitedById !== undefined
          ? { actorId: options.invitedById }
          : {}),
      });

      const link = this.links.invitation(token);
      if (options.notify !== false) {
        tx.afterCommit(() =>
          this.mail.send(
            invitationMail(user.email, user.name, link, invitation.expiresAt),
          ),
        );
      }
      return { invitation, token, link };
    });
    return sent;
  }

  // The pending invitation a plain token points to, with its account.
  async findPending(token: string): Promise<AccountInvitation | null> {
    return this.transactions.run((tx) =>
      tx.manager.findOne(AccountInvitation, {
        where: this.pendingWhere(sha256(token)),
        relations: { user: true },
      }),
    );
  }

  // Sets the password and activates the account. The invitation and the
  // account are locked, so two requests cannot both use one link, and a
  // suspension sent at the same moment is never undone here.
  async accept(token: string, password: string): Promise<User> {
    const passwordHash = await this.hasher.hash(password);
    return this.transactions.run(async (tx) => {
      const invitation = await tx.manager.findOne(AccountInvitation, {
        where: this.pendingWhere(sha256(token)),
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitation) throw this.invalidInvitation();

      const user = await tx.lockOne(User, { id: invitation.userId });
      if (!user || !['invited', 'active'].includes(user.accountStatus)) {
        throw this.invalidInvitation();
      }

      const now = this.clock.now();
      const previousStatus = user.accountStatus;
      user.passwordHash = passwordHash;
      user.passwordChangeRequiredAt = null;
      user.accountStatus = 'active';
      user.emailVerifiedAt ??= now;
      await tx.manager.save(user);

      invitation.acceptedAt = now;
      await tx.manager.save(invitation);
      await this.revokePending(tx.manager, user.id, now);

      // The reference records every acceptance (AccountStatusChanged).
      await this.audit.record(tx.manager, {
        action: AuditAction.AccountStatusChanged,
        subject: { type: AUDIT_SUBJECT.user, id: user.id },
        context: { from: previousStatus, to: 'active', reason: null },
      });
      return user;
    });
  }

  // Stops every unused link of an account; returns how many were stopped.
  async revoke(userId: string, revokedById?: string | null): Promise<number> {
    return this.transactions.run(async (tx) => {
      const user = await tx.lockOne(User, { id: userId });
      if (!user) throw new NotFoundException('Account not found.');
      const revoked = await this.revokePending(
        tx.manager,
        user.id,
        this.clock.now(),
      );
      if (revoked > 0) {
        await this.audit.record(tx.manager, {
          action: AuditAction.AccountInvitationRevoked,
          subject: { type: AUDIT_SUBJECT.user, id: user.id },
          context: { revoked_count: revoked, email: user.email },
          ...(revokedById !== undefined ? { actorId: revokedById } : {}),
        });
      }
      return revoked;
    });
  }

  // Hourly: expired links are marked revoked, as the reference's
  // PruneExpiredInvitations does.
  async revokeExpired(): Promise<number> {
    const now = this.clock.now();
    const result = await this.transactions.run((tx) =>
      tx.manager.update(
        AccountInvitation,
        {
          acceptedAt: IsNull(),
          revokedAt: IsNull(),
          expiresAt: LessThanOrEqual(now),
        },
        { revokedAt: now },
      ),
    );
    const revoked = result.affected ?? 0;
    if (revoked > 0) this.logger.log(`Revoked ${revoked} expired invitations.`);
    return revoked;
  }

  private async revokePending(
    manager: EntityManager,
    userId: string,
    now: Date,
  ): Promise<number> {
    const result = await manager.update(
      AccountInvitation,
      {
        userId,
        acceptedAt: IsNull(),
        revokedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
      { revokedAt: now },
    );
    return result.affected ?? 0;
  }

  private pendingWhere(tokenHash: string) {
    return {
      tokenHash,
      acceptedAt: IsNull(),
      revokedAt: IsNull(),
      expiresAt: MoreThan(this.clock.now()),
    };
  }

  private invalidInvitation(): RuleViolation {
    return new RuleViolation(Messages.invalidInvitation, {
      token: [Messages.invalidInvitation],
    });
  }
}
