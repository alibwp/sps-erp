import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';
import type { EntityManager } from 'typeorm';
import { Clock } from '../../common/clock/clock.js';
import {
  AppCrypto,
  safeEqual,
  sha256,
} from '../../common/crypto/app-crypto.service.js';
import { TransactionService } from '../../common/database/transaction.service.js';
import { RuleViolation } from '../../common/errors/api-exception.js';
import { User } from '../entities/user.entity.js';
import { APP_NAME } from '../identity-mails.js';
import { Messages } from '../identity.constants.js';

// Fortify's defaults: 8 recovery codes, each two 10-character parts.
const RECOVERY_CODE_COUNT = 8;
const CODE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
// One time step either side, as Fortify's default window of 1.
const TOLERANCE_SECONDS = 30;

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  recoveryCodes: string[];
}

export interface TwoFactorStatus {
  enabled: boolean;
  confirmed: boolean;
  recoveryCodesRemaining: number;
}

function randomPart(length: number): string {
  let part = '';
  for (let i = 0; i < length; i++)
    part += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return part;
}

export function generateRecoveryCodes(): string[] {
  return Array.from(
    { length: RECOVERY_CODE_COUNT },
    () => `${randomPart(10)}-${randomPart(10)}`,
  );
}

// The secret, its otpauth:// URL and the recovery codes are returned only
// when created (enable, regenerate). The secret is stored encrypted, the
// codes as SHA-256 hashes, so neither can be shown again.
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly transactions: TransactionService,
    private readonly crypto: AppCrypto,
    private readonly clock: Clock,
  ) {}

  status(user: User): TwoFactorStatus {
    return {
      enabled: user.twoFactorSecret !== null,
      confirmed: user.twoFactorConfirmedAt !== null,
      recoveryCodesRemaining: user.twoFactorRecoveryCodes?.length ?? 0,
    };
  }

  // Starts setup: new secret and codes. Calling it again before the setup
  // is confirmed starts over with a new secret.
  async enable(userId: string): Promise<TwoFactorSetup> {
    return this.transactions.run(async (tx) => {
      const user = await this.lockUser(tx.manager, userId);
      if (user.twoFactorConfirmedAt) {
        throw new RuleViolation(
          'Two-factor authentication is already enabled.',
        );
      }
      const secret = generateSecret();
      const recoveryCodes = generateRecoveryCodes();
      user.twoFactorSecret = this.crypto.encrypt(secret);
      user.twoFactorRecoveryCodes = recoveryCodes.map(sha256);
      user.twoFactorConfirmedAt = null;
      user.twoFactorLastTimeStep = null;
      await tx.manager.save(user);
      return {
        secret,
        otpauthUrl: generateURI({
          issuer: APP_NAME,
          label: user.email,
          secret,
        }),
        recoveryCodes,
      };
    });
  }

  // A valid code from the authenticator app switches two-factor on.
  async confirm(userId: string, code: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const user = await this.lockUser(tx.manager, userId);
      if (
        !user.twoFactorSecret ||
        !(await this.verifyCode(tx.manager, user, code))
      ) {
        throw new RuleViolation(Messages.invalidTwoFactorCode, {
          code: [Messages.invalidTwoFactorCode],
        });
      }
      user.twoFactorConfirmedAt ??= this.clock.now();
      await tx.manager.save(user);
    });
  }

  async regenerateRecoveryCodes(userId: string): Promise<string[]> {
    return this.transactions.run(async (tx) => {
      const user = await this.lockUser(tx.manager, userId);
      if (!user.twoFactorSecret) {
        throw new RuleViolation('Two-factor authentication is not enabled.');
      }
      const recoveryCodes = generateRecoveryCodes();
      user.twoFactorRecoveryCodes = recoveryCodes.map(sha256);
      await tx.manager.save(user);
      return recoveryCodes;
    });
  }

  async disable(userId: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const user = await this.lockUser(tx.manager, userId);
      user.twoFactorSecret = null;
      user.twoFactorRecoveryCodes = null;
      user.twoFactorConfirmedAt = null;
      user.twoFactorLastTimeStep = null;
      await tx.manager.save(user);
    });
  }

  // Checks a TOTP code and records its time step, so the same code (or an
  // older one) is refused afterwards. The user row must be locked.
  async verifyCode(
    manager: EntityManager,
    user: User,
    code: string,
  ): Promise<boolean> {
    if (!user.twoFactorSecret || !/^\d{6}$/.test(code.trim())) return false;
    const result = await verify({
      secret: this.crypto.decrypt(user.twoFactorSecret),
      token: code.trim(),
      epoch: Math.floor(this.clock.now().getTime() / 1000),
      epochTolerance: TOLERANCE_SECONDS,
      ...(user.twoFactorLastTimeStep !== null
        ? { afterTimeStep: user.twoFactorLastTimeStep }
        : {}),
    });
    if (!result.valid || !('timeStep' in result)) return false;
    user.twoFactorLastTimeStep = result.timeStep;
    await manager.save(user);
    return true;
  }

  // Uses up one recovery code. The user row must be locked.
  async useRecoveryCode(
    manager: EntityManager,
    user: User,
    code: string,
  ): Promise<boolean> {
    const hashes = user.twoFactorRecoveryCodes ?? [];
    const presented = sha256(code.trim());
    const index = hashes.findIndex((hash) => safeEqual(hash, presented));
    if (index === -1) return false;
    user.twoFactorRecoveryCodes = hashes.filter((_, i) => i !== index);
    await manager.save(user);
    return true;
  }

  private async lockUser(
    manager: EntityManager,
    userId: string,
  ): Promise<User> {
    const user = await manager.findOne(User, {
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) throw new Error(`User ${userId} not found`);
    return user;
  }
}
