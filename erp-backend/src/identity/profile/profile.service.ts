import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditAction, AuditService } from '../../audit/audit.service.js';
import { Clock } from '../../common/clock/clock.js';
import { randomToken } from '../../common/crypto/app-crypto.service.js';
import { TransactionService } from '../../common/database/transaction.service.js';
import {
  RuleViolation,
  ValidationFailed,
} from '../../common/errors/api-exception.js';
import { detectFileType } from '../../common/files/file-type.js';
import { EmailDomainChecker } from '../../common/validation/email-domain.js';
import { StorageService } from '../../storage/storage.service.js';
import { SessionService } from '../auth/session.service.js';
import { EmailVerificationService } from '../email-verification/email-verification.service.js';
import { User } from '../entities/user.entity.js';
import { Messages, normalizeEmail } from '../identity.constants.js';
import { AUDIT_SUBJECT } from '../invitations/invitation.service.js';
import { PasswordHasher } from '../password-hasher.js';
import type { UpdateProfileDto } from '../identity.dto.js';

// Plan Files table (reference: mimes:jpg,jpeg,png, max:3000 kilobytes).
export const PHOTO_MAX_BYTES = 3000 * 1024;
export const PHOTO_URL_SECONDS = 15 * 60;

const PROFILE_FIELDS = [
  'name',
  'birthday',
  'gender',
  'phone',
  'address',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
  'nationality',
] as const;

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly sessions: SessionService,
    private readonly verification: EmailVerificationService,
    private readonly emailDomains: EmailDomainChecker,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async photoUrl(user: User): Promise<string | null> {
    if (!user.profilePhotoPath) return null;
    return this.storage.signedUrl(user.profilePhotoPath, {
      expiresInSeconds: PHOTO_URL_SECONDS,
    });
  }

  // Changes only the fields sent. A new email address clears verification
  // and sends a verification link after commit.
  async update(userId: string, changes: UpdateProfileDto): Promise<User> {
    if (changes.birthday && changes.birthday >= this.clock.schoolToday('UTC')) {
      throw new ValidationFailed({
        birthday: ['The birthday field must be a date before today.'],
      });
    }
    const newEmail =
      changes.email === undefined ? undefined : normalizeEmail(changes.email);
    if (newEmail !== undefined) {
      const current = await this.dataSource.manager.findOne(User, {
        where: { id: userId },
      });
      // The domain is checked only when the address changes, as the
      // reference does.
      if (
        current &&
        current.email !== newEmail &&
        !(await this.emailDomains.canReceiveMail(newEmail))
      ) {
        throw new ValidationFailed({ email: [Messages.emailInvalid] });
      }
    }

    return this.transactions.run(async (tx) => {
      const user = await tx.lockOne(User, { id: userId });
      if (!user) throw new Error(`User ${userId} not found`);

      for (const field of PROFILE_FIELDS) {
        if (changes[field] !== undefined)
          (user as unknown as Record<string, unknown>)[field] = changes[field];
      }

      if (newEmail !== undefined && newEmail !== user.email) {
        const taken = await tx.manager.exists(User, {
          where: { email: newEmail },
          withDeleted: true,
        });
        if (taken) throw new ValidationFailed({ email: [Messages.emailTaken] });
        user.email = newEmail;
        user.emailVerifiedAt = null;
        tx.afterCommit(() => this.verification.send(user));
      }
      return tx.manager.save(user);
    });
  }

  // Stores a jpg or png (checked by content) and deletes the old file after
  // commit.
  async setPhoto(userId: string, content: Buffer | undefined): Promise<User> {
    if (!content || content.length === 0) {
      throw new ValidationFailed({ photo: ['The photo field is required.'] });
    }
    if (content.length > PHOTO_MAX_BYTES) {
      throw new ValidationFailed({
        photo: ['The photo field must not be greater than 3000 kilobytes.'],
      });
    }
    const type = detectFileType(content);
    if (!type) {
      throw new ValidationFailed({
        photo: ['The photo field must be a file of type: jpg, jpeg, png.'],
      });
    }

    const key = `users/${userId}/photo-${randomToken(12)}.${type.extension}`;
    await this.storage.put(key, content, { contentType: type.mime });
    try {
      return await this.replacePhoto(userId, key);
    } catch (error) {
      await this.deleteFile(key);
      throw error;
    }
  }

  removePhoto(userId: string): Promise<User> {
    return this.replacePhoto(userId, null);
  }

  // Requires the current password; ends every other session. Clears a
  // forced password change.
  async changePassword(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    password: string,
  ): Promise<void> {
    const user = await this.dataSource.manager.findOne(User, {
      where: { id: userId },
    });
    if (
      !user ||
      !(await this.hasher.verify(user.passwordHash, currentPassword))
    ) {
      throw new RuleViolation(Messages.wrongCurrentPassword, {
        currentPassword: [Messages.wrongCurrentPassword],
      });
    }
    const passwordHash = await this.hasher.hash(password);

    await this.transactions.run(async (tx) => {
      const locked = await tx.lockOne(User, { id: userId });
      if (!locked) throw new Error(`User ${userId} not found`);
      locked.passwordHash = passwordHash;
      locked.passwordChangeRequiredAt = null;
      await tx.manager.save(locked);
      await this.sessions.revokeAllForUser(
        tx.manager,
        userId,
        currentSessionId,
      );
      await this.audit.record(tx.manager, {
        action: AuditAction.AccountPasswordChanged,
        subject: { type: AUDIT_SUBJECT.user, id: userId },
        context: { email: locked.email, force_reset: false },
      });
    });
  }

  private replacePhoto(userId: string, key: string | null): Promise<User> {
    return this.transactions.run(async (tx) => {
      const user = await tx.lockOne(User, { id: userId });
      if (!user) throw new Error(`User ${userId} not found`);
      const previous = user.profilePhotoPath;
      user.profilePhotoPath = key;
      const saved = await tx.manager.save(user);
      if (previous && previous !== key)
        tx.afterCommit(() => this.deleteFile(previous));
      return saved;
    });
  }

  private async deleteFile(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn(
        `Could not delete ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
