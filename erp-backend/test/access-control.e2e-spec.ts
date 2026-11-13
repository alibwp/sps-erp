import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  Campus,
  type CampusAccess,
  CampusRoute,
  RequireFeature,
  RequirePermission,
} from '../src/access/access-context.js';
import {
  addMember,
  auditEvents,
  campusAdmin,
  createOrganization,
  createSchool,
  makeOrganizationMember,
  person,
  platformAdmin,
} from './support/campus.js';
import { createTestApp } from './support/test-app.js';
import type { Organization } from '../src/organizations/entities/organization.entity.js';
import type { School } from '../src/organizations/entities/school.entity.js';

interface Fixture {
  permissions: string[];
  roles: Record<string, string[]>;
}
// The seeder lists four admin grants twice ("... custom timetable item");
// a grant is held once, so grants compare as distinct sorted names.
const distinct = (names: string[]) => [...new Set(names)].sort();

const fixture = JSON.parse(
  readFileSync(
    join(import.meta.dirname, 'fixtures', 'reference-permissions.json'),
    'utf8',
  ),
) as Fixture;

// Records owned by a feature that a campus can switch off. The table exists
// only in this test.
@Controller('test-probe/library-records')
class LibraryProbeController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @CampusRoute()
  @RequireFeature('library')
  // A permission the built-in admin role does not hold, so the order of the
  // feature check and the permission check shows.
  @RequirePermission('read safeguarding case')
  async list(@Campus() campus: CampusAccess) {
    return this.dataSource.query(
      'SELECT title FROM e2e_library_records WHERE school_id = $1 ORDER BY title',
      [campus.school.id],
    );
  }
}

