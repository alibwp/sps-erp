import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Organization } from '../src/organizations/entities/organization.entity.js';
import type { School } from '../src/organizations/entities/school.entity.js';
import {
  type Person,
  addMember,
  auditEvents,
  createOrganization,
  createSchool,
  makeOrganizationMember,
  person,
  platformAdmin,
} from './support/campus.js';
import { createTestApp } from './support/test-app.js';

const ORG_PERMISSIONS = [
  'read organization',
  'manage organization',
  'manage organization members',
  'manage organization campuses',
  'move students between campuses',
  'read organization reports',
];

const CAMPUS = {
  name: 'North Campus',
  address: '12 Marina Road',
  country: 'Nigeria',
  state: 'Lagos',
  city: 'Lagos',
  postalCode: '100001',
  timezone: 'Africa/Lagos',
};

describe('Organizations (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let platform: Person;
  let organization: Organization;
  let otherOrganization: Organization;
  let school: School;
  let otherSchool: School;
  let owner: Person; // full organization authority
  let reader: Person; // read organization only

  const globalRoles = async (userId: string) =>
    (
      await dataSource.query(
        'SELECT r.name FROM model_has_roles a JOIN roles r ON r.id = a.role_id WHERE a.user_id = $1 AND a.school_id IS NULL',
        [userId],
      )
    ).map((row: { name: string }) => row.name);

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    platform = await platformAdmin(app);
    organization = await createOrganization(app, { name: 'Sunrise Schools' });
    otherOrganization = await createOrganization(app);
    school = await createSchool(app, organization);
    otherSchool = await createSchool(app, otherOrganization);
    owner = await person(app, { memberOf: [school] });
    await makeOrganizationMember(app, owner.user, organization);
    reader = await person(app, { memberOf: [school] });
    await makeOrganizationMember(app, reader.user, organization, [
      'read organization',
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('organizations', () => {
    it('a platform administrator creates one; the code is generated when empty', async () => {
      const res = await platform
        .as()
        .post('/api/v1/organizations')
        .send({ name: 'Harbour Academies', email: 'office@harbour.test' })
        .expect(201);
      expect(res.body).toMatchObject({
        name: 'Harbour Academies',
        email: 'office@harbour.test',
        address: null,
        yourPermissions: ORG_PERMISSIONS,
      });
      expect(res.body.code).toMatch(/^[A-Z0-9]{12}$/);
      const [event] = await auditEvents(
        app,
        'organization.created',
        res.body.id,
      );
      expect(event).toMatchObject({
        actorId: platform.user.id,
        schoolId: null,
        context: { organization_id: res.body.id },
      });

      const taken = await platform
        .as()
        .post('/api/v1/organizations')
        .send({ name: 'Copy', code: res.body.code })
        .expect(400);
      expect(taken.body.error.fields).toEqual({
        code: ['Another organization already uses this code.'],
      });
      await platform
        .as()
        .post('/api/v1/organizations')
        .send({ name: 'Bad code', code: 'has spaces' })
        .expect(400);
    });

    it('only a platform administrator creates organizations (403)', async () => {
      await owner
        .as()
        .post('/api/v1/organizations')
        .send({ name: 'Mine' })
        .expect(403);
    });

    it('lists every organization to the platform, and only their own to members', async () => {
      const all = await platform
        .as()
        .get('/api/v1/organizations?perPage=100')
        .expect(200);
      expect(all.body.meta.total).toBeGreaterThanOrEqual(3);
      const mine = await owner.as().get('/api/v1/organizations').expect(200);
      expect(mine.body.data.map((o: { id: string }) => o.id)).toEqual([
        organization.id,
      ]);
      const nobody = await person(app);
      const none = await nobody.as().get('/api/v1/organizations').expect(200);
      expect(none.body).toEqual({
        data: [],
        meta: { page: 1, perPage: 20, total: 0 },
      });
    });

    it('reads an organization; another organization answers 404', async () => {
      const res = await reader
        .as()
        .get(`/api/v1/organizations/${organization.id}`)
        .expect(200);
      expect(res.body.yourPermissions).toEqual(['read organization']);
      await reader
        .as()
        .get(`/api/v1/organizations/${otherOrganization.id}`)
        .expect(404);
      await reader
        .as()
        .get('/api/v1/organizations/00000000-0000-4000-8000-000000000000')
        .expect(404);
    });

    it('changes the details with "manage organization" and records what changed', async () => {
      await reader
        .as()
        .patch(`/api/v1/organizations/${organization.id}`)
        .send({ phone: '0800' })
        .expect(403);
      await owner
        .as()
        .patch(`/api/v1/organizations/${otherOrganization.id}`)
        .send({ phone: '0800' })
        .expect(404);
      const res = await owner
        .as()
        .patch(`/api/v1/organizations/${organization.id}`)
        .send({ phone: '0800 123', address: '' })
        .expect(200);
      expect(res.body).toMatchObject({ phone: '0800 123', address: null });
      const [event] = await auditEvents(
        app,
        'organization.updated',
        organization.id,
      );
      expect(event.context).toEqual({
        organization_id: organization.id,
        changed: ['phone'],
      });
    });

    it('membership alone is not enough: the global role must carry the permission', async () => {
      const roleless = await person(app);
      await dataSource.query(
        "INSERT INTO organization_memberships (organization_id, user_id, status, permissions) VALUES ($1, $2, 'active', NULL)",
        [organization.id, roleless.user.id],
      );
      await roleless
        .as()
        .get(`/api/v1/organizations/${organization.id}`)
        .expect(404);
    });
  });

  describe('campuses', () => {
    it('opens a campus with "manage organization campuses"; the founder joins it', async () => {
      const res = await owner
        .as()
        .post(`/api/v1/organizations/${organization.id}/campuses`)
        .send({ ...CAMPUS, initials: 'NC', phone: '+234 800 000' })
        .expect(201);
      expect(res.body).toMatchObject({
        name: 'North Campus',
        organizationId: organization.id,
        timezone: 'Africa/Lagos',
        initials: 'NC',
        logoUrl: null,
      });
      expect(res.body.code).toMatch(/^[A-Z0-9]{10}$/);
      expect(res.body.setupDetailsCompletedAt).not.toBeNull();

      const [membership] = await dataSource.query(
        'SELECT status, is_primary FROM school_memberships WHERE user_id = $1 AND school_id = $2',
        [owner.user.id, res.body.id],
      );
      expect(membership).toEqual({ status: 'active', is_primary: false });
      const profile = await owner
        .as(res.body.id)
        .get('/api/v1/school/operating-profile')
        .expect(200);
      expect(profile.body).toMatchObject({
        preset: 'home_sections',
        labels: { class_level: 'Class', period: 'Term' },
      });
      const [opened] = await auditEvents(app, 'school.opened', res.body.id);
      expect(opened).toMatchObject({
        schoolId: res.body.id,
        actorId: owner.user.id,
        context: { organization_id: organization.id, name: 'North Campus' },
      });
    });

    it('validates the details, including an IANA time zone', async () => {
      const res = await owner
        .as()
        .post(`/api/v1/organizations/${organization.id}/campuses`)
        .send({
          ...CAMPUS,
          address: 'short',
          timezone: '+05:00',
          phone: 'call me',
        })
        .expect(400);
      expect(Object.keys(res.body.error.fields).sort()).toEqual([
        'address',
        'phone',
        'timezone',
      ]);
      await owner
        .as()
        .post(`/api/v1/organizations/${organization.id}/campuses`)
        .send({ name: 'Only a name' })
        .expect(400);
    });

    it('needs the permission (403) and the organization (404)', async () => {
      await reader
        .as()
        .post(`/api/v1/organizations/${organization.id}/campuses`)
        .send(CAMPUS)
        .expect(403);
      await owner
        .as()
        .post(`/api/v1/organizations/${otherOrganization.id}/campuses`)
        .send(CAMPUS)
        .expect(404);
    });

    it('lists and edits its campuses; another organization’s campus is 404', async () => {
      const list = await reader
        .as()
        .get(`/api/v1/organizations/${organization.id}/campuses?search=north`)
        .expect(200);
      expect(list.body.data.map((c: { name: string }) => c.name)).toEqual([
        'North Campus',
      ]);
      const res = await owner
        .as()
        .patch(`/api/v1/organizations/${organization.id}/campuses/${school.id}`)
        .send({ timezone: 'Asia/Karachi', email: 'office@campus.test' })
        .expect(200);
      expect(res.body).toMatchObject({
        timezone: 'Asia/Karachi',
        email: 'office@campus.test',
      });
      const [event] = await auditEvents(app, 'school.updated', school.id);
      expect(event.context).toEqual({ changed: ['email', 'timezone'] });
      await owner
        .as()
        .patch(
          `/api/v1/organizations/${organization.id}/campuses/${otherSchool.id}`,
        )
        .send({ name: 'Mine now' })
        .expect(404);
      await reader
        .as()
        .patch(`/api/v1/organizations/${organization.id}/campuses/${school.id}`)
        .send({ name: 'Renamed' })
        .expect(403);
    });
  });

  describe('billing groups', () => {
    it('starts groups, places campuses and deletes empty groups', async () => {
      const base = `/api/v1/organizations/${organization.id}`;
      const group = await owner
        .as()
        .post(`${base}/billing-groups`)
        .send({ name: 'Lagos purse' })
        .expect(201);
      expect(group.body).toMatchObject({ name: 'Lagos purse', schoolIds: [] });
      const dup = await owner
        .as()
        .post(`${base}/billing-groups`)
        .send({ name: 'LAGOS PURSE' })
        .expect(422);
      expect(dup.body.error.message).toBe(
        'This organization already has a group with that name.',
      );

      const placed = await owner
        .as()
        .put(`${base}/campuses/${school.id}/billing-group`)
        .send({ billingGroupId: group.body.id })
        .expect(200);
      expect(placed.body.billingGroupId).toBe(group.body.id);
      const list = await owner.as().get(`${base}/billing-groups`).expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({ id: group.body.id, schoolIds: [school.id] }),
      ]);

      const busy = await owner
        .as()
        .delete(`${base}/billing-groups/${group.body.id}`)
        .expect(422);
      expect(busy.body.error.message).toBe(
        'Take every campus out of Lagos purse first.',
      );

      await owner
        .as()
        .put(`${base}/campuses/${school.id}/billing-group`)
        .send({ billingGroupId: null })
        .expect(200);
      await owner
        .as()
        .delete(`${base}/billing-groups/${group.body.id}`)
        .expect(204);
      const changes = await auditEvents(
        app,
        'organization.billing_group_changed',
      );
      expect(changes.map((e) => e.context?.change)).toEqual([
        'started',
        'campus_placed',
        'campus_placed',
        'deleted',
      ]);
    });

    it('refuses a group or campus of another organization, and needs "manage organization"', async () => {
      const base = `/api/v1/organizations/${organization.id}`;
      const [{ id: foreignGroup }] = await dataSource.query(
        "INSERT INTO billing_groups (organization_id, name) VALUES ($1, 'Theirs') RETURNING id",
        [otherOrganization.id],
      );
      await owner
        .as()
        .put(`${base}/campuses/${school.id}/billing-group`)
        .send({ billingGroupId: foreignGroup })
        .expect(422);
      await owner
        .as()
        .put(`${base}/campuses/${otherSchool.id}/billing-group`)
        .send({ billingGroupId: null })
        .expect(404);
      await owner
        .as()
        .delete(`${base}/billing-groups/${foreignGroup}`)
        .expect(404);
      await reader.as().get(`${base}/billing-groups`).expect(403);
      await owner
        .as()
        .put(`${base}/campuses/${school.id}/billing-group`)
        .send({})
        .expect(400);
    });
  });

  describe('every organization route', () => {
    const routes = (orgId: string, schoolId: string, otherId: string) =>
      [
        ['patch', `/api/v1/organizations/${orgId}`, { phone: '1' }],
        ['post', `/api/v1/organizations/${orgId}/campuses`, CAMPUS],
        [
          'patch',
          `/api/v1/organizations/${orgId}/campuses/${schoolId}`,
          { name: 'X' },
        ],
        [
          'put',
          `/api/v1/organizations/${orgId}/campuses/${schoolId}/billing-group`,
          { billingGroupId: null },
        ],
        ['get', `/api/v1/organizations/${orgId}/billing-groups`, undefined],
        [
          'post',
          `/api/v1/organizations/${orgId}/billing-groups`,
          { name: 'G' },
        ],
        [
          'delete',
          `/api/v1/organizations/${orgId}/billing-groups/${otherId}`,
          undefined,
        ],
        ['get', `/api/v1/organizations/${orgId}/members`, undefined],
        [
          'post',
          `/api/v1/organizations/${orgId}/members`,
          { email: 'someone@school.test' },
        ],
        [
          'put',
          `/api/v1/organizations/${orgId}/members/${otherId}/permissions`,
          { permissions: null },
        ],
        [
          'delete',
          `/api/v1/organizations/${orgId}/members/${otherId}`,
          undefined,
        ],
      ] as const;

    it('answers 403 to a member without the permission', async () => {
      for (const [method, path, body] of routes(
        organization.id,
        school.id,
        owner.user.id,
      )) {
        const res = await reader
          .as()
          [method](path)
          .send(body as object);
        expect([path, res.status]).toEqual([path, 403]);
      }
    });

    it('answers 404 to someone who cannot read the organization', async () => {
      const stranger = await person(app);
      const paths = [
        ...routes(organization.id, school.id, owner.user.id),
        ['get', `/api/v1/organizations/${organization.id}`, undefined],
        ['get', `/api/v1/organizations/${organization.id}/campuses`, undefined],
      ] as const;
      for (const [method, path, body] of paths) {
        const res = await stranger
          .as()
          [method](path)
          .send(body as object);
        expect([path, res.status]).toEqual([path, 404]);
      }
    });
  });

  describe('members', () => {
    let delegator: Person; // members and campuses only

    beforeAll(async () => {
      delegator = await person(app, { memberOf: [school] });
      await makeOrganizationMember(app, delegator.user, organization, [
        'read organization',
        'manage organization members',
        'manage organization campuses',
      ]);
    });

    it('grants scope to a person the organization knows, with the global role', async () => {
      const staff = await person(app);
      await addMember(app, staff.user, school);
      const res = await owner
        .as()
        .post(`/api/v1/organizations/${organization.id}/members`)
        .send({ email: staff.user.email })
        .expect(201);
      expect(res.body).toMatchObject({
        userId: staff.user.id,
        fullAuthority: true,
        permissions: ORG_PERMISSIONS,
      });
      expect(await globalRoles(staff.user.id)).toEqual(['organization-admin']);
      const [granted] = await auditEvents(
        app,
        'organization_membership.granted',
      );
      expect(granted.context).toEqual({
        organization_id: organization.id,
        user_id: staff.user.id,
      });
      const [attached] = await auditEvents(app, 'role.attached', staff.user.id);
      expect(attached.context).toMatchObject({ role: 'organization-admin' });

      const again = await owner
        .as()
        .post(`/api/v1/organizations/${organization.id}/members`)
        .send({ email: staff.user.email })
        .expect(400);
      expect(again.body.error.fields.email).toEqual([
        `${staff.user.name} already administers this organization.`,
      ]);
    });

    it('never names or grants a stranger', async () => {
      const stranger = await person(app);
      for (const email of [stranger.user.email, 'nobody@nowhere.test']) {
        const res = await owner
          .as()
          .post(`/api/v1/organizations/${organization.id}/members`)
          .send({ email })
          .expect(400);
        expect(res.body.error.fields.email).toEqual([
          'Nobody at this organization uses that email address.',
        ]);
      }
    });

    it('a delegator hands out only what they hold', async () => {
      const staff = await person(app);
      await addMember(app, staff.user, school);
      const res = await delegator
        .as()
        .post(`/api/v1/organizations/${organization.id}/members`)
        .send({ email: staff.user.email })
        .expect(201);
      expect(res.body).toMatchObject({
        fullAuthority: false,
        permissions: [
          'read organization',
          'manage organization members',
          'manage organization campuses',
        ],
      });

      const refused = await delegator
        .as()
        .put(
          `/api/v1/organizations/${organization.id}/members/${staff.user.id}/permissions`,
        )
        .send({
          permissions: [
            'manage organization members',
            'read organization reports',
          ],
        })
        .expect(422);
      expect(refused.body.error.message).toBe(
        'You can only give or take away permissions you hold yourself.',
      );
      await delegator
        .as()
        .put(
          `/api/v1/organizations/${organization.id}/members/${staff.user.id}/permissions`,
        )
        .send({ permissions: null })
        .expect(422);

      const narrowed = await delegator
        .as()
        .put(
          `/api/v1/organizations/${organization.id}/members/${staff.user.id}/permissions`,
        )
        .send({ permissions: ['manage organization members'] })
        .expect(200);
      expect(narrowed.body.permissions).toEqual([
        'read organization',
        'manage organization members',
      ]);
      const [changed] = await auditEvents(
        app,
        'organization_membership.permissions_changed',
      );
      expect(changed.context).toMatchObject({
        user_id: staff.user.id,
        previous_permissions: [
          'read organization',
          'manage organization members',
          'manage organization campuses',
        ],
        permissions: ['read organization', 'manage organization members'],
      });

      // The delegator cannot remove someone who holds more than them.
      const holdsMore = await delegator
        .as()
        .delete(
          `/api/v1/organizations/${organization.id}/members/${owner.user.id}`,
        )
        .expect(422);
      expect(holdsMore.body.error.message).toBe(
        'This person holds more of the organization than you do, so only somebody holding as much can remove them.',
      );
      await delegator
        .as()
        .put(
          `/api/v1/organizations/${organization.id}/members/${staff.user.id}/permissions`,
        )
        .send({ permissions: ['manage platform'] })
        .expect(400);
    });

    it('the last member who can manage members cannot be revoked or narrowed', async () => {
      const org = await createOrganization(app, { name: 'Lone Trust' });
      const campus = await createSchool(app, org);
      const lone = await person(app, { memberOf: [campus] });
      await makeOrganizationMember(app, lone.user, org);

      const narrow = await lone
        .as()
        .put(
          `/api/v1/organizations/${org.id}/members/${lone.user.id}/permissions`,
        )
        .send({ permissions: ['manage organization'] })
        .expect(422);
      expect(narrow.body.error.message).toBe(
        'Lone Trust would be left with nobody who can manage its members. Give somebody else that permission first.',
      );
      const revoke = await platform
        .as()
        .delete(`/api/v1/organizations/${org.id}/members/${lone.user.id}`)
        .expect(422);
      expect(revoke.body.error.message).toBe(
        'Lone Trust would be left with nobody who can manage its members. Grant a replacement first.',
      );
      // A suspended second manager does not count.
      const suspended = await person(app, { memberOf: [campus] });
      await makeOrganizationMember(app, suspended.user, org);
      await dataSource.query(
        "UPDATE users SET account_status = 'suspended' WHERE id = $1",
        [suspended.user.id],
      );
      await platform
        .as()
        .delete(`/api/v1/organizations/${org.id}/members/${lone.user.id}`)
        .expect(422);
    });

    it('revoking keeps the campus membership and the row, and drops the global role when unused', async () => {
      const staff = await person(app);
      await addMember(app, staff.user, school);
      await owner
        .as()
        .post(`/api/v1/organizations/${organization.id}/members`)
        .send({ email: staff.user.email })
        .expect(201);
      await owner
        .as()
        .delete(
          `/api/v1/organizations/${organization.id}/members/${staff.user.id}`,
        )
        .expect(204);

      const [row] = await dataSource.query(
        'SELECT status, ended_at FROM organization_memberships WHERE user_id = $1',
        [staff.user.id],
      );
      expect(row.status).toBe('ended');
      expect(row.ended_at).not.toBeNull();
      const [campus] = await dataSource.query(
        'SELECT status FROM school_memberships WHERE user_id = $1',
        [staff.user.id],
      );
      expect(campus.status).toBe('active');
      expect(await globalRoles(staff.user.id)).toEqual([]);
      const [revoked] = await auditEvents(
        app,
        'organization_membership.revoked',
      );
      expect(revoked.context).toEqual({
        organization_id: organization.id,
        user_id: staff.user.id,
        kept_organization_admin_role: false,
      });
      expect(
        await auditEvents(app, 'role.detached', staff.user.id),
      ).toHaveLength(1);

      // Granting again reactivates the same row.
      await owner
        .as()
        .post(`/api/v1/organizations/${organization.id}/members`)
        .send({ email: staff.user.email })
        .expect(201);
      const [{ n }] = await dataSource.query(
        'SELECT count(*)::int AS n FROM organization_memberships WHERE user_id = $1',
        [staff.user.id],
      );
      expect(n).toBe(1);
    });

    it('lists members; needs "manage organization members"; a non-member is 404', async () => {
      const res = await owner
        .as()
        .get(`/api/v1/organizations/${organization.id}/members`)
        .expect(200);
      expect(res.body.map((m: { userId: string }) => m.userId)).toContain(
        owner.user.id,
      );
      await reader
        .as()
        .get(`/api/v1/organizations/${organization.id}/members`)
        .expect(403);
      const stranger = await person(app);
      await owner
        .as()
        .put(
          `/api/v1/organizations/${organization.id}/members/${stranger.user.id}/permissions`,
        )
        .send({ permissions: null })
        .expect(404);
      await owner
        .as()
        .delete(
          `/api/v1/organizations/${organization.id}/members/${stranger.user.id}`,
        )
        .expect(404);
      await owner
        .as()
        .get(`/api/v1/organizations/${otherOrganization.id}/members`)
        .expect(404);
    });
  });
});
