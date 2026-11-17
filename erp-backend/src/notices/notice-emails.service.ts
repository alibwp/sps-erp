import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import { DataSource, In } from 'typeorm';
import { MailService } from '../mail/mail.service.js';
import { MAIL_TRANSPORT } from '../mail/mail.transport.js';
import { NoticeNotificationPreference } from './entities/notice-notification-preference.entity.js';
import { NoticeRecipient } from './entities/notice-recipient.entity.js';
import { Notice } from './entities/notice.entity.js';
import { noticeText } from './notice-content.js';

export const NO_ADDRESS = 'The person has no email address.';

// The notice email job (reference SendNoticeEmails): each recipient of a
// published notice gets its text, unless they switched notice email off
// for that campus. A recipient without an address, or whose message could
// not be sent, is marked failed with the reason; they still see the
// notice. Demo accounts get nothing (MailService). The queue retries the
// job up to 3 times when it fails as a whole.
@Injectable()
export class NoticeEmails {
  private readonly logger = new Logger(NoticeEmails.name);
  private readonly from: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly mail: MailService,
    @Inject(MAIL_TRANSPORT) private readonly transport: Transporter,
    config: ConfigService,
  ) {
    this.from = config.get<string>('MAIL_FROM', 'SPS ERP <no-reply@localhost>');
  }

  async send(
    noticeId: string,
  ): Promise<{ sent: number; failed: number; skipped: number }> {
    const manager = this.dataSource.manager;
    const notice = await manager.findOne(Notice, { where: { id: noticeId } });
    const tally = { sent: 0, failed: 0, skipped: 0 };
    if (!notice || notice.status !== 'published') return tally;

    const recipients = await manager.find(NoticeRecipient, {
      where: { noticeId: notice.id },
      relations: { user: true },
      withDeleted: true,
      order: { createdAt: 'ASC' },
    });
    const switchedOff = new Set(
      (
        await manager.find(NoticeNotificationPreference, {
          where: {
            schoolId: notice.schoolId,
            userId: In(recipients.map((recipient) => recipient.userId)),
            emailEnabled: false,
          },
        })
      ).map((preference) => preference.userId),
    );
    const text = noticeText(notice.content);

    for (const recipient of recipients) {
      if (switchedOff.has(recipient.userId)) {
        tally.skipped += 1;
        continue;
      }
      const address = recipient.user?.email?.trim();
      if (!address) {
        await this.fail(recipient, NO_ADDRESS);
        tally.failed += 1;
        continue;
      }
      if (!(await this.mail.withoutDemoAccounts(address)).length) {
        tally.skipped += 1;
        continue;
      }
      try {
        await this.transport.sendMail({
          from: this.from,
          to: address,
          subject: notice.title,
          text,
        });
        tally.sent += 1;
      } catch (error) {
        // Addresses are personal data: log the recipient only.
        this.logger.warn(
          `Notice ${notice.id} email to recipient ${recipient.id} failed`,
        );
        await this.fail(
          recipient,
          error instanceof Error ? error.message : String(error),
        );
        tally.failed += 1;
      }
    }
    return tally;
  }

  private async fail(
    recipient: NoticeRecipient,
    reason: string,
  ): Promise<void> {
    await this.dataSource.manager.update(
      NoticeRecipient,
      { id: recipient.id },
      { state: 'failed', failureReason: reason.slice(0, 255) },
    );
  }
}
