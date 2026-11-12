import type { INestApplication } from '@nestjs/common';
import { generate } from 'otplib';
import { DataSource } from 'typeorm';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
import { sha256 } from '../src/common/crypto/app-crypto.service.js';
import { AuthSession } from '../src/identity/entities/auth-session.entity.js';
import { User } from '../src/identity/entities/user.entity.js';
import { MailService } from '../src/mail/mail.service.js';
import {
  PASSWORD,
  type SignedIn,
  api,
  bearer,
  createUser,
  fakeMail,
  refreshCookie,
  signIn,
} from './support/identity.js';
import { createTestApp } from './support/test-app.js';

const INVALID_CODE = 'The provided two factor authentication code was invalid.';

describe('Two-factor authentication (e2e)', () => {
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

  const code = (secret: string, offsetSeconds = 0) =>
    generate({
      secret,
      epoch: Math.floor(clock.now().getTime() / 1000) + offsetSeconds,
    });

  async function confirmPassword(signedIn: SignedIn) {
    await signedIn.client
      .post('/api/v1/auth/confirm-password')
      .set('Authorization', bearer(signedIn.accessToken))
      .send({ password: PASSWORD })
      .expect(204);
  }

  // A user with confirmed two-factor; returns the secret and codes.
  async function withTwoFactor() {
    const user = await createUser(app);
    const signedIn = await signIn(app, user.email);
    await confirmPassword(signedIn);
    const setup = await signedIn.client
      .post('/api/v1/auth/two-factor')
      .set('Authorization', bearer(signedIn.accessToken))
      .expect(201);
    await signedIn.client
      .post('/api/v1/auth/two-factor/confirm')
      .set('Authorization', bearer(signedIn.accessToken))
      .send({ code: await code(setup.body.secret) })
      .expect(204);
    return {
      user,
      signedIn,
      secret: setup.body.secret as string,
      recoveryCodes: setup.body.recoveryCodes as string[],
    };
  }

  async function challenge(email: string, client = api(app)) {
    const res = await client
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    expect(res.body).toEqual({
      twoFactorRequired: true,
      challengeToken: expect.any(String),
    });
    expect(refreshCookie(res)).toBeUndefined();
    return { client, challengeToken: res.body.challengeToken as string };
  }

  it('setup needs a recent password confirmation and shows the secret and codes only once', async () => {
    const user = await createUser(app);
    const signedIn = await signIn(app, user.email);
    const auth = bearer(signedIn.accessToken);

    await signedIn.client
      .post('/api/v1/auth/two-factor')
      .set('Authorization', auth)
      .expect(423);
    await confirmPassword(signedIn);
    const setup = await signedIn.client
      .post('/api/v1/auth/two-factor')
      .set('Authorization', auth)
      .expect(201);

    expect(setup.body).toEqual({
      secret: expect.stringMatching(/^[A-Z2-7]{32}$/),
      otpauthUrl: expect.stringMatching(/^otpauth:\/\/totp\/SPS%20ERP:/),
      recoveryCodes: expect.any(Array),
    });
    expect(setup.body.recoveryCodes).toHaveLength(8);
    expect(setup.body.recoveryCodes[0]).toMatch(
      /^[A-Za-z0-9]{10}-[A-Za-z0-9]{10}$/,
    );

    const status = await signedIn.client
      .get('/api/v1/auth/two-factor')
      .set('Authorization', auth)
      .expect(200);
    expect(status.body).toEqual({
      enabled: true,
      confirmed: false,
      recoveryCodesRemaining: 8,
    });

    // Stored encrypted and hashed, never in the clear.
    const row = await dataSource.manager.findOneByOrFail(User, { id: user.id });
    expect(row.twoFactorSecret).not.toContain(setup.body.secret);
    expect(row.twoFactorRecoveryCodes).toEqual(
      setup.body.recoveryCodes.map(sha256),
    );

    // Until confirmed, sign-in does not ask for a code.
    await signIn(app, user.email);
  });

  it('confirming needs a valid code; sign-in then asks for one', async () => {
    const user = await createUser(app);
    const signedIn = await signIn(app, user.email);
    const auth = bearer(signedIn.accessToken);
    await confirmPassword(signedIn);
    const setup = await signedIn.client
      .post('/api/v1/auth/two-factor')
      .set('Authorization', auth)
      .expect(201);

    const wrong = await signedIn.client
      .post('/api/v1/auth/two-factor/confirm')
      .set('Authorization', auth)
      .send({ code: '000000' })
      .expect(422);
    expect(wrong.body.error).toEqual({
      code: 'rule_violation',
      message: INVALID_CODE,
      fields: { code: [INVALID_CODE] },
    });

    await signedIn.client
      .post('/api/v1/auth/two-factor/confirm')
      .set('Authorization', auth)
      .send({ code: await code(setup.body.secret) })
      .expect(204);
    const status = await signedIn.client
      .get('/api/v1/auth/two-factor')
      .set('Authorization', auth)
      .expect(200);
    expect(status.body).toEqual({
      enabled: true,
      confirmed: true,
      recoveryCodesRemaining: 8,
    });

    await challenge(user.email);
  });

  it('a session is issued only after a valid code, and the same code cannot be used twice', async () => {
    const { user, secret } = await withTwoFactor();
    clock.set(new Date(clock.now().getTime() + 60_000)); // a fresh time step
    const totp = await code(secret);

    const first = await challenge(user.email);
    const wrong = await first.client
      .post('/api/v1/auth/two-factor-challenge')
      .send({ challengeToken: first.challengeToken, code: '123456' })
      .expect(422);
    expect(wrong.body.error.message).toBe(INVALID_CODE);
    const ok = await first.client
      .post('/api/v1/auth/two-factor-challenge')
      .send({ challengeToken: first.challengeToken, code: totp })
      .expect(200);
    expect(ok.body).toEqual({
      accessToken: expect.any(String),
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    expect(refreshCookie(ok)).toBeDefined();
    await first.client
      .get('/api/v1/me')
      .set('Authorization', bearer(ok.body.accessToken))
      .expect(200);

    // The challenge is single use.
    await first.client
      .post('/api/v1/auth/two-factor-challenge')
      .send({ challengeToken: first.challengeToken, code: totp })
      .expect(401);

    // The same code on a new sign-in is refused (replay).
    const second = await challenge(user.email);
    await second.client
      .post('/api/v1/auth/two-factor-challenge')
      .send({ challengeToken: second.challengeToken, code: totp })
      .expect(422);
  });

  it('each recovery code works once', async () => {
    const { user, recoveryCodes } = await withTwoFactor();

    const first = await challenge(user.email);
    await first.client
      .post('/api/v1/auth/two-factor-challenge')
      .send({
        challengeToken: first.challengeToken,
        recoveryCode: recoveryCodes[0],
      })
      .expect(200);

    const second = await challenge(user.email);
    const reused = await second.client
      .post('/api/v1/auth/two-factor-challenge')
      .send({
        challengeToken: second.challengeToken,
        recoveryCode: recoveryCodes[0],
      })
      .expect(422);
    expect(reused.body.error.message).toBe(
      'The provided two factor recovery code was invalid.',
    );

    const row = await dataSource.manager.findOneByOrFail(User, { id: user.id });
    expect(row.twoFactorRecoveryCodes).toHaveLength(7);
  });

  it('a pending sign-in cannot refresh, is not listed, and expires after 5 minutes', async () => {
    const { user, signedIn } = await withTwoFactor();
    const pending = await challenge(user.email);

    const list = await signedIn.client
      .get('/api/v1/auth/sessions')
      .set('Authorization', bearer(signedIn.accessToken))
      .expect(200);
    expect(list.body).toHaveLength(1);
    const row = await dataSource.manager.findOneByOrFail(AuthSession, {
      challengeTokenHash: sha256(pending.challengeToken),
    });
    await pending.client
      .post('/api/v1/auth/refresh')
      .set('Cookie', `sps_refresh_token=${row.id}.${'A'.repeat(43)}`)
      .expect(401);

    clock.set(new Date(clock.now().getTime() + 5 * 60_000 + 1000));
    const expired = await pending.client
      .post('/api/v1/auth/two-factor-challenge')
      .send({ challengeToken: pending.challengeToken, code: '000000' })
      .expect(401);
    expect(expired.body.error.message).toBe(
      'Your sign-in attempt has expired. Sign in again.',
    );
  });

  it('limits code attempts to 5 a minute per account, across sign-ins and addresses', async () => {
    const { user } = await withTwoFactor();
    // Two sign-ins from two addresses: two challenge tokens, one account.
    const first = await challenge(user.email, api(app));
    const second = await challenge(user.email, api(app));
    expect(first.challengeToken).not.toBe(second.challengeToken);
    const attempt = (c: {
      client: typeof first.client;
      challengeToken: string;
    }) =>
      c.client
        .post('/api/v1/auth/two-factor-challenge')
        .send({ challengeToken: c.challengeToken, code: '000000' });

    for (const c of [first, first, first, second, second]) {
      await attempt(c).expect(422);
    }
    const limited = await attempt(first).expect(429);
    expect(limited.body.error.code).toBe('too_many_requests');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    await attempt(second).expect(429);
    // A new sign-in does not bring new attempts.
    await attempt(await challenge(user.email, api(app))).expect(429);
  });

  it('needs a code or a recovery code, and limits attempts to 5 a minute', async () => {
    const { user } = await withTwoFactor();
    const { client, challengeToken } = await challenge(user.email);

    const missing = await client
      .post('/api/v1/auth/two-factor-challenge')
      .send({ challengeToken })
      .expect(400);
    expect(Object.keys(missing.body.error.fields).sort()).toEqual([
      'code',
      'recoveryCode',
    ]);

    for (let i = 0; i < 4; i++) {
      await client
        .post('/api/v1/auth/two-factor-challenge')
        .send({ challengeToken, code: '000000' })
        .expect(422);
    }
    await client
      .post('/api/v1/auth/two-factor-challenge')
      .send({ challengeToken, code: '000000' })
      .expect(429);
  });

  it('regenerating replaces the recovery codes; disabling turns two-factor off', async () => {
    const { user, signedIn, recoveryCodes } = await withTwoFactor();
    const auth = bearer(signedIn.accessToken);

    const fresh = await signedIn.client
      .post('/api/v1/auth/two-factor/recovery-codes')
      .set('Authorization', auth)
      .expect(201);
    expect(fresh.body.recoveryCodes).toHaveLength(8);
    expect(fresh.body.recoveryCodes).not.toContain(recoveryCodes[1]);

    const old = await challenge(user.email);
    await old.client
      .post('/api/v1/auth/two-factor-challenge')
      .send({
        challengeToken: old.challengeToken,
        recoveryCode: recoveryCodes[1],
      })
      .expect(422);

    await signedIn.client
      .delete('/api/v1/auth/two-factor')
      .set('Authorization', auth)
      .expect(204);
    const status = await signedIn.client
      .get('/api/v1/auth/two-factor')
      .set('Authorization', auth)
      .expect(200);
    expect(status.body).toEqual({
      enabled: false,
      confirmed: false,
      recoveryCodesRemaining: 0,
    });
    await signIn(app, user.email);

    // Without a recent confirmation, disabling is refused.
    clock.set(new Date(clock.now().getTime() + 3 * 3_600_000 + 1000));
    await signedIn.client
      .delete('/api/v1/auth/two-factor')
      .set('Authorization', auth)
      .expect(423);
  });

  it('enabling again before confirming starts over; after confirming it is refused', async () => {
    const user = await createUser(app);
    const signedIn = await signIn(app, user.email);
    const auth = bearer(signedIn.accessToken);
    await confirmPassword(signedIn);

    const first = await signedIn.client
      .post('/api/v1/auth/two-factor')
      .set('Authorization', auth)
      .expect(201);
    const second = await signedIn.client
      .post('/api/v1/auth/two-factor')
      .set('Authorization', auth)
      .expect(201);
    expect(second.body.secret).not.toBe(first.body.secret);

    await signedIn.client
      .post('/api/v1/auth/two-factor/confirm')
      .set('Authorization', auth)
      .send({ code: await code(second.body.secret) })
      .expect(204);
    const again = await signedIn.client
      .post('/api/v1/auth/two-factor')
      .set('Authorization', auth)
      .expect(422);
    expect(again.body.error.message).toBe(
      'Two-factor authentication is already enabled.',
    );
  });
});
