import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

// SMTP settings from the environment: Mailpit in development, the real mail
// service (for example Amazon SES SMTP) in production.
export function createMailTransport(config: ConfigService): Transporter {
  const user = config.get<string>('SMTP_USER');
  return createTransport({
    host: config.get<string>('SMTP_HOST', 'localhost'),
    port: Number(config.get<string>('SMTP_PORT', '1025')),
    secure: config.get('SMTP_SECURE') === 'true',
    auth: user
      ? { user, pass: config.get<string>('SMTP_PASSWORD') }
      : undefined,
  });
}
