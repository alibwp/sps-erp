import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MailMessage } from '../mail/mail.service.js';

export const APP_NAME = 'SPS ERP';

// Pages of the frontend that the emailed links open. Each page calls the
// matching API endpoint with the token.
@Injectable()
export class FrontendLinks {
  private readonly base: string;

  constructor(config: ConfigService) {
    this.base = config
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
  }

  invitation(token: string): string {
    return `${this.base}/invitations/${encodeURIComponent(token)}`;
  }

  resetPassword(token: string): string {
    return `${this.base}/reset-password?token=${encodeURIComponent(token)}`;
  }

  verifyEmail(token: string): string {
    return `${this.base}/verify-email?token=${encodeURIComponent(token)}`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface MailContent {
  subject: string;
  greeting: string;
  before: string[];
  action: { label: string; url: string };
  after: string[];
}

function render(to: string, content: MailContent): MailMessage {
  const text = [
    content.greeting,
    '',
    ...content.before,
    '',
    `${content.action.label}: ${content.action.url}`,
    '',
    ...content.after,
  ].join('\n');
  const paragraphs = (lines: string[]) =>
    lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n');
  const html = [
    `<p>${escapeHtml(content.greeting)}</p>`,
    paragraphs(content.before),
    `<p><a href="${escapeHtml(content.action.url)}">${escapeHtml(content.action.label)}</a></p>`,
    paragraphs(content.after),
  ].join('\n');
  return { to, subject: content.subject, text, html };
}

// "Thu, Nov 5, 2026 10:00 PM UTC", like the reference's toDayDateTimeString.
export function formatDateTime(instant: Date): string {
  return `${new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  })
    .format(instant)
    .replace(/,(?= \d{1,2}:)/, '')} UTC`;
}

// Wording from the reference's AccountInvitationNotification.
export function invitationMail(
  to: string,
  name: string,
  link: string,
  expiresAt: Date,
): MailMessage {
  return render(to, {
    subject: `Set up your ${APP_NAME} account`,
    greeting: `Hello ${name},`,
    before: [
      `An administrator created an account for you on ${APP_NAME}.`,
      'Use the button below to set your password and sign in.',
    ],
    action: { label: 'Set my password', url: link },
    after: [
      `This link works one time only. It expires on ${formatDateTime(expiresAt)}.`,
      'If you did not expect this email, you can ignore it.',
    ],
  });
}

// Wording of Laravel's ResetPassword notification, which the reference uses.
export function resetPasswordMail(
  to: string,
  link: string,
  minutes: number,
): MailMessage {
  return render(to, {
    subject: 'Reset Password Notification',
    greeting: 'Hello!',
    before: [
      'You are receiving this email because we received a password reset request for your account.',
    ],
    action: { label: 'Reset Password', url: link },
    after: [
      `This password reset link will expire in ${minutes} minutes.`,
      'If you did not request a password reset, no further action is required.',
    ],
  });
}

// Wording of Laravel's VerifyEmail notification, which the reference uses.
export function verifyEmailMail(to: string, link: string): MailMessage {
  return render(to, {
    subject: 'Verify Email Address',
    greeting: 'Hello!',
    before: ['Please click the button below to verify your email address.'],
    action: { label: 'Verify Email Address', url: link },
    after: ['If you did not create an account, no further action is required.'],
  });
}
