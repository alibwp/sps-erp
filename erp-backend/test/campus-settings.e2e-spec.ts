import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StorageService } from '../src/storage/storage.service.js';
import type { Organization } from '../src/organizations/entities/organization.entity.js';
import type { School } from '../src/organizations/entities/school.entity.js';
import {
  type Person,
  auditEvents,
  campusAdmin,
  createOrganization,
  createSchool,
  makeOrganizationMember,
  person,
} from './support/campus.js';
import { createTestApp } from './support/test-app.js';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);
const JPG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64, 2),
]);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);

const LABELS = {
  academic_year: 'School year',
  class_level: 'Grade',
  section: 'Homeroom',
  period: 'Semester',
  course: 'Course',
  fee: 'Tuition',
  homeroom_teacher: 'Advisor',
};

describe('Campus settings (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let organization: Organization;
  let schoolA: School;
  let schoolB: School;
  let adminA: Person;
  let teacherA: Person;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    organization = await createOrganization(app);
    schoolA = await createSchool(app, organization, { name: 'Alpha Campus' });
    schoolB = await createSchool(app, organization);
    adminA = await campusAdmin(app, schoolA);
    teacherA = await person(app, {
      memberOf: [schoolA],
      roles: [['teacher', schoolA]],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('details', () => {
    it('reads the working campus with "manage school settings"; a teacher gets 403', async () => {
      const res = await adminA.as(schoolA).get('/api/v1/school').expect(200);
      expect(res.body).toMatchObject({
        id: schoolA.id,
        name: 'Alpha Campus',
        timezone: 'UTC',
      });
      await teacherA.as(schoolA).get('/api/v1/school').expect(403);
      await adminA.as(schoolB).get('/api/v1/school').expect(403);
    });

    it('edits only the fields sent, including the time zone, and records what changed', async () => {
      const res = await adminA
        .as(schoolA)
        .patch('/api/v1/school')
        .send({ timezone: 'Africa/Lagos', initials: 'ALP', phone: '' })
        .expect(200);
      expect(res.body).toMatchObject({
        name: 'Alpha Campus',
        timezone: 'Africa/Lagos',
        initials: 'ALP',
        phone: null,
      });
      const [event] = await auditEvents(app, 'school.updated', schoolA.id);
      expect(event).toMatchObject({
        schoolId: schoolA.id,
        actorId: adminA.user.id,
        context: { changed: ['initials', 'timezone'] },
      });

      const bad = await adminA
        .as(schoolA)
        .patch('/api/v1/school')
        .send({
          timezone: 'Mars/Olympus',
          initials: 'TOO-LONG-INITIALS',
          name: '',
        })
        .expect(400);
      expect(Object.keys(bad.body.error.fields).sort()).toEqual([
        'initials',
        'name',
        'timezone',
      ]);
      await teacherA
        .as(schoolA)
        .patch('/api/v1/school')
        .send({ name: 'Mine' })
        .expect(403);
    });

    it('completes the details step once every required field is filled', async () => {
      const res = await adminA
        .as(schoolA)
        .patch('/api/v1/school')
        .send({
          address: '1 Broad Street',
          country: 'Nigeria',
          state: 'Lagos',
          city: 'Lagos',
          postalCode: '100001',
        })
        .expect(200);
      expect(res.body.setupDetailsCompletedAt).not.toBeNull();
    });
  });

  describe('logo', () => {
    it('stores a png or jpg checked by content and serves it through a signed link', async () => {
      const res = await adminA
        .as(schoolA)
        .post('/api/v1/school/logo')
        .attach('logo', PNG, {
          filename: 'logo.txt',
          contentType: 'text/plain',
        })
        .expect(200);
      expect(res.body.logoUrl).toMatch(/\/api\/v1\/storage\/files\?/);
      const [{ logo_path: first }] = await dataSource.query(
        'SELECT logo_path FROM schools WHERE id = $1',
        [schoolA.id],
      );
      expect(first).toMatch(
        new RegExp(`^schools/${schoolA.id}/logo-.+\\.png$`),
      );

      await adminA
        .as(schoolA)
        .post('/api/v1/school/logo')
        .attach('logo', JPG, 'logo.jpg')
        .expect(200);
      const storage = app.get(StorageService);
      // The replaced file is deleted after commit.
      for (let i = 0; i < 20 && (await storage.exists(first)); i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(await storage.exists(first)).toBe(false);

      const removed = await adminA
        .as(schoolA)
        .delete('/api/v1/school/logo')
        .expect(200);
      expect(removed.body.logoUrl).toBeNull();
      const events = await auditEvents(app, 'school.updated', schoolA.id);
      expect(
        events.filter((e) =>
          ((e.context?.changed as string[] | undefined) ?? []).includes('logo'),
        ),
      ).toHaveLength(3);
    });

    it('refuses SVG and other files, and anything over 5120 KB', async () => {
      const svg = await adminA
        .as(schoolA)
        .post('/api/v1/school/logo')
        .attach('logo', SVG, { filename: 'logo.png', contentType: 'image/png' })
        .expect(400);
      expect(svg.body.error.fields).toEqual({
        logo: ['The logo field must be a file of type: jpg, jpeg, png.'],
      });
      const big = Buffer.concat([PNG, Buffer.alloc(5120 * 1024)]);
      const large = await adminA
        .as(schoolA)
        .post('/api/v1/school/logo')
        .attach('logo', big, 'big.png')
        .expect(400);
      expect(large.body.error.fields).toEqual({
        logo: ['The logo field must not be greater than 5120 kilobytes.'],
      });
      await adminA.as(schoolA).post('/api/v1/school/logo').expect(400);
      await teacherA
        .as(schoolA)
        .post('/api/v1/school/logo')
        .attach('logo', PNG, 'logo.png')
        .expect(403);
      await teacherA.as(schoolA).delete('/api/v1/school/logo').expect(403);
      // Another campus's settings are out of reach (403 on the header).
      await adminA
        .as(schoolB)
        .post('/api/v1/school/logo')
        .attach('logo', PNG, 'logo.png')
        .expect(403);
      await adminA
        .as(schoolB)
        .patch('/api/v1/school')
        .send({ name: 'Mine' })
        .expect(403);
      await adminA
        .as(schoolB)
        .put('/api/v1/school/operating-profile')
        .send({ preset: 'hybrid', labels: LABELS })
        .expect(403);
    });
  });

  describe('operating profile', () => {
    it('any member reads the words; only a settings manager changes them', async () => {
      const read = await teacherA
        .as(schoolA)
        .get('/api/v1/school/operating-profile')
        .expect(200);
      expect(read.body).toMatchObject({
        preset: 'home_sections',
        labels: { class_level: 'Class' },
        setupCompletedAt: null,
      });

      await teacherA
        .as(schoolA)
        .put('/api/v1/school/operating-profile')
        .send({ preset: 'subject_schedule', labels: LABELS })
        .expect(403);

      const res = await adminA
        .as(schoolA)
        .put('/api/v1/school/operating-profile')
        .send({ preset: 'subject_schedule', labels: LABELS })
        .expect(200);
      expect(res.body.labels).toEqual(LABELS);
      expect(res.body.setupCompletedAt).not.toBeNull();

      // Another campus keeps its own words.
      const adminB = await campusAdmin(app, schoolB);
      const other = await adminB
        .as(schoolB)
        .get('/api/v1/school/operating-profile')
        .expect(200);
      expect(other.body.labels.class_level).toBe('Class');
    });

    it('needs a known preset and all seven words, each at most 40 characters', async () => {
      const res = await adminA
        .as(schoolA)
        .put('/api/v1/school/operating-profile')
        .send({
          preset: 'montessori',
          labels: { ...LABELS, section: 'x'.repeat(41), extra: 'no' },
        })
        .expect(400);
      expect(Object.keys(res.body.error.fields).sort()).toEqual([
        'labels.extra',
        'labels.section',
        'preset',
      ]);
      const { fee: _fee, ...missing } = LABELS;
      await adminA
        .as(schoolA)
        .put('/api/v1/school/operating-profile')
        .send({ preset: 'hybrid', labels: missing })
        .expect(400);
    });
  });
  describe('organization campus managers (SchoolPolicy::update)', () => {
    it('a member with "manage organization campuses" changes the settings of a campus they work in', async () => {
      const manager = await person(app, { memberOf: [schoolA] });
      await makeOrganizationMember(app, manager.user, organization, [
        'read organization',
        'manage organization campuses',
      ]);
      const m = manager.as(schoolA);
      await m.patch('/api/v1/school').send({ phone: '+234 1234' }).expect(200);
      await m
        .post('/api/v1/school/logo')
        .attach('logo', PNG, 'logo.png')
        .expect(200);
      await m.delete('/api/v1/school/logo').expect(200);
      await m
        .put('/api/v1/school/operating-profile')
        .send({ preset: 'hybrid', labels: LABELS })
        .expect(200);
      await m
        .put('/api/v1/school/features/events')
        .send({ enabled: false })
        .expect(200);
      await m
        .put('/api/v1/school/features/events')
        .send({ enabled: true })
        .expect(200);
      // "read organization" also reads the campus (SchoolPolicy::view).
      await m.get('/api/v1/school').expect(200);
    });

    it('"read organization" reads a campus the member works in, and nothing else', async () => {
      const reader = await person(app, { memberOf: [schoolA] });
      await makeOrganizationMember(app, reader.user, organization, [
        'read organization',
      ]);
      const res = await reader.as(schoolA).get('/api/v1/school').expect(200);
      expect(res.body.id).toBe(schoolA.id);
      // Reading does not allow changing.
      await reader
        .as(schoolA)
        .patch('/api/v1/school')
        .send({ phone: '12345' })
        .expect(403);
      // Not without a membership at the campus.
      const away = await person(app);
      await makeOrganizationMember(app, away.user, organization, [
        'read organization',
      ]);
      await away.as(schoolA).get('/api/v1/school').expect(403);
      // Not through another organization.
      const otherOrganization = await createOrganization(app);
      const elsewhere = await person(app, { memberOf: [schoolA] });
      await makeOrganizationMember(app, elsewhere.user, otherOrganization, [
        'read organization',
      ]);
      await elsewhere.as(schoolA).get('/api/v1/school').expect(403);
    });

    it('still needs the campus, the permission, and the campus’s own organization', async () => {
      // Without a membership at the campus: the header is refused.
      const away = await person(app);
      await makeOrganizationMember(app, away.user, organization, [
        'read organization',
        'manage organization campuses',
      ]);
      await away
        .as(schoolA)
        .patch('/api/v1/school')
        .send({ phone: '12345' })
        .expect(403);

      // Organization scope without "manage organization campuses".
      const membersOnly = await person(app, { memberOf: [schoolA] });
      await makeOrganizationMember(app, membersOnly.user, organization, [
        'read organization',
        'manage organization members',
      ]);
      await membersOnly
        .as(schoolA)
        .patch('/api/v1/school')
        .send({ phone: '12345' })
        .expect(403);

      // Managing another organization's campuses does not reach this one.
      const otherOrganization = await createOrganization(app);
      const elsewhere = await person(app, { memberOf: [schoolA] });
      await makeOrganizationMember(app, elsewhere.user, otherOrganization);
      await elsewhere
        .as(schoolA)
        .patch('/api/v1/school')
        .send({ phone: '12345' })
        .expect(403);
      await elsewhere
        .as(schoolA)
        .put('/api/v1/school/features/events')
        .send({ enabled: false })
        .expect(403);
    });

    it('switching a feature also accepts "update school", like PATCH /school', async () => {
      const [{ id: roleId }] = await dataSource.query(
        "INSERT INTO roles (name, school_id) VALUES ('Campus editor', $1) RETURNING id",
        [schoolA.id],
      );
      await dataSource.query(
        "INSERT INTO role_has_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE name = 'update school'",
        [roleId],
      );
      const editor = await person(app, { memberOf: [schoolA] });
      await dataSource.query(
        'INSERT INTO model_has_roles (user_id, role_id, school_id) VALUES ($1, $2, $3)',
        [editor.user.id, roleId, schoolA.id],
      );
      await editor
        .as(schoolA)
        .put('/api/v1/school/features/programmes')
        .send({ enabled: false })
        .expect(200);
      await editor
        .as(schoolA)
        .patch('/api/v1/school')
        .send({ phone: '+1 555 0100' })
        .expect(200);
    });
  });
});
