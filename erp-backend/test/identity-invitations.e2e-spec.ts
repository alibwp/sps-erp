import type { INestApplication } from '@nestjs/common';
import { DataSource, IsNull, Not } from 'typeorm';
import { AuditEvent } from '../src/audit/audit-event.entity.js';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
import { sha256 } from '../src/common/crypto/app-crypto.service.js';
import { RuleViolation } from '../src/common/errors/api-exception.js';
import {
  CliError,
  createPlatformAdmin,
} from '../src/identity/cli/create-platform-admin.js';
import { AccountInvitation } from '../src/identity/entities/account-invitation.entity.js';
import { AuthSession } from '../src/identity/entities/auth-session.entity.js';
import { User } from '../src/identity/entities/user.entity.js';
import { IdentityMaintenance } from '../src/identity/identity-maintenance.service.js';
import { InvitationService } from '../src/identity/invitations/invitation.service.js';
import { MailService } from '../src/mail/mail.service.js';
import {
  PASSWORD,
  api,
  createUser,
  fakeMail,
  signIn,
  tokenFrom,
} from './support/identity.js';
import { createTestApp } from './support/test-app.js';

const INVALID =
  'This invitation link is not valid, or it expired. Ask your administrator to send a new one.';

describe('Invitations (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let invitations: InvitationService;
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
    invitations = app.get(InvitationService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    clock.set(new Date());
    mail.sent.length = 0;
  });

  const invitedUser = () =>
    createUser(app, {
      password: null,
      accountStatus: 'invited',
      emailVerifiedAt: null,
    });

  it('an invited user cannot sign in, accepts the link once, then signs in', async () => {
    const user = await invitedUser();
    const { token, link } = await invitations.send(user.id);
    const client = api(app);

    // Emailed after commit, with the frontend link.
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({
      to: user.email,
      subject: 'Set up your SPS ERP account',
    });
    expect(link).toBe(`http://frontend.test/invitations/${token}`);
    expect(tokenFrom(mail.sent[0])).toBe(token);

    const refused = await client
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(401);
    expect(refused.body.error.code).toBe('invalid_credentials');

    const shown = await client.get(`/api/v1/invitations/${token}`).expect(200);
    expect(shown.body).toEqual({
      name: user.name,
      email: user.email,
      expiresAt: expect.any(String),
    });

    await client
      .post(`/api/v1/invitations/${token}/accept`)
      .send({ password: PASSWORD, passwordConfirmation: PASSWORD })
      .expect(204);

    const again = await client
      .post(`/api/v1/invitations/${token}/accept`)
      .send({ password: PASSWORD, passwordConfirmation: PASSWORD })
      .expect(422);
    expect(again.body.error).toEqual({
      code: 'rule_violation',
      message: INVALID,
      fields: { token: [INVALID] },
    });
    await client.get(`/api/v1/invitations/${token}`).expect(404);

    const active = await dataSource.manager.findOneByOrFail(User, {
      id: user.id,
    });
    expect(active).toMatchObject({
      accountStatus: 'active',
      passwordChangeRequiredAt: null,
    });
    expect(active.emailVerifiedAt).toBeInstanceOf(Date);
    await signIn(app, user.email);
  });

  it('two simultaneous acceptances of one link succeed at most once', async () => {
    const user = await invitedUser();
    const { token } = await invitations.send(user.id);
    const body = { password: PASSWORD, passwordConfirmation: PASSWORD };

    const results = await Promise.all(
      [api(app), api(app), api(app)].map((client) =>
        client.post(`/api/v1/invitations/${token}/accept`).send(body),
      ),
    );

    expect(results.map((res) => res.status).sort()).toEqual([204, 422, 422]);
    expect(
      await dataSource.manager.countBy(AccountInvitation, {
        userId: user.id,
        acceptedAt: Not(IsNull()),
      }),
    ).toBe(1);
  });

  it('refuses expired, replaced and revoked links', async () => {
    const user = await invitedUser();
    const first = await invitations.send(user.id);
    const second = await invitations.send(user.id); // revokes the first
    const client = api(app);

    await client.get(`/api/v1/invitations/${first.token}`).expect(404);
    await client
      .post(`/api/v1/invitations/${first.token}/accept`)
      .send({ password: PASSWORD, passwordConfirmation: PASSWORD })
      .expect(422);

    clock.set(new Date(clock.now().getTime() + 72 * 3_600_000 + 1000)); // past the 72 h expiry
    await client.get(`/api/v1/invitations/${second.token}`).expect(404);

    clock.set(new Date());
    const third = await invitations.send(user.id);
    expect(await invitations.revoke(user.id)).toBe(1);
    await client.get(`/api/v1/invitations/${third.token}`).expect(404);
  });

  it('validates the new password and refuses a suspended account', async () => {
    const user = await invitedUser();
    const { token } = await invitations.send(user.id);
    const client = api(app);

    const weak = await client
      .post(`/api/v1/invitations/${token}/accept`)
      .send({ password: 'short', passwordConfirmation: 'other' })
      .expect(400);
    expect(Object.keys(weak.body.error.fields).sort()).toEqual([
      'password',
      'passwordConfirmation',
    ]);

    await dataSource.manager.update(
      User,
      { id: user.id },
      { accountStatus: 'suspended' },
    );
    await client
      .post(`/api/v1/invitations/${token}/accept`)
      .send({ password: PASSWORD, passwordConfirmation: PASSWORD })
      .expect(422);
  });

  it('refuses to invite an archived account', async () => {
    const user = await createUser(app, { accountStatus: 'archived' });
    await expect(invitations.send(user.id)).rejects.toThrow(
      new RuleViolation(
        'An archived account cannot be invited. Reinstate the account first.',
      ),
    );
  });

  it('stores only the hash of the invitation token', async () => {
    const user = await invitedUser();
    const { token, invitation } = await invitations.send(user.id);
    const row = await dataSource.manager.findOneByOrFail(AccountInvitation, {
      id: invitation.id,
    });

    expect(row.tokenHash).toBe(sha256(token));
    expect(token).toHaveLength(64);
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('records the reference audit events with their context', async () => {
    const admin = await createUser(app);
    const user = await invitedUser();
    const { invitation, token } = await invitations.send(user.id, {
      invitedById: admin.id,
    });
    await api(app)
      .post(`/api/v1/invitations/${token}/accept`)
      .send({ password: PASSWORD, passwordConfirmation: PASSWORD })
      .expect(204);
    await invitations.send(user.id);
    await invitations.revoke(user.id, admin.id);

    const events = await dataSource.manager.find(AuditEvent, {
      order: { createdAt: 'ASC' },
    });
    const mine = events.filter(
      (event) =>
        event.subjectId === user.id ||
        event.subjectId === invitation.id ||
        event.context?.user_id === user.id,
    );
    expect(mine.map((event) => event.action)).toEqual([
      'account_invitation.sent',
      'account.status_changed',
      'account_invitation.sent',
      'account_invitation.revoked',
    ]);
    expect(mine[0]).toMatchObject({
      actorId: admin.id,
      subjectType: 'account_invitation',
      subjectId: invitation.id,
      context: {
        user_id: user.id,
        email: user.email,
        expires_at: invitation.expiresAt.toISOString(),
      },
    });
    expect(mine[1]).toMatchObject({
      actorId: null,
      subjectType: 'user',
      subjectId: user.id,
      context: { from: 'invited', to: 'active', reason: null },
      ipAddress: expect.any(String),
    });
    expect(mine[3]).toMatchObject({
      actorId: admin.id,
      context: { revoked_count: 1, email: user.email },
    });

    // The audit log is append-only.
    await expect(
      dataSource.query("UPDATE audit_events SET action = 'x'"),
    ).rejects.toThrow('append-only');
    await expect(dataSource.query('DELETE FROM audit_events')).rejects.toThrow(
      'append-only',
    );
  });

  it('the hourly job revokes expired invitations and deletes unanswered two-factor sign-ins', async () => {
    const user = await invitedUser();
    const { invitation } = await invitations.send(user.id);
    const other = await createUser(app);
    const pending = await dataSource.manager.save(
      dataSource.manager.create(AuthSession, {
        userId: other.id,
        challengeTokenHash: sha256(`pending-${Date.now()}`),
        challengeExpiresAt: new Date(clock.now().getTime() + 5 * 60_000),
        lastUsedAt: clock.now(),
        expiresAt: new Date(clock.now().getTime() + 86_400_000),
      }),
    );

    clock.set(new Date(clock.now().getTime() + 73 * 3_600_000));
    const result = await app.get(IdentityMaintenance).pruneExpired();

    expect(result.invitations).toBeGreaterThanOrEqual(1);
    expect(result.pendingSessions).toBeGreaterThanOrEqual(1);
    expect(
      (
        await dataSource.manager.findOneByOrFail(AccountInvitation, {
          id: invitation.id,
        })
      ).revokedAt,
    ).toBeInstanceOf(Date);
    expect(
      await dataSource.manager.findOneBy(AuthSession, { id: pending.id }),
    ).toBeNull();
  });

  describe('create-platform-admin', () => {
    it('creates the account and returns a one-time link, without emailing', async () => {
      const email = `Admin.${Date.now()}@School.test`;
      const result = await createPlatformAdmin(app, {
        name: 'Ada Admin',
        email,
      });

      expect(result.link).toMatch(
        /^http:\/\/frontend\.test\/invitations\/[A-Za-z0-9_-]{64}$/,
      );
      expect(mail.sent).toHaveLength(0);
      const user = await dataSource.manager.findOneByOrFail(User, {
        id: result.userId,
      });
      expect(user).toMatchObject({
        email: email.toLowerCase(),
        accountStatus: 'invited',
        passwordHash: null,
      });

      // Run again before accepting: a new link replaces the old one.
      const again = await createPlatformAdmin(app, {
        name: 'Ada Admin',
        email,
      });
      expect(again.userId).toBe(result.userId);
      await api(app)
        .get(`/api/v1/invitations/${result.link.split('/').pop()}`)
        .expect(404);
      await api(app)
        .get(`/api/v1/invitations/${again.link.split('/').pop()}`)
        .expect(200);
    });

    it('refuses an existing account and bad input', async () => {
      const user = await createUser(app);
      await expect(
        createPlatformAdmin(app, { name: 'X', email: user.email }),
      ).rejects.toThrow(
        new CliError('An account with this email already exists.'),
      );
      await expect(
        createPlatformAdmin(app, { name: '', email: 'a@b.test' }),
      ).rejects.toBeInstanceOf(CliError);
      await expect(
        createPlatformAdmin(app, { name: 'A', email: 'not-an-email' }),
      ).rejects.toBeInstanceOf(CliError);
    });
  });
});
