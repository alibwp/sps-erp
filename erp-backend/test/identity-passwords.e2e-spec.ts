import { type INestApplication, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditEvent } from '../src/audit/audit-event.entity.js';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
import { sha256 } from '../src/common/crypto/app-crypto.service.js';
import { AuthSession } from '../src/identity/entities/auth-session.entity.js';
import { PasswordResetToken } from '../src/identity/entities/password-reset-token.entity.js';
import { User } from '../src/identity/entities/user.entity.js';
import { MailService } from '../src/mail/mail.service.js';
import { QUEUES } from '../src/queue/queue.module.js';
import {
  PASSWORD,
  api,
  bearer,
  createUser,
  fakeMail,
  signIn,
  tokenFrom,
} from './support/identity.js';
import { createTestApp, waitFor } from './support/test-app.js';

const NEW_PASSWORD = 'a completely new password';

describe('Passwords and email verification (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const clock = new FixedClock(new Date());
  const mail = fakeMail();

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: MailService, useValue: mail.service },
      ],
    });
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    clock.set(new Date());
    mail.sent.length = 0;
  });

  describe('forgot and reset password', () => {
    it('answers 202 the same way for known and unknown emails; only a known one gets a link', async () => {
      const user = await createUser(app);
      const known = await api(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: user.email })
        .expect(202);
      const unknown = await api(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody@school.test' })
        .expect(202);

      expect(known.body).toEqual(unknown.body);
      expect(known.text).toBe(unknown.text);
      await waitFor(async () => mail.sent.length === 1);
      expect(mail.sent[0]).toMatchObject({
        to: user.email,
        subject: 'Reset Password Notification',
      });
      expect(mail.sent[0].text).toContain(
        'http://frontend.test/reset-password?token=',
      );
      expect(mail.sent[0].text).toContain(
        'This password reset link will expire in 60 minutes.',
      );

      const token = tokenFrom(mail.sent[0]);
      const row = await dataSource.manager.findOneByOrFail(PasswordResetToken, {
        userId: user.id,
      });
      expect(row.tokenHash).toBe(sha256(token));
    });

    it('sends at most one email a minute per account', async () => {
      const user = await createUser(app);
      await api(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: user.email })
        .expect(202);
      await api(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: user.email })
        .expect(202);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mail.sent).toHaveLength(1);

      clock.set(new Date(clock.now().getTime() + 61_000));
      await api(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: user.email })
        .expect(202);
      await waitFor(async () => mail.sent.length === 2);
      // The newer link replaces the older one.
      await api(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: tokenFrom(mail.sent[0]),
          password: NEW_PASSWORD,
          passwordConfirmation: NEW_PASSWORD,
        })
        .expect(422);
    });

    it('resets once, ends every session, and refuses an expired link', async () => {
      const user = await createUser(app);
      const signedIn = await signIn(app, user.email);
      await api(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: user.email })
        .expect(202);
      await waitFor(async () => mail.sent.length === 1);
      const token = tokenFrom(mail.sent[0]);
      const body = {
        token,
        password: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      };

      await api(app).post('/api/v1/auth/reset-password').send(body).expect(204);
      const reused = await api(app)
        .post('/api/v1/auth/reset-password')
        .send(body)
        .expect(422);
      expect(reused.body.error).toEqual({
        code: 'rule_violation',
        message: 'This password reset token is invalid.',
        fields: { token: ['This password reset token is invalid.'] },
      });
      await signedIn.client
        .get('/api/v1/me')
        .set('Authorization', bearer(signedIn.accessToken))
        .expect(401);
      await signIn(app, user.email, NEW_PASSWORD);

      clock.set(new Date(clock.now().getTime() + 61_000));
      await api(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: user.email })
        .expect(202);
      await waitFor(async () => mail.sent.length === 2);
      clock.set(new Date(clock.now().getTime() + 61 * 60_000));
      await api(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: tokenFrom(mail.sent[1]),
          password: PASSWORD,
          passwordConfirmation: PASSWORD,
        })
        .expect(422);
    });
  });

  describe('changing the password', () => {
    it('needs the current password, ends other sessions and is audited', async () => {
      const user = await createUser(app);
      const current = await signIn(app, user.email);
      const other = await signIn(app, user.email);
      const auth = bearer(current.accessToken);

      const wrong = await current.client
        .put('/api/v1/me/password')
        .set('Authorization', auth)
        .send({
          currentPassword: 'not-it-at-all',
          password: NEW_PASSWORD,
          passwordConfirmation: NEW_PASSWORD,
        })
        .expect(422);
      expect(wrong.body.error.fields).toEqual({
        currentPassword: [
          'The provided password does not match your current password.',
        ],
      });
      await current.client
        .put('/api/v1/me/password')
        .set('Authorization', auth)
        .send({
          currentPassword: PASSWORD,
          password: 'short',
          passwordConfirmation: 'short',
        })
        .expect(400);

      await current.client
        .put('/api/v1/me/password')
        .set('Authorization', auth)
        .send({
          currentPassword: PASSWORD,
          password: NEW_PASSWORD,
          passwordConfirmation: NEW_PASSWORD,
        })
        .expect(204);

      await current.client
        .get('/api/v1/me')
        .set('Authorization', auth)
        .expect(200);
      await other.client
        .get('/api/v1/me')
        .set('Authorization', bearer(other.accessToken))
        .expect(401);
      await signIn(app, user.email, NEW_PASSWORD);

      const event = await dataSource.manager.findOneByOrFail(AuditEvent, {
        action: 'account.password_changed',
        subjectId: user.id,
      });
      expect(event).toMatchObject({
        actorId: user.id,
        context: { email: user.email, force_reset: false },
      });
    });
  });

  describe('email verification', () => {
    it('a new email address must be verified again, through a single-use link', async () => {
      const user = await createUser(app);
      const { accessToken, client } = await signIn(app, user.email);
      const auth = bearer(accessToken);
      const email = `new.${Date.now()}@school.test`;

      const changed = await client
        .patch('/api/v1/me')
        .set('Authorization', auth)
        .send({ email })
        .expect(200);
      expect(changed.body).toMatchObject({ email, emailVerifiedAt: null });
      await waitFor(async () => mail.sent.length === 1);
      expect(mail.sent[0]).toMatchObject({
        to: email,
        subject: 'Verify Email Address',
      });
      const token = tokenFrom(mail.sent[0]);

      await api(app)
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(204);
      const verified = await client
        .get('/api/v1/me')
        .set('Authorization', auth)
        .expect(200);
      expect(verified.body.emailVerifiedAt).toEqual(expect.any(String));

      const again = await api(app)
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(422);
      expect(again.body.error.message).toBe(
        'Your email address is already verified.',
      );
    });

    it('refuses a tampered, expired or outdated link', async () => {
      const user = await createUser(app, { emailVerifiedAt: null });
      const { accessToken, client } = await signIn(app, user.email);
      const auth = bearer(accessToken);

      await client
        .post('/api/v1/auth/email/verification-notification')
        .set('Authorization', auth)
        .expect(202);
      await waitFor(async () => mail.sent.length === 1);
      const token = tokenFrom(mail.sent[0]);

      const [body, signature] = token.split('.');
      const forged = Buffer.from(
        JSON.stringify({
          ...JSON.parse(Buffer.from(body, 'base64url').toString()),
          u: user.id,
          e: 'x@y.test',
        }),
      ).toString('base64url');
      await api(app)
        .post('/api/v1/auth/verify-email')
        .send({ token: `${forged}.${signature}` })
        .expect(422);

      clock.set(new Date(clock.now().getTime() + 61 * 60_000));
      await api(app)
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(422);
      clock.set(new Date());

      // Once the address changes, the link for the old one stops working.
      await client
        .patch('/api/v1/me')
        .set('Authorization', auth)
        .send({ email: `changed.${Date.now()}@school.test` })
        .expect(200);
      await api(app)
        .post('/api/v1/auth/verify-email')
        .send({ token })
        .expect(422);
    });

    it('sends nothing for a verified address, and at most 6 a minute', async () => {
      const user = await createUser(app);
      const { accessToken, client } = await signIn(app, user.email);
      const auth = bearer(accessToken);

      for (let i = 0; i < 6; i++) {
        await client
          .post('/api/v1/auth/email/verification-notification')
          .set('Authorization', auth)
          .expect(202);
      }
      await client
        .post('/api/v1/auth/email/verification-notification')
        .set('Authorization', auth)
        .expect(429);
      expect(mail.sent).toHaveLength(0);
    });
  });
});