describe('Access control (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let organization: Organization;
  let schoolA: School;
  let schoolB: School;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [LibraryProbeController] });
    dataSource = app.get(DataSource);
    organization = await createOrganization(app);
    schoolA = await createSchool(app, organization);
    schoolB = await createSchool(app, organization);
  });

  afterAll(async () => {
    await dataSource.query('DROP TABLE IF EXISTS e2e_library_records');
    await app.close();
  });

  describe('seeded permissions and roles', () => {
    it('equal the reference PermissionSeeder exactly', async () => {
      const permissions = (
        await dataSource.query('SELECT name FROM permissions ORDER BY name')
      ).map((row: { name: string }) => row.name);
      expect(permissions).toEqual([...fixture.permissions].sort());
      expect(permissions).toHaveLength(199);

      const grants = (await dataSource.query(
        `SELECT r.name AS role, coalesce(array_agg(p.name ORDER BY p.name) FILTER (WHERE p.name IS NOT NULL), '{}') AS permissions
           FROM roles r
           LEFT JOIN role_has_permissions rp ON rp.role_id = r.id
           LEFT JOIN permissions p ON p.id = rp.permission_id
          WHERE r.school_id IS NULL
          GROUP BY r.name`,
      )) as Array<{ role: string; permissions: string[] }>;
      const actual = Object.fromEntries(
        grants.map((row) => [row.role, row.permissions]),
      );
      const expected = Object.fromEntries(
        Object.entries(fixture.roles).map(([role, names]) => [
          role,
          distinct(names),
        ]),
      );
      expect(actual).toEqual(expected);
      expect(Object.keys(actual)).toHaveLength(8);
      expect(actual.admin).toHaveLength(176);
      expect(actual['platform-admin']).toHaveLength(199);
    });

    it('a global role cannot be given twice (NULLS NOT DISTINCT)', async () => {
      const someone = await person(app);
      const insert = () =>
        dataSource.query(
          "INSERT INTO model_has_roles (user_id, role_id, school_id) SELECT $1, id, NULL FROM roles WHERE name = 'platform-admin' AND school_id IS NULL",
          [someone.user.id],
        );
      await insert();
      await expect(insert()).rejects.toMatchObject({
        driverError: { code: '23505' },
      });
    });

    it('a platform-wide feature setting cannot be repeated (NULLS NOT DISTINCT)', async () => {
      const insert = () =>
        dataSource.query(
          "INSERT INTO feature_settings (school_id, feature, enabled) VALUES (NULL, 'imports', true)",
        );
      await insert();
      await expect(insert()).rejects.toMatchObject({
        driverError: { code: '23505' },
      });
      await dataSource.query(
        "DELETE FROM feature_settings WHERE school_id IS NULL AND feature = 'imports'",
      );
    });

    it('two shared roles cannot share a name, in any capitals', async () => {
      await expect(
        dataSource.query(
          "INSERT INTO roles (name, school_id) VALUES ('Admin', NULL)",
        ),
      ).rejects.toMatchObject({ driverError: { code: '23505' } });
    });
  });

  describe('audit log', () => {
    it('has a foreign key from school_id to schools', async () => {
      const [constraint] = await dataSource.query(
        `SELECT confrelid::regclass::text AS target
           FROM pg_constraint
          WHERE conrelid = 'audit_events'::regclass AND contype = 'f'
            AND conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'audit_events'::regclass AND attname = 'school_id')]`,
      );
      expect(constraint).toEqual({ target: 'schools' });
      await expect(
        dataSource.query(
          "INSERT INTO audit_events (school_id, action) VALUES (gen_random_uuid(), 'school.updated')",
        ),
      ).rejects.toMatchObject({ driverError: { code: '23503' } });
    });

    it('still refuses UPDATE and DELETE', async () => {
      const [{ id }] = await dataSource.query(
        "INSERT INTO audit_events (school_id, action) VALUES ($1, 'school.updated') RETURNING id",
        [schoolA.id],
      );
      await expect(
        dataSource.query("UPDATE audit_events SET action = 'x' WHERE id = $1", [
          id,
        ]),
      ).rejects.toThrow(/append-only/);
      await expect(
        dataSource.query('DELETE FROM audit_events WHERE id = $1', [id]),
      ).rejects.toThrow(/append-only/);
    });
  });

  describe('working campus (X-School-Id)', () => {
    it('is required on campus routes', async () => {
      const member = await person(app, { memberOf: [schoolA] });
      const res = await member.as().get('/api/v1/me/permissions').expect(400);
      expect(res.body.error.code).toBe('validation_failed');
      expect(res.body.error.fields['X-School-Id']).toBeDefined();
      await member.as('not-a-uuid').get('/api/v1/me/permissions').expect(400);
    });

    it('a member of campus A sending campus B gets 403; a platform admin works in both', async () => {
      const member = await person(app, { memberOf: [schoolA] });
      await member.as(schoolA).get('/api/v1/me/permissions').expect(200);
      const refused = await member
        .as(schoolB)
        .get('/api/v1/me/permissions')
        .expect(403);
      expect(refused.body.error).toEqual({
        code: 'forbidden',
        message: 'You do not have access to that school.',
      });

      const platform = await platformAdmin(app);
      for (const school of [schoolA, schoolB]) {
        const res = await platform
          .as(school)
          .get('/api/v1/me/permissions')
          .expect(200);
        // Every permission except the six organization ones.
        expect(res.body.permissions).toHaveLength(193);
        expect(res.body.permissions).toContain('access all schools');
        expect(res.body.permissions).not.toContain('read organization');
        expect(res.body.roles).toEqual([
          expect.objectContaining({ name: 'platform-admin', global: true }),
        ]);
      }
    });

    it('an unknown campus answers like one the person may not open', async () => {
      const member = await person(app, { memberOf: [schoolA] });
      await member
        .as('00000000-0000-4000-8000-000000000000')
        .get('/api/v1/me/permissions')
        .expect(403);
    });

    it('a suspended or ended membership does not open the campus', async () => {
      const member = await person(app);
      const membership = await addMember(app, member.user, schoolA, {
        status: 'suspended',
      });
      await member.as(schoolA).get('/api/v1/me/permissions').expect(403);
      await dataSource.query(
        "UPDATE school_memberships SET status = 'ended' WHERE id = $1",
        [membership.id],
      );
      await member.as(schoolA).get('/api/v1/me/permissions').expect(403);
    });

    it('the same person is a teacher at one campus and an admin at another, by header', async () => {
      const both = await person(app, {
        memberOf: [schoolA, schoolB],
        roles: [
          ['teacher', schoolA],
          ['admin', schoolB],
        ],
      });
      const atA = await both
        .as(schoolA)
        .get('/api/v1/me/permissions')
        .expect(200);
      const atB = await both
        .as(schoolB)
        .get('/api/v1/me/permissions')
        .expect(200);
      expect(atA.body.roles.map((r: { name: string }) => r.name)).toEqual([
        'teacher',
      ]);
      expect(atA.body.permissions).toEqual(distinct(fixture.roles.teacher));
      expect(atB.body.roles.map((r: { name: string }) => r.name)).toEqual([
        'admin',
      ]);
      expect(atB.body.permissions).toEqual(distinct(fixture.roles.admin));

      // The teacher cannot use the admin's permissions at campus A.
      await both.as(schoolA).get('/api/v1/accounts').expect(403);
      await both.as(schoolB).get('/api/v1/accounts').expect(200);
    });

    it('a campus role never grants a platform or organization permission', async () => {
      await dataSource.query(
        `INSERT INTO roles (name, school_id) VALUES ('Sneaky', $1)`,
        [schoolA.id],
      );
      const [{ id: roleId }] = await dataSource.query(
        "SELECT id FROM roles WHERE name = 'Sneaky'",
      );
      await dataSource.query(
        `INSERT INTO role_has_permissions (role_id, permission_id)
         SELECT $1, id FROM permissions WHERE name IN ('access all schools', 'manage organization', 'read student')`,
        [roleId],
      );
      const sneaky = await person(app, { memberOf: [schoolA] });
      await dataSource.query(
        'INSERT INTO model_has_roles (user_id, role_id, school_id) VALUES ($1, $2, $3)',
        [sneaky.user.id, roleId, schoolA.id],
      );
      const res = await sneaky
        .as(schoolA)
        .get('/api/v1/me/permissions')
        .expect(200);
      expect(res.body.permissions).toEqual(['read student']);
      await sneaky.as(schoolB).get('/api/v1/me/permissions').expect(403);
    });

    it('lists no organization permissions, even for an organization admin at the campus', async () => {
      const orgMember = await person(app, { memberOf: [schoolA] });
      await makeOrganizationMember(app, orgMember.user, organization, [
        'read organization',
      ]);
      const res = await orgMember
        .as(schoolA)
        .get('/api/v1/me/permissions')
        .expect(200);
      expect(res.body.permissions).toEqual([]);
      expect(res.body.roles).toEqual([
        expect.objectContaining({ name: 'organization-admin', global: true }),
      ]);
      // The narrowed organization permissions are read from the organization.
      const organizationView = await orgMember
        .as()
        .get(`/api/v1/organizations/${organization.id}`)
        .expect(200);
      expect(organizationView.body.yourPermissions).toEqual([
        'read organization',
      ]);
    });

    it('an organization admin without a campus membership cannot list that campus’s people', async () => {
      const orgAdmin = await person(app);
      await makeOrganizationMember(app, orgAdmin.user, organization);
      await orgAdmin.as(schoolA).get('/api/v1/accounts').expect(403);
      await orgAdmin.as(schoolA).get('/api/v1/roles').expect(403);
      // Organization screens still answer.
      await orgAdmin
        .as()
        .get(`/api/v1/organizations/${organization.id}`)
        .expect(200);
    });
  });

  describe('GET /api/v1/me/context', () => {
    it('lists the campuses and picks the primary membership, then the oldest', async () => {
      const someone = await person(app);
      await addMember(app, someone.user, schoolB);
      await addMember(app, someone.user, schoolA);
      let res = await someone.as().get('/api/v1/me/context').expect(200);
      expect(res.body.defaultSchoolId).toBe(schoolB.id); // oldest
      expect(res.body.campuses.map((c: { id: string }) => c.id).sort()).toEqual(
        [schoolA.id, schoolB.id].sort(),
      );

      await dataSource.query(
        'UPDATE school_memberships SET is_primary = true WHERE user_id = $1 AND school_id = $2',
        [someone.user.id, schoolA.id],
      );
      res = await someone.as().get('/api/v1/me/context').expect(200);
      expect(res.body.defaultSchoolId).toBe(schoolA.id);
      expect(
        res.body.campuses.find((c: { id: string }) => c.id === schoolA.id),
      ).toMatchObject({
        isPrimary: true,
        organization: { id: organization.id, name: organization.name },
      });
    });

    it('a platform admin with no membership gets every campus, the first as default', async () => {
      const platform = await platformAdmin(app);
      const res = await platform.as().get('/api/v1/me/context').expect(200);
      const [first] = await dataSource.query(
        'SELECT id FROM schools ORDER BY created_at LIMIT 1',
      );
      expect(res.body.defaultSchoolId).toBe(first.id);
      expect(res.body.campuses.length).toBeGreaterThanOrEqual(2);
    });

    it('a person with no campus has no default', async () => {
      const nobody = await person(app);
      const res = await nobody.as().get('/api/v1/me/context').expect(200);
      expect(res.body).toEqual({
        defaultSchoolId: null,
        campuses: [],
        working: null,
      });
    });
  });

  describe('verified email', () => {
    it('administration routes answer 403 email_not_verified without one', async () => {
      const unverified = await person(app, {
        fields: { emailVerifiedAt: null },
        memberOf: [schoolA],
        roles: [['admin', schoolA]],
      });
      for (const path of [
        '/api/v1/accounts',
        '/api/v1/roles',
        '/api/v1/school',
      ]) {
        const res = await unverified.as(schoolA).get(path).expect(403);
        expect(res.body.error).toEqual({
          code: 'email_not_verified',
          message: 'Your email address is not verified.',
        });
      }
      // Reading your own permissions and the context is not administration.
      await unverified.as(schoolA).get('/api/v1/me/permissions').expect(200);
      await unverified.as().get('/api/v1/me/context').expect(200);
    });
  });

  describe('features', () => {
    beforeAll(async () => {
      await dataSource.query(
        'CREATE TABLE IF NOT EXISTS e2e_library_records (school_id uuid NOT NULL, title text NOT NULL)',
      );
      await dataSource.query(
        "INSERT INTO e2e_library_records VALUES ($1, 'Atlas'), ($1, 'Bible'), ($2, 'Other campus')",
        [schoolA.id, schoolB.id],
      );
    });

    it('lists the twelve features with their defaults to any member', async () => {
      const member = await person(app, { memberOf: [schoolA] });
      const res = await member
        .as(schoolA)
        .get('/api/v1/school/features')
        .expect(200);
      expect(res.body.map((f: { feature: string }) => f.feature)).toEqual([
        'attendance',
        'portal',
        'discipline',
        'wellbeing',
        'staff_operations',
        'events',
        'ranking',
        'imports',
        'boarding',
        'library',
        'graduation_plans',
        'programmes',
      ]);
      const off = res.body
        .filter((f: { enabled: boolean }) => !f.enabled)
        .map((f: { feature: string }) => f.feature);
      expect(off).toEqual(['ranking', 'boarding', 'library']);
      expect(
        res.body.find((f: { feature: string }) => f.feature === 'attendance')
          .config,
      ).toEqual({ daily_register: true, lesson_register: true });
    });

    it('a switched-off feature answers 404 to everyone; switched back on, the old records come back', async () => {
      const admin = await campusAdmin(app, schoolA);
      const platform = await platformAdmin(app);
      const outsider = await person(app);

      // Off by default.
      for (const someone of [admin, platform]) {
        await someone
          .as(schoolA)
          .get('/api/v1/test-probe/library-records')
          .expect(404);
      }
      // 404 before the permission check: the admin lacks the permission.
      await admin
        .as(schoolA)
        .get('/api/v1/test-probe/library-records')
        .expect(404);

      await admin
        .as(schoolA)
        .put('/api/v1/school/features/library')
        .send({ enabled: true })
        .expect(200);
      const on = await platform
        .as(schoolA)
        .get('/api/v1/test-probe/library-records')
        .expect(200);
      expect(on.body).toEqual([{ title: 'Atlas' }, { title: 'Bible' }]);
      // On: the permission check applies again.
      await admin
        .as(schoolA)
        .get('/api/v1/test-probe/library-records')
        .expect(403);
      // Another campus keeps its own setting.
      await platform
        .as(schoolB)
        .get('/api/v1/test-probe/library-records')
        .expect(404);

      await admin
        .as(schoolA)
        .put('/api/v1/school/features/library')
        .send({ enabled: false })
        .expect(200);
      await platform
        .as(schoolA)
        .get('/api/v1/test-probe/library-records')
        .expect(404);
      const [{ n }] = await dataSource.query(
        'SELECT count(*)::int AS n FROM e2e_library_records WHERE school_id = $1',
        [schoolA.id],
      );
      expect(n).toBe(2);

      await admin
        .as(schoolA)
        .put('/api/v1/school/features/library')
        .send({ enabled: true })
        .expect(200);
      const again = await platform
        .as(schoolA)
        .get('/api/v1/test-probe/library-records')
        .expect(200);
      expect(again.body).toEqual(on.body);

      // Someone with no access to the campus still gets 403 first.
      await outsider
        .as(schoolA)
        .get('/api/v1/test-probe/library-records')
        .expect(403);

      const enabled = await auditEvents(app, 'feature.enabled');
      const disabled = await auditEvents(app, 'feature.disabled');
      expect(enabled.at(-1)).toMatchObject({
        schoolId: schoolA.id,
        actorId: admin.user.id,
        context: { feature: 'library', school_id: schoolA.id },
      });
      expect(disabled.at(-1)?.context).toEqual({
        feature: 'library',
        school_id: schoolA.id,
      });
    });

    it('the platform-wide setting applies to a campus without its own', async () => {
      await dataSource.query(
        "INSERT INTO feature_settings (school_id, feature, enabled) VALUES (NULL, 'ranking', true)",
      );
      const member = await person(app, { memberOf: [schoolB] });
      const res = await member
        .as(schoolB)
        .get('/api/v1/school/features')
        .expect(200);
      expect(
        res.body.find((f: { feature: string }) => f.feature === 'ranking'),
      ).toMatchObject({ enabled: true, source: 'platform' });
      await dataSource.query(
        "DELETE FROM feature_settings WHERE school_id IS NULL AND feature = 'ranking'",
      );
    });

    it('keeps settings: portal areas merge one switch at a time', async () => {
      const admin = await campusAdmin(app, schoolB);
      await admin
        .as(schoolB)
        .put('/api/v1/school/features/portal')
        .send({ enabled: true, config: { invoices: false } })
        .expect(200);
      const res = await admin
        .as(schoolB)
        .put('/api/v1/school/features/portal')
        .send({ enabled: true, config: { results: false } })
        .expect(200);
      expect(res.body).toMatchObject({ enabled: true, source: 'campus' });
      expect(res.body.config).toMatchObject({
        invoices: false,
        results: false,
        attendance: true,
      });

      const bad = await admin
        .as(schoolB)
        .put('/api/v1/school/features/portal')
        .send({ enabled: true, config: { payroll: true, results: 'no' } })
        .expect(400);
      expect(bad.body.error.fields.config).toHaveLength(2);
      await admin
        .as(schoolB)
        .put('/api/v1/school/features/events')
        .send({ enabled: true, config: { anything: true } })
        .expect(400);
      await admin
        .as(schoolB)
        .put('/api/v1/school/features/not-a-feature')
        .send({ enabled: true })
        .expect(404);
    });

    it('switching needs "manage school settings" at the campus', async () => {
      const teacher = await person(app, {
        memberOf: [schoolA],
        roles: [['teacher', schoolA]],
      });
      await teacher
        .as(schoolA)
        .put('/api/v1/school/features/events')
        .send({ enabled: false })
        .expect(403);
      const adminB = await campusAdmin(app, schoolB);
      await adminB
        .as(schoolA)
        .put('/api/v1/school/features/events')
        .send({ enabled: false })
        .expect(403);
    });
  });
});
