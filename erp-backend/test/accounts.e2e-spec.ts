import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InvitationService } from '../src/identity/invitations/invitation.service.js';
import { MailService } from '../src/mail/mail.service.js';
import { OrganizationMembers } from '../src/organizations/organization-members.service.js';
import type { Organization } from '../src/organizations/entities/organization.entity.js';
import type { School } from '../src/organizations/entities/school.entity.js';
import {
  type Person,
  addMember,
  auditEvents,
  campusAdmin,
  createOrganization,
  createSchool,
  makeOrganizationMember,
  person,
  platformAdmin,
  sharedRole,
} from './support/campus.js';
import { createUser, fakeMail, signIn } from './support/identity.js';
import { createTestApp } from './support/test-app.js';

describe('Account administration (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let organization: Organization;
  let otherOrganization: Organization;
  let schoolA: School;
  let schoolB: School;
  let adminA: Person;
  let platform: Person;
  let teacherA: Person;
  const mail = fakeMail();

  const status = async (userId: string) =>
    (
      await dataSource.query('SELECT account_status FROM users WHERE id = $1', [
        userId,
      ])
    )[0].account_status;

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: MailService, useValue: mail.service }],
    });
    dataSource = app.get(DataSource);
    organization = await createOrganization(app);
    otherOrganization = await createOrganization(app);
    schoolA = await createSchool(app, organization);
    schoolB = await createSchool(app, organization);
    adminA = await campusAdmin(app, schoolA);
    platform = await platformAdmin(app);
    teacherA = await person(app, {
      memberOf: [schoolA],
      roles: [['teacher', schoolA]],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('provisioning (POST /api/v1/accounts)', () => {
    it('creates an invited account with a membership and records account.provisioned', async () => {
      const res = await adminA
        .as(schoolA)
        .post('/api/v1/accounts')
        .send({
          name: 'Bola Ade',
          email: ' Bola.Ade@School.TEST ',
          phone: '0800 000',
          gender: 'Female',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        name: 'Bola Ade',
        email: 'bola.ade@school.test',
        accountStatus: 'invited',
        phone: '0800 000',
        gender: 'Female',
        membership: { isPrimary: true },
        roles: [],
      });
      const [event] = await auditEvents(
        app,
        'account.provisioned',
        res.body.id,
      );
      expect(event).toMatchObject({
        schoolId: schoolA.id,
        actorId: adminA.user.id,
        context: {
          email: 'bola.ade@school.test',
          existing_person: false,
          school_id: schoolA.id,
        },
      });
      const [granted] = await auditEvents(app, 'school_membership.granted');
      expect(granted.context).toMatchObject({
        user_id: res.body.id,
        school_id: schoolA.id,
        primary: true,
      });
    });

    it('an existing person keeps their filled-in fields; only blank ones are filled', async () => {
      const existing = await createUser(app, {
        name: 'Chidi Okafor',
        phone: '111 111',
        city: null,
      });
      await addMember(app, existing, schoolB);
      const res = await adminA
        .as(schoolA)
        .post('/api/v1/accounts')
        .send({
          name: 'Somebody Else',
          email: existing.email,
          phone: '999 999',
          city: 'Lagos',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        id: existing.id,
        name: 'Chidi Okafor',
        phone: '111 111',
        city: 'Lagos',
        accountStatus: 'active',
        membership: { isPrimary: false },
      });
      const [event] = await auditEvents(
        app,
        'account.provisioned',
        existing.id,
      );
      expect(event.context).toMatchObject({
        existing_person: true,
        filled: ['city'],
      });

      // Retrying changes nothing and records nothing more.
      await adminA
        .as(schoolA)
        .post('/api/v1/accounts')
        .send({ name: 'Chidi Okafor', email: existing.email })
        .expect(200);
      expect(
        await auditEvents(app, 'account.provisioned', existing.id),
      ).toHaveLength(1);
    });

    it('refuses an email that belongs to a person outside the organization', async () => {
      const outsider = await createUser(app);
      const elsewhere = await createSchool(app, otherOrganization);
      await addMember(app, outsider, elsewhere);
      const res = await adminA
        .as(schoolA)
        .post('/api/v1/accounts')
        .send({ name: 'Outsider', email: outsider.email })
        .expect(400);
      expect(res.body.error.fields).toEqual({
        email: [
          'This email belongs to a person outside your organization, so it cannot be used here.',
        ],
      });
      const unknown = await createUser(app);
      await adminA
        .as(schoolA)
        .post('/api/v1/accounts')
        .send({ name: 'Nobody', email: unknown.email })
        .expect(400);
    });

    it('validates the profile and needs "manage account access"', async () => {
      const res = await adminA
        .as(schoolA)
        .post('/api/v1/accounts')
        .send({
          name: '',
          email: 'not-an-email',
          birthday: '2999-01-01',
          gender: 'x',
        })
        .expect(400);
      expect(Object.keys(res.body.error.fields).sort()).toEqual([
        'email',
        'gender',
        'name',
      ]);
      const future = await adminA
        .as(schoolA)
        .post('/api/v1/accounts')
        .send({
          name: 'Baby',
          email: 'baby@school.test',
          birthday: '2999-01-01',
        })
        .expect(400);
      expect(future.body.error.fields.birthday).toEqual([
        'The birthday field must be a date before today.',
      ]);
      await teacherA
        .as(schoolA)
        .post('/api/v1/accounts')
        .send({ name: 'X', email: 'x@school.test' })
        .expect(403);
    });
  });

  describe('listing and reading', () => {
    it('lists the campus’s active members with their roles here', async () => {
      const res = await adminA
        .as(schoolA)
        .get(
          `/api/v1/accounts?search=${encodeURIComponent(teacherA.user.email)}`,
        )
        .expect(200);
      expect(res.body.meta.total).toBe(1);
      expect(res.body.data[0]).toMatchObject({
        id: teacherA.user.id,
        accountStatus: 'active',
        roles: [expect.objectContaining({ name: 'teacher', global: false })],
      });
      const invited = await adminA
        .as(schoolA)
        .get('/api/v1/accounts?accountStatus=invited&sort=-name')
        .expect(200);
      expect(
        invited.body.data.every(
          (a: { accountStatus: string }) => a.accountStatus === 'invited',
        ),
      ).toBe(true);
      await teacherA.as(schoolA).get('/api/v1/accounts').expect(403);
    });

    it('a person of another campus answers 404 on every account route', async () => {
      const other = await person(app, { memberOf: [schoolB] });
      const a = adminA.as(schoolA);
      const id = other.user.id;
      await a.get(`/api/v1/accounts/${id}`).expect(404);
      await a
        .post(`/api/v1/accounts/${id}/status-changes`)
        .send({ action: 'suspend' })
        .expect(404);
      await a.post(`/api/v1/accounts/${id}/invitation`).expect(404);
      await a.delete(`/api/v1/accounts/${id}/invitation`).expect(404);
      await a.post(`/api/v1/accounts/${id}/membership/end`).expect(404);
      expect(await status(id)).toBe('active');
    });

    it('needs "manage account access" on every account route', async () => {
      const t = teacherA.as(schoolA);
      const id = adminA.user.id;
      await t.get(`/api/v1/accounts/${id}`).expect(403);
      await t
        .post(`/api/v1/accounts/${id}/status-changes`)
        .send({ action: 'suspend' })
        .expect(403);
      await t.post(`/api/v1/accounts/${id}/invitation`).expect(403);
      await t.delete(`/api/v1/accounts/${id}/invitation`).expect(403);
      await t.post(`/api/v1/accounts/${id}/membership/end`).expect(403);
      await t.get('/api/v1/account-invitations').expect(403);
    });
  });

  describe('account status', () => {
    it('suspending revokes sessions and pending invitations; reinstating restores access', async () => {
      const staff = await person(app, { memberOf: [schoolA] });
      const second = await signIn(app, staff.user.email);
      await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${staff.user.id}/invitation`)
        .expect(201);

      const res = await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${staff.user.id}/status-changes`)
        .send({ action: 'suspend', reason: 'Investigation' })
        .expect(200);
      expect(res.body.accountStatus).toBe('suspended');

      const [{ open }] = await dataSource.query(
        'SELECT count(*)::int AS open FROM auth_sessions WHERE user_id = $1 AND revoked_at IS NULL',
        [staff.user.id],
      );
      expect(open).toBe(0);
      const [{ pending }] = await dataSource.query(
        'SELECT count(*)::int AS pending FROM account_invitations WHERE user_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL',
        [staff.user.id],
      );
      expect(pending).toBe(0);
      // The refresh token no longer works either.
      await second.client
        .post('/api/v1/auth/refresh')
        .set('Cookie', second.cookie)
        .expect(401);

      const [event] = await auditEvents(
        app,
        'account.status_changed',
        staff.user.id,
      );
      expect(event).toMatchObject({
        actorId: adminA.user.id,
        schoolId: schoolA.id,
        context: { from: 'active', to: 'suspended', reason: 'Investigation' },
      });
      expect(
        await auditEvents(app, 'account_invitation.revoked', staff.user.id),
      ).toHaveLength(1);

      // Repeating changes nothing.
      await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${staff.user.id}/status-changes`)
        .send({ action: 'suspend' })
        .expect(200);
      expect(
        await auditEvents(app, 'account.status_changed', staff.user.id),
      ).toHaveLength(1);

      await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${staff.user.id}/status-changes`)
        .send({ action: 'reinstate' })
        .expect(200);
      expect(await status(staff.user.id)).toBe('active');
      const back = await signIn(app, staff.user.email);
      expect(back.accessToken).toBeTruthy();
    });

    it('archiving also revokes; reinstating an account with no password goes back to invited', async () => {
      const invited = await adminA
        .as(schoolA)
        .post('/api/v1/accounts')
        .send({ name: 'Never Signed In', email: 'never.signed.in@school.test' })
        .expect(201);
      await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${invited.body.id}/invitation`)
        .expect(201);
      await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${invited.body.id}/status-changes`)
        .send({ action: 'archive' })
        .expect(200);
      expect(await status(invited.body.id)).toBe('archived');
      const archivedInvite = await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${invited.body.id}/invitation`)
        .expect(422);
      expect(archivedInvite.body.error.message).toBe(
        'An archived account cannot be invited. Reinstate the account first.',
      );
      await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${invited.body.id}/status-changes`)
        .send({ action: 'reinstate' })
        .expect(200);
      expect(await status(invited.body.id)).toBe('invited');
    });

    it('nobody, a platform administrator included, changes the access of a person with access beyond the campus', async () => {
      const beyond =
        'This person has access beyond this campus, so their account access cannot be changed here.';
      const otherPlatformAdmin = await platformAdmin(app);
      await addMember(app, otherPlatformAdmin.user, schoolA);
      const orgAdmin = await person(app, { memberOf: [schoolA] });
      await makeOrganizationMember(app, orgAdmin.user, organization);

      for (const target of [otherPlatformAdmin, orgAdmin]) {
        for (const actor of [platform, adminA]) {
          for (const action of ['suspend', 'archive', 'reinstate']) {
            const res = await actor
              .as(schoolA)
              .post(`/api/v1/accounts/${target.user.id}/status-changes`)
              .send({ action })
              .expect(403);
            expect(res.body.error.message).toBe(beyond);
          }
          const ended = await actor
            .as(schoolA)
            .post(`/api/v1/accounts/${target.user.id}/membership/end`)
            .expect(403);
          expect(ended.body.error.message).toBe(beyond);
        }
        expect(await status(target.user.id)).toBe('active');
      }
      const [{ n }] = await dataSource.query(
        "SELECT count(*)::int AS n FROM school_memberships WHERE user_id = $1 AND status = 'active'",
        [orgAdmin.user.id],
      );
      expect(n).toBe(1);
    });

    it('invitations keep the reach of the platform and of organization member managers', async () => {
      // Invited and never signed in, with organization scope.
      const invitee = await createUser(app, {
        password: null,
        accountStatus: 'invited',
      });
      await addMember(app, invitee, schoolA);
      await makeOrganizationMember(app, invitee, organization);

      // A campus admin cannot reach someone with organization scope.
      await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${invitee.id}/invitation`)
        .expect(403);
      // A platform administrator can.
      await platform
        .as(schoolA)
        .post(`/api/v1/accounts/${invitee.id}/invitation`)
        .expect(201);
      await platform
        .as(schoolA)
        .delete(`/api/v1/accounts/${invitee.id}/invitation`)
        .expect(204);
      // So can a campus admin who manages the organization's members.
      const managingAdmin = await campusAdmin(app, schoolA);
      await makeOrganizationMember(app, managingAdmin.user, organization, [
        'read organization',
        'manage organization members',
      ]);
      await managingAdmin
        .as(schoolA)
        .post(`/api/v1/accounts/${invitee.id}/invitation`)
        .expect(201);
    });

    it('nobody changes their own access, or that of someone holding more', async () => {
      const self = await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${adminA.user.id}/status-changes`)
        .send({ action: 'suspend' })
        .expect(403);
      expect(self.body.error.message).toBe(
        'You cannot change access to your own account.',
      );

      // A manager with only account access cannot suspend an admin.
      const [{ id: roleId }] = await dataSource.query(
        "INSERT INTO roles (name, school_id) VALUES ('Access desk', $1) RETURNING id",
        [schoolA.id],
      );
      await dataSource.query(
        "INSERT INTO role_has_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE name = 'manage account access'",
        [roleId],
      );
      const desk = await person(app, { memberOf: [schoolA] });
      await dataSource.query(
        'INSERT INTO model_has_roles (user_id, role_id, school_id) VALUES ($1, $2, $3)',
        [desk.user.id, roleId, schoolA.id],
      );
      const res = await desk
        .as(schoolA)
        .post(`/api/v1/accounts/${teacherA.user.id}/status-changes`)
        .send({ action: 'suspend' })
        .expect(403);
      expect(res.body.error.message).toBe(
        'This person holds more at this campus than you do.',
      );

      // Someone with a staff role at another campus is beyond this one.
      const twoCampuses = await person(app, {
        memberOf: [schoolA, schoolB],
        roles: [['teacher', schoolB]],
      });
      const beyond = await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${twoCampuses.user.id}/status-changes`)
        .send({ action: 'suspend' })
        .expect(403);
      expect(beyond.body.error.message).toMatch(/beyond this campus/);
    });

    it('suspending the last role manager of a campus is refused with 422', async () => {
      const schoolC = await createSchool(app, organization);
      const adminC = await campusAdmin(app, schoolC);
      const res = await platform
        .as(schoolC)
        .post(`/api/v1/accounts/${adminC.user.id}/status-changes`)
        .send({ action: 'suspend' })
        .expect(422);
      expect(res.body.error.message).toBe(
        'Nobody at this campus could manage roles after that. Give somebody else role management first.',
      );
      expect(await status(adminC.user.id)).toBe('active');

      // With a second role manager it goes through.
      const second = await campusAdmin(app, schoolC);
      await platform
        .as(schoolC)
        .post(`/api/v1/accounts/${adminC.user.id}/status-changes`)
        .send({ action: 'suspend' })
        .expect(200);
      // And the last one left cannot be archived.
      await platform
        .as(schoolC)
        .post(`/api/v1/accounts/${second.user.id}/status-changes`)
        .send({ action: 'archive' })
        .expect(422);
    });

    it('blocking the last member manager of an organization is refused', async () => {
      const org = await createOrganization(app, { name: 'Solo Trust' });
      const campus = await createSchool(app, org);
      const manager = await person(app, { memberOf: [campus] });
      await makeOrganizationMember(app, manager.user, org);
      // From a campus nobody reaches an organization member at all...
      await platform
        .as(campus)
        .post(`/api/v1/accounts/${manager.user.id}/status-changes`)
        .send({ action: 'suspend' })
        .expect(403);
      // ...and the status change keeps the reference's own guard.
      await expect(
        dataSource.transaction((m) =>
          app
            .get(OrganizationMembers)
            .mustNotBeTheLastMemberManager(m, manager.user.id),
        ),
      ).rejects.toThrow(
        'Solo Trust would be left with nobody who can manage its members. Grant a replacement first.',
      );
    });
  });

  describe('invitations', () => {
    it('sends, lists with status and revokes', async () => {
      const created = await adminA
        .as(schoolA)
        .post('/api/v1/accounts')
        .send({ name: 'Dayo Bello', email: 'dayo.bello@school.test' })
        .expect(201);
      const id = created.body.id;
      mail.sent.length = 0;
      const first = await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${id}/invitation`)
        .expect(201);
      expect(first.body.expiresAt).toBeDefined();
      expect(mail.sent.at(-1)?.to).toBe('dayo.bello@school.test');
      await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${id}/invitation`)
        .expect(201);

      const list = await adminA
        .as(schoolA)
        .get('/api/v1/account-invitations?search=dayo')
        .expect(200);
      expect(list.body.data.map((i: { status: string }) => i.status)).toEqual([
        'pending',
        'revoked',
      ]);
      expect(list.body.data[0]).toMatchObject({
        user: { id, email: 'dayo.bello@school.test' },
        invitedBy: { id: adminA.user.id },
      });

      // An expired link shows as expired until the hourly clean-up.
      await dataSource.query(
        "UPDATE account_invitations SET expires_at = now() - interval '1 minute' WHERE user_id = $1 AND revoked_at IS NULL",
        [id],
      );
      const expired = await adminA
        .as(schoolA)
        .get('/api/v1/account-invitations?status=expired&search=dayo')
        .expect(200);
      expect(expired.body.meta.total).toBe(1);

      await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${id}/invitation`)
        .expect(201);
      await adminA
        .as(schoolA)
        .delete(`/api/v1/accounts/${id}/invitation`)
        .expect(204);
      const pending = await adminA
        .as(schoolA)
        .get('/api/v1/account-invitations?status=pending&search=dayo')
        .expect(200);
      expect(pending.body.meta.total).toBe(0);
      expect(
        await auditEvents(app, 'account_invitation.sent'),
      ).not.toHaveLength(0);
    });

    it('an accepted invitation is listed as accepted; other campuses’ invitations are not listed', async () => {
      const created = await adminA
        .as(schoolA)
        .post('/api/v1/accounts')
        .send({ name: 'Efe Accepts', email: 'efe.accepts@school.test' })
        .expect(201);
      await dataSource.query(
        "INSERT INTO account_invitations (user_id, token_hash, expires_at, accepted_at) VALUES ($1, repeat('a', 64), now() + interval '1 day', now())",
        [created.body.id],
      );
      const accepted = await adminA
        .as(schoolA)
        .get('/api/v1/account-invitations?status=accepted&search=efe')
        .expect(200);
      expect(accepted.body.meta.total).toBe(1);

      const adminB = await campusAdmin(app, schoolB);
      const fromB = await adminB
        .as(schoolB)
        .get('/api/v1/account-invitations?search=efe')
        .expect(200);
      expect(fromB.body.meta.total).toBe(0);
      await adminB
        .as(schoolB)
        .get('/api/v1/account-invitations?status=lost')
        .expect(400);
    });
  });

  describe('organization reach: invitations', () => {
    const base = () => `/api/v1/organizations/${organization.id}/invitations`;

    it('a member manager lists, resends and revokes invitations of the organization’s people, with no campus membership', async () => {
      const manager = await person(app);
      await makeOrganizationMember(app, manager.user, organization, [
        'read organization',
        'manage organization members',
      ]);
      const invitations = app.get(InvitationService);
      const stamp = Date.now();
      const atA = await createUser(app, {
        email: `reach.a.${stamp}@school.test`,
        password: null,
        accountStatus: 'invited',
      });
      const atB = await createUser(app, {
        email: `reach.b.${stamp}@school.test`,
        password: null,
        accountStatus: 'invited',
      });
      const elsewhere = await createUser(app, {
        email: `reach.c.${stamp}@school.test`,
        password: null,
        accountStatus: 'invited',
      });
      await addMember(app, atA, schoolA);
      await addMember(app, atB, schoolB);
      await addMember(
        app,
        elsewhere,
        await createSchool(app, otherOrganization),
      );
      const sentA = await invitations.send(atA.id, { notify: false });
      await invitations.send(atB.id, { notify: false });
      const sentC = await invitations.send(elsewhere.id, { notify: false });

      const list = await manager
        .as()
        .get(`${base()}?search=${stamp}&perPage=100`)
        .expect(200);
      expect(
        list.body.data.map((i: { user: { id: string } }) => i.user.id).sort(),
      ).toEqual([atA.id, atB.id].sort());
      expect(
        list.body.data.every((i: { status: string }) => i.status === 'pending'),
      ).toBe(true);

      mail.sent.length = 0;
      const resent = await manager
        .as()
        .post(`${base()}/${sentA.invitation.id}/resend`)
        .expect(201);
      expect(resent.body.expiresAt).toBeDefined();
      expect(mail.sent.at(-1)?.to).toBe(atA.email);
      const [event] = (await auditEvents(app, 'account_invitation.sent')).slice(
        -1,
      );
      expect(event).toMatchObject({ actorId: manager.user.id, schoolId: null });

      // The replaced link is no longer pending.
      const stale = await manager
        .as()
        .post(`${base()}/${sentA.invitation.id}/resend`)
        .expect(403);
      expect(stale.body.error.message).toBe(
        'Only a pending invitation can be sent again or revoked.',
      );
      const [current] = await dataSource.query(
        'SELECT id FROM account_invitations WHERE user_id = $1 AND revoked_at IS NULL',
        [atA.id],
      );
      await manager.as().post(`${base()}/${current.id}/revoke`).expect(204);
      const pending = await manager
        .as()
        .get(`${base()}?status=pending&search=${encodeURIComponent(atA.email)}`)
        .expect(200);
      expect(pending.body.meta.total).toBe(0);

      // Another organization's people are not this organization's.
      await manager
        .as()
        .post(`${base()}/${sentC.invitation.id}/resend`)
        .expect(404);
      await manager
        .as()
        .post(`${base()}/${sentC.invitation.id}/revoke`)
        .expect(404);
    });

    it('needs "manage organization members" (403); others get 404; nobody acts on their own', async () => {
      const reader = await person(app);
      await makeOrganizationMember(app, reader.user, organization, [
        'read organization',
      ]);
      const stranger = await person(app);
      const [{ id: anyInvitation }] = await dataSource.query(
        'SELECT id FROM account_invitations LIMIT 1',
      );
      for (const [someone, code] of [
        [reader, 403],
        [stranger, 404],
      ] as const) {
        await someone.as().get(base()).expect(code);
        await someone
          .as()
          .post(`${base()}/${anyInvitation}/resend`)
          .expect(code);
        await someone
          .as()
          .post(`${base()}/${anyInvitation}/revoke`)
          .expect(code);
      }

      const manager = await person(app, { memberOf: [schoolB] });
      await makeOrganizationMember(app, manager.user, organization, [
        'read organization',
        'manage organization members',
      ]);
      const own = await app
        .get(InvitationService)
        .send(manager.user.id, { notify: false });
      const res = await manager
        .as()
        .post(`${base()}/${own.invitation.id}/revoke`)
        .expect(403);
      expect(res.body.error.message).toBe(
        'You cannot change access to your own account.',
      );
    });
  });

  describe('ending a campus membership', () => {
    it('ends access here only, keeps the account and roles, and records it', async () => {
      const both = await person(app, {
        memberOf: [schoolA, schoolB],
        roles: [['teacher', schoolA]],
      });
      await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${both.user.id}/membership/end`)
        .expect(204);
      await both.as(schoolA).get('/api/v1/me/permissions').expect(403);
      await both.as(schoolB).get('/api/v1/me/permissions').expect(200);
      await adminA
        .as(schoolA)
        .get(`/api/v1/accounts/${both.user.id}`)
        .expect(404);

      const [membership] = await dataSource.query(
        'SELECT status, ended_at, is_primary FROM school_memberships WHERE user_id = $1 AND school_id = $2',
        [both.user.id, schoolA.id],
      );
      expect(membership).toMatchObject({ status: 'ended', is_primary: false });
      expect(membership.ended_at).not.toBeNull();
      const teacher = await sharedRole(app, 'teacher');
      const [{ n }] = await dataSource.query(
        'SELECT count(*)::int AS n FROM model_has_roles WHERE user_id = $1 AND role_id = $2 AND school_id = $3',
        [both.user.id, teacher.id, schoolA.id],
      );
      expect(n).toBe(1);
      const [event] = await auditEvents(app, 'school_membership.ended');
      expect(event.context).toEqual({
        user_id: both.user.id,
        school_id: schoolA.id,
      });
      // Their other campus became primary.
      const [primary] = await dataSource.query(
        'SELECT school_id FROM school_memberships WHERE user_id = $1 AND is_primary',
        [both.user.id],
      );
      expect(primary.school_id).toBe(schoolB.id);
    });

    it('ending the last role manager’s membership is refused with 422', async () => {
      const schoolD = await createSchool(app, organization);
      const adminD = await campusAdmin(app, schoolD);
      await platform
        .as(schoolD)
        .post(`/api/v1/accounts/${adminD.user.id}/membership/end`)
        .expect(422);
    });
  });
});
