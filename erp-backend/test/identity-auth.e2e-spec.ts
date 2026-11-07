import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
import { AuthSession } from '../src/identity/entities/auth-session.entity.js';
import { User } from '../src/identity/entities/user.entity.js';
import { MailService } from '../src/mail/mail.service.js';
import {
  PASSWORD,
  api,
  bearer,
  createUser,
  fakeMail,
  refreshCookie,
  signIn,
} from './support/identity.js';
import { createTestApp } from './support/test-app.js';

const SUSPENDED =
  "This account is suspended. If this is an error, contact your school's administrator.";
const ARCHIVED =
  "This account is archived. If this is an error, contact your school's administrator.";

describe('Sign-in, refresh and sessions (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const clock = new FixedClock(new Date());

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: MailService, useValue: fakeMail().service },
      ],
    });
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => clock.set(new Date()));

  describe('sign-in', () => {
    it('returns an access token and sets the refresh token as an httpOnly cookie', async () => {
      const user = await createUser(app);
      const client = api(app);
      const res = await client
        .post('/api/v1/auth/login')
        .send({ email: user.email.toUpperCase(), password: PASSWORD })
        .expect(200);

      expect(res.body).toEqual({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: 900,
      });
      const cookie = ([] as string[])
        .concat(res.headers['set-cookie'])
        .find((c) => c.startsWith('sps_refresh_token='));
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(JSON.stringify(res.body)).not.toContain(
        refreshCookie(res)!.split('=')[1],
      );

      const me = await client
        .get('/api/v1/me')
        .set('Authorization', bearer(res.body.accessToken))
        .expect(200);
      expect(me.body).toMatchObject({
        id: user.id,
        email: user.email,
        accountStatus: 'active',
      });
      expect(Object.keys(me.body)).not.toEqual(
        expect.arrayContaining(['passwordHash', 'twoFactorSecret']),
      );
    });

    it('answers a wrong password and an unknown email the same way', async () => {
      const user = await createUser(app);
      const wrong = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'nope-nope' })
        .expect(401);
      const unknown = await api(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@school.test', password: 'nope-nope' })
        .expect(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.body.error).toEqual({
        code: 'invalid_credentials',
        message: 'These credentials do not match our records.',
      });
    });

    it.each([
      ['suspended', SUSPENDED],
      ['archived', ARCHIVED],
    ] as const)(
      'refuses a %s account with the reference message, at login and on refresh',
      async (status, message) => {
        const user = await createUser(app);
        const signedIn = await signIn(app, user.email);
        await dataSource.manager.update(
          User,
          { id: user.id },
          { accountStatus: status },
        );

        const login = await api(app)
          .post('/api/v1/auth/login')
          .send({ email: user.email, password: PASSWORD })
          .expect(403);
        expect(login.body.error).toEqual({ code: 'forbidden', message });

        const refresh = await signedIn.client
          .post('/api/v1/auth/refresh')
          .set('Cookie', signedIn.cookie)
          .expect(403);
        expect(refresh.body.error.message).toBe(message);
      },
    );

    it('a suspended account gets 403 on any route and that session ends', async () => {
      const user = await createUser(app);
      const { accessToken, client } = await signIn(app, user.email);
      await dataSource.manager.update(
        User,
        { id: user.id },
        { accountStatus: 'suspended' },
      );

      const res = await client
        .get('/api/v1/auth/sessions')
        .set('Authorization', bearer(accessToken))
        .expect(403);
      expect(res.body.error.message).toBe(SUSPENDED);
      const sessions = await dataSource.manager.findBy(AuthSession, {
        userId: user.id,
      });
      expect(sessions.every((session) => session.revokedAt !== null)).toBe(
        true,
      );

      await dataSource.manager.update(
        User,
        { id: user.id },
        { accountStatus: 'active' },
      );
      await client
        .get('/api/v1/me')
        .set('Authorization', bearer(accessToken))
        .expect(401);
    });

    it('the 6th login attempt within a minute for the same email and IP answers 429', async () => {
      const user = await createUser(app);
      const client = api(app);
      for (let i = 0; i < 5; i++) {
        await client
          .post('/api/v1/auth/login')
          .send({ email: user.email, password: 'wrong-password' })
          .expect(401);
      }
      const limited = await client
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(429);
      expect(limited.body.error.code).toBe('too_many_requests');

      // Another address, or another email from this address, is not affected.
      await api(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      const other = await createUser(app);
      await client
        .post('/api/v1/auth/login')
        .send({ email: other.email, password: PASSWORD })
        .expect(200);
    });

    it('needs a token on every non-public route', async () => {
      const client = api(app);
      const res = await client.get('/api/v1/me').expect(401);
      expect(res.body.error).toEqual({
        code: 'unauthenticated',
        message: 'Unauthenticated.',
      });
      await client
        .get('/api/v1/me')
        .set('Authorization', 'Bearer not-a-jwt')
        .expect(401);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and issues a new access token', async () => {
      const user = await createUser(app);
      const { cookie, client } = await signIn(app, user.email);

      const res = await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);
      const rotated = refreshCookie(res);
      expect(rotated).toBeDefined();
      expect(rotated).not.toBe(cookie);
      await client
        .get('/api/v1/me')
        .set('Authorization', bearer(res.body.accessToken))
        .expect(200);
      await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', rotated!)
        .expect(200);
    });

    it('the previous token within 30 seconds of rotation gets an access token only', async () => {
      const user = await createUser(app);
      const { cookie, client } = await signIn(app, user.email);
      const first = await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);
      const current = refreshCookie(first)!;

      clock.set(new Date(clock.now().getTime() + 29_000));
      const grace = await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);
      expect(grace.body.accessToken).toEqual(expect.any(String));
      expect(refreshCookie(grace)).toBeUndefined(); // no rotation, no cookie

      // The session is intact: the current token still works.
      await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', current)
        .expect(200);
    });

    it('a rotated token used more than 30 seconds after rotation revokes the session', async () => {
      const user = await createUser(app);
      const { cookie, client } = await signIn(app, user.email);
      const first = await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);
      const current = refreshCookie(first)!;

      clock.set(new Date(clock.now().getTime() + 31_000));
      await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);

      // Whoever held the current token is signed out too.
      await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', current)
        .expect(401);
      await client
        .get('/api/v1/me')
        .set('Authorization', bearer(first.body.accessToken))
        .expect(401);
    });

    it('a forged token for a session revokes it', async () => {
      const user = await createUser(app);
      const { cookie, client } = await signIn(app, user.email);
      const sessionId = cookie.split('=')[1].split('.')[0];
      const forged = `sps_refresh_token=${sessionId}.${'A'.repeat(43)}`;

      await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', forged)
        .expect(401);
      await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('needs a frontend Origin', async () => {
      const user = await createUser(app);
      const { cookie, client } = await signIn(app, user.email);

      const foreign = await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example')
        .expect(403);
      expect(foreign.body.error.code).toBe('forbidden');
      await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .unset('Origin')
        .expect(403);
      await client
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example')
        .expect(403);
      // The cookie still works afterwards.
      await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);
    });

    it('a session ends 30 days after sign-in, however often it is refreshed', async () => {
      const user = await createUser(app);
      const client = api(app);
      const signedInAt = clock.now().getTime();
      const day = 24 * 3_600_000;
      const maxAge = (res: { headers: Record<string, unknown> }) =>
        Number(
          /Max-Age=(\d+)/.exec(
            ([] as string[])
              .concat(res.headers['set-cookie'] as string[])
              .find((c) => c.startsWith('sps_refresh_token=')) ?? '',
          )?.[1],
        );

      const login = await client
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      expect(maxAge(login)).toBe(30 * 86_400);

      clock.set(new Date(signedInAt + 15 * day));
      const midway = await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie(login)!)
        .expect(200);
      expect(maxAge(midway)).toBe(15 * 86_400); // the time left, not a fresh 30 days

      clock.set(new Date(signedInAt + 29 * day));
      const lastDay = await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie(midway)!)
        .expect(200);
      expect(maxAge(lastDay)).toBe(86_400);

      clock.set(new Date(signedInAt + 30 * day + 1000));
      await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie(lastDay)!)
        .expect(401);
    });

    it('answers 401 without a cookie or after the session expired', async () => {
      const user = await createUser(app);
      const { cookie, client } = await signIn(app, user.email);
      await client.post('/api/v1/auth/refresh').expect(401);

      clock.set(new Date(clock.now().getTime() + 31 * 24 * 3_600_000));
      await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });
  });

  describe('logout and sessions', () => {
    it('logout ends the session at once and clears the cookie', async () => {
      const user = await createUser(app);
      const { accessToken, cookie, client } = await signIn(app, user.email);

      const res = await client
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(204);
      expect(([] as string[]).concat(res.headers['set-cookie']).join()).toMatch(
        /sps_refresh_token=;/,
      );
      await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
      await client
        .get('/api/v1/me')
        .set('Authorization', bearer(accessToken))
        .expect(401);
      // Logging out again is harmless.
      await client
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie)
        .expect(204);
    });

    it('lists the signed-in sessions and ends one', async () => {
      const user = await createUser(app);
      const laptop = await signIn(app, user.email);
      const phone = await signIn(app, user.email);

      const list = await laptop.client
        .get('/api/v1/auth/sessions')
        .set('Authorization', bearer(laptop.accessToken))
        .expect(200);
      expect(list.body).toHaveLength(2);
      expect(
        list.body.filter((s: { current: boolean }) => s.current),
      ).toHaveLength(1);
      expect(list.body[0]).toEqual({
        id: expect.any(String),
        userAgent: null,
        ipAddress: expect.any(String),
        lastUsedAt: expect.any(String),
        createdAt: expect.any(String),
        current: expect.any(Boolean),
      });

      const phoneId = list.body.find(
        (s: { current: boolean }) => !s.current,
      ).id;
      await laptop.client
        .delete(`/api/v1/auth/sessions/${phoneId}`)
        .set('Authorization', bearer(laptop.accessToken))
        .expect(204);
      await phone.client
        .get('/api/v1/me')
        .set('Authorization', bearer(phone.accessToken))
        .expect(401);
    });

    it("another person's session answers 404", async () => {
      const mine = await signIn(app, (await createUser(app)).email);
      const theirs = await signIn(app, (await createUser(app)).email);
      const theirId = theirs.cookie.split('=')[1].split('.')[0];

      await mine.client
        .delete(`/api/v1/auth/sessions/${theirId}`)
        .set('Authorization', bearer(mine.accessToken))
        .expect(404);
      await theirs.client
        .get('/api/v1/me')
        .set('Authorization', bearer(theirs.accessToken))
        .expect(200);
    });

    it('signing out other sessions needs a recent password confirmation', async () => {
      const user = await createUser(app);
      const current = await signIn(app, user.email);
      const other = await signIn(app, user.email);
      const auth = bearer(current.accessToken);

      const locked = await current.client
        .post('/api/v1/auth/sessions/revoke-others')
        .set('Authorization', auth)
        .expect(423);
      expect(locked.body.error).toEqual({
        code: 'password_confirmation_required',
        message: 'Password confirmation required.',
      });

      const wrong = await current.client
        .post('/api/v1/auth/confirm-password')
        .set('Authorization', auth)
        .send({ password: 'nope-nope' })
        .expect(422);
      expect(wrong.body.error.fields).toEqual({
        password: ['The provided password was incorrect.'],
      });

      await current.client
        .post('/api/v1/auth/confirm-password')
        .set('Authorization', auth)
        .send({ password: PASSWORD })
        .expect(204);
      const done = await current.client
        .post('/api/v1/auth/sessions/revoke-others')
        .set('Authorization', auth)
        .expect(200);
      expect(done.body).toEqual({ revoked: 1 });
      await other.client
        .get('/api/v1/me')
        .set('Authorization', bearer(other.accessToken))
        .expect(401);
      await current.client
        .get('/api/v1/me')
        .set('Authorization', auth)
        .expect(200);

      // The confirmation lasts 3 hours.
      clock.set(new Date(clock.now().getTime() + 3 * 3_600_000 + 1000));
      await current.client
        .post('/api/v1/auth/sessions/revoke-others')
        .set('Authorization', auth)
        .expect(423);
    });
  });

  describe('forced password change', () => {
    it('allows only GET /me, changing the password, refresh and logout', async () => {
      const user = await createUser(app, {
        passwordChangeRequiredAt: new Date(),
      });
      const { accessToken, cookie, client } = await signIn(app, user.email);
      const auth = bearer(accessToken);

      const blocked = await client
        .get('/api/v1/auth/sessions')
        .set('Authorization', auth)
        .expect(403);
      expect(blocked.body.error).toEqual({
        code: 'password_change_required',
        message:
          'Your administrator requires you to choose a new password before continuing.',
      });
      await client
        .patch('/api/v1/me')
        .set('Authorization', auth)
        .send({ name: 'X' })
        .expect(403);
      const me = await client
        .get('/api/v1/me')
        .set('Authorization', auth)
        .expect(200);
      expect(me.body.passwordChangeRequired).toBe(true);
      const refreshed = await client
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);

      await client
        .put('/api/v1/me/password')
        .set('Authorization', auth)
        .send({
          currentPassword: PASSWORD,
          password: 'a brand new password',
          passwordConfirmation: 'a brand new password',
        })
        .expect(204);
      await client
        .get('/api/v1/auth/sessions')
        .set('Authorization', bearer(refreshed.body.accessToken))
        .expect(200);
    });
  });

  describe('rate limits', () => {
    it('two signed-in users on one IP have separate limits', async () => {
      const ip = '10.99.0.1';
      const alice = await signIn(
        app,
        (await createUser(app)).email,
        PASSWORD,
        api(app, ip),
      );
      const bob = await signIn(
        app,
        (await createUser(app)).email,
        PASSWORD,
        api(app, ip),
      );

      for (let i = 0; i < 60; i++) {
        await alice.client
          .get('/api/v1/me')
          .set('Authorization', bearer(alice.accessToken))
          .expect(200);
      }
      await alice.client
        .get('/api/v1/me')
        .set('Authorization', bearer(alice.accessToken))
        .expect(429);
      await bob.client
        .get('/api/v1/me')
        .set('Authorization', bearer(bob.accessToken))
        .expect(200);
    });

    it('one budget per user across all routes', async () => {
      const carol = await signIn(app, (await createUser(app)).email);
      const auth = bearer(carol.accessToken);
      for (let i = 0; i < 30; i++) {
        await carol.client
          .get('/api/v1/me')
          .set('Authorization', auth)
          .expect(200);
        await carol.client
          .get('/api/v1/auth/sessions')
          .set('Authorization', auth)
          .expect(200);
      }
      await carol.client
        .get('/api/v1/auth/two-factor')
        .set('Authorization', auth)
        .expect(429);
    });
  });

  it('stores no refresh token, only hashes', async () => {
    const user = await createUser(app);
    const { cookie } = await signIn(app, user.email);
    const secret = cookie.split('=')[1].split('.')[1];
    const rows = await dataSource.query(
      'SELECT * FROM auth_sessions WHERE user_id = $1',
      [user.id],
    );
    expect(JSON.stringify(rows)).not.toContain(secret);
  });
});