describe('Forgot-password while Redis is down (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  // The real MailService on a mail queue that never connects, as when Redis
  // is down. (A real queue on an unreachable Redis is covered in
  // queue-outage.e2e-spec.ts; this stand-in opens no socket, so the test
  // cannot leave a stray connection error behind.)
  const deadQueue = {
    name: QUEUES.mail,
    waitUntilReady: () => new Promise<never>(() => undefined),
    add: vi.fn(),
  };
  const noDemoAccounts = { query: () => Promise.resolve([]) };

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        {
          provide: MailService,
          useValue: new MailService(
            deadQueue as never,
            noDemoAccounts as never,
          ),
        },
      ],
    });
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('still answers 202, as fast for a known email as for an unknown one, and logs the failure', async () => {
    const user = await createUser(app);
    const warn = vi.spyOn(Logger.prototype, 'warn');

    const timed = async (email: string) => {
      const start = Date.now();
      const res = await api(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email });
      return { status: res.status, body: res.text, ms: Date.now() - start };
    };
    const known = await timed(user.email);
    const unknown = await timed('nobody@school.test');

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toBe(unknown.body);
    // Neither waits for the 1.5 s queue limit.
    expect(known.ms).toBeLessThan(1000);
    expect(unknown.ms).toBeLessThan(1000);

    // The token was committed; the email failure is logged, not thrown.
    expect(
      await dataSource.manager.countBy(PasswordResetToken, { userId: user.id }),
    ).toBe(1);
    await waitFor(async () =>
      warn.mock.calls.some(([message]) =>
        String(message).includes(
          `Password reset email for account ${user.id} not queued`,
        ),
      ),
    );
    warn.mockRestore();
    // Nothing was handed to the queue: it never connected.
    expect(deadQueue.add).not.toHaveBeenCalled();
    expect(
      await dataSource.manager.countBy(AuthSession, { userId: user.id }),
    ).toBe(0);
    expect(await dataSource.manager.countBy(User, { id: user.id })).toBe(1);
  });
});
