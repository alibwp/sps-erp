import { ConfigService } from '@nestjs/config';
import { detectFileType } from '../common/files/file-type.js';
import { createValidationPipe } from '../common/errors/validation.js';
import { ValidationFailed } from '../common/errors/api-exception.js';
import { accessDeniedMessage, canAccessApplication } from './account-status.js';
import { parseRefreshToken } from './auth/session.service.js';
import { NewPasswordDto } from './identity.dto.js';
import {
  FrontendLinks,
  formatDateTime,
  invitationMail,
  resetPasswordMail,
  verifyEmailMail,
} from './identity-mails.js';
import { normalizeEmail } from './identity.constants.js';
import { PasswordHasher } from './password-hasher.js';
import { generateRecoveryCodes } from './two-factor/two-factor.service.js';

describe('account status', () => {
  it('only active accounts reach the application, with the reference messages', () => {
    expect(canAccessApplication('active')).toBe(true);
    expect(canAccessApplication('invited')).toBe(false);
    expect(accessDeniedMessage('invited')).toBe(
      'This account is not active yet. Use your invitation link to set a password.',
    );
    expect(accessDeniedMessage('suspended')).toContain(
      'This account is suspended.',
    );
    expect(accessDeniedMessage('archived')).toContain(
      'This account is archived.',
    );
  });

  it('normalizes emails to trimmed lower case', () => {
    expect(normalizeEmail('  Head@School.TEST ')).toBe('head@school.test');
  });
});

describe('parseRefreshToken', () => {
  const id = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
  const secret = 'A'.repeat(43);

  it('reads "<session id>.<secret>"', () => {
    expect(parseRefreshToken(`${id}.${secret}`)).toEqual({
      sessionId: id,
      secret,
    });
  });

  it.each([
    undefined,
    '',
    id,
    `${id}.short`,
    `not-a-uuid.${secret}`,
    `${id}.${secret}.x`,
    `${id}.${'!'.repeat(43)}`,
  ])('refuses %j', (token) => {
    expect(parseRefreshToken(token)).toBeNull();
  });
});

describe('recovery codes', () => {
  it('generates 8 distinct codes like Fortify (10 + 10 characters)', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes)
      expect(code).toMatch(/^[A-Za-z0-9]{10}-[A-Za-z0-9]{10}$/);
  });
});

describe('file types by content', () => {
  it('recognises jpg and png, nothing else', () => {
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0]))).toEqual({
      mime: 'image/jpeg',
      extension: 'jpg',
    });
    expect(
      detectFileType(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
      ),
    ).toEqual({
      mime: 'image/png',
      extension: 'png',
    });
    expect(detectFileType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectFileType(Buffer.from('<svg/>'))).toBeNull();
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });
});

describe('emails', () => {
  const links = new FrontendLinks(
    new ConfigService({ FRONTEND_URL: 'https://erp.example.com/' }),
  );

  it('points links at the frontend pages', () => {
    expect(links.invitation('abc_-')).toBe(
      'https://erp.example.com/invitations/abc_-',
    );
    expect(links.resetPassword('a+b')).toBe(
      'https://erp.example.com/reset-password?token=a%2Bb',
    );
    expect(links.verifyEmail('t.s')).toBe(
      'https://erp.example.com/verify-email?token=t.s',
    );
  });

  it('defaults FRONTEND_URL to the local frontend', () => {
    expect(new FrontendLinks(new ConfigService({})).invitation('x')).toBe(
      'http://localhost:3000/invitations/x',
    );
  });

  it('uses the reference wording and escapes names in HTML', () => {
    const message = invitationMail(
      'a@b.test',
      '<b>Eve</b>',
      'https://x/invitations/t',
      new Date('2026-11-05T22:00:00Z'),
    );
    expect(message.subject).toBe('Set up your SPS ERP account');
    expect(message.text).toContain('Hello <b>Eve</b>,');
    expect(message.text).toContain(
      'This link works one time only. It expires on Thu, Nov 5, 2026 10:00 PM UTC.',
    );
    expect(message.html).toContain('Hello &lt;b&gt;Eve&lt;/b&gt;,');
    expect(message.html).not.toContain('<b>Eve</b>');

    expect(resetPasswordMail('a@b.test', 'https://x', 60).text).toContain(
      'This password reset link will expire in 60 minutes.',
    );
    expect(verifyEmailMail('a@b.test', 'https://x').subject).toBe(
      'Verify Email Address',
    );
  });

  it('formats dates like the reference toDayDateTimeString', () => {
    expect(formatDateTime(new Date('2026-01-02T03:04:00Z'))).toBe(
      'Fri, Jan 2, 2026 3:04 AM UTC',
    );
  });
});

describe('password rules', () => {
  const pipe = createValidationPipe();
  const check = (body: object) =>
    pipe.transform(body, { type: 'body', metatype: NewPasswordDto });

  it('needs at least 8 characters and a matching confirmation', async () => {
    await expect(
      check({ password: 'long enough', passwordConfirmation: 'long enough' }),
    ).resolves.toBeTruthy();
    const error = await check({
      password: 'short',
      passwordConfirmation: 'other',
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationFailed);
    expect((error as ValidationFailed).fields).toEqual({
      password: ['The password field must be at least 8 characters.'],
      passwordConfirmation: ['The password field confirmation does not match.'],
    });
  });
});

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();

  it('hashes with argon2id and verifies', async () => {
    const hash = await hasher.hash('correct horse');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await hasher.verify(hash, 'correct horse')).toBe(true);
    expect(await hasher.verify(hash, 'wrong horse')).toBe(false);
  });

  it('is false for a missing or damaged hash', async () => {
    expect(await hasher.verify(null, 'anything')).toBe(false);
    expect(await hasher.verify('not-a-hash', 'anything')).toBe(false);
  });
});
