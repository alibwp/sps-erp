import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock/clock.js';
import { AppCrypto } from '../../common/crypto/app-crypto.service.js';
import { TransactionService } from '../../common/database/transaction.service.js';
import { RuleViolation } from '../../common/errors/api-exception.js';
import { MailService } from '../../mail/mail.service.js';
import { User } from '../entities/user.entity.js';
import { FrontendLinks, verifyEmailMail } from '../identity-mails.js';
import { Messages } from '../identity.constants.js';

// Laravel's default (auth.verification.expire).
export const VERIFICATION_LINK_MINUTES = 60;

interface VerificationPayload {
  u: string; // user id
  e: string; // the address being verified
  x: number; // expiry, Unix seconds
}

// The link carries a signed token naming the account and the address. It
// stops working once that address is verified or changed, so it can be
// used once and needs no table.
@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly crypto: AppCrypto,
    private readonly transactions: TransactionService,
    private readonly mail: MailService,
    private readonly links: FrontendLinks,
    private readonly clock: Clock,
  ) {}

  createToken(user: Pick<User, 'id' | 'email'>): string {
    const expires =
      Math.floor(this.clock.now().getTime() / 1000) +
      VERIFICATION_LINK_MINUTES * 60;
    return this.crypto.sign({
      u: user.id,
      e: user.email,
      x: expires,
    } satisfies VerificationPayload);
  }

  // Queues the email; nothing to send for a verified address.
  async send(
    user: Pick<User, 'id' | 'email' | 'emailVerifiedAt'>,
  ): Promise<void> {
    if (user.emailVerifiedAt) return;
    await this.mail.send(
      verifyEmailMail(
        user.email,
        this.links.verifyEmail(this.createToken(user)),
      ),
    );
  }

  async verify(token: string): Promise<void> {
    const payload = this.crypto.verify<VerificationPayload>(token);
    const invalid = () =>
      new RuleViolation(Messages.invalidVerificationLink, {
        token: [Messages.invalidVerificationLink],
      });
    if (
      !payload ||
      typeof payload.u !== 'string' ||
      typeof payload.e !== 'string' ||
      typeof payload.x !== 'number' ||
      payload.x * 1000 <= this.clock.now().getTime()
    ) {
      throw invalid();
    }

    await this.transactions.run(async (tx) => {
      const user = await tx.lockOne(User, { id: payload.u });
      if (!user || user.email !== payload.e) throw invalid();
      if (user.emailVerifiedAt)
        throw new RuleViolation(Messages.alreadyVerified);
      user.emailVerifiedAt = this.clock.now();
      await tx.manager.save(user);
    });
  }
}
