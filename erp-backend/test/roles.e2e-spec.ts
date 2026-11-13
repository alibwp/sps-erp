import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Organization } from '../src/organizations/entities/organization.entity.js';
import type { School } from '../src/organizations/entities/school.entity.js';
import {
  type Person,
  auditEvents,
  campusAdmin,
  createOrganization,
  createSchool,
  person,
  platformAdmin,
  sharedRole,
} from './support/campus.js';
import { createTestApp } from './support/test-app.js';

const LAST_MANAGER =
  'Nobody at this campus could manage roles after that. Give somebody else role management first.';

describe('Campus roles (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let organization: Organization;
  let schoolA: School;
  let schoolB: School;
  let adminA: Person;
  let adminB: Person;
  let platform: Person;
  let teacherA: Person;

  const holders = async (roleId: string, school: School) =>
    (
      await dataSource.query(
        'SELECT user_id FROM model_has_roles WHERE role_id = $1 AND school_id = $2 ORDER BY user_id',
        [roleId, school.id],
      )
    ).map((row: { user_id: string }) => row.user_id);

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    organization = await createOrganization(app);
    schoolA = await createSchool(app, organization);
    schoolB = await createSchool(app, organization);
    adminA = await campusAdmin(app, schoolA);
    adminB = await campusAdmin(app, schoolB);
    platform = await platformAdmin(app);
    teacherA = await person(app, {
      memberOf: [schoolA],
      roles: [['teacher', schoolA]],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('reading', () => {
    it('lists the campus’s roles and the shared ones, never the platform roles', async () => {
      const res = await adminA.as(schoolA).get('/api/v1/roles').expect(200);
      const names = res.body.data.map((role: { name: string }) => role.name);
      expect(names).toEqual([
        'accountant',
        'admin',
        'librarian',
        'parent',
        'student',
        'teacher',
      ]);
      expect(res.body.meta).toEqual({ page: 1, perPage: 20, total: 6 });
      const admin = res.body.data.find(
        (r: { name: string }) => r.name === 'admin',
      );
      expect(admin).toMatchObject({ shared: true, builtIn: true, holders: 1 });
      expect(
        res.body.data.find((r: { name: string }) => r.name === 'librarian'),
      ).toMatchObject({ shared: true, builtIn: false, holders: 0 });
    });

    it('needs "read role" (403) and searches by name', async () => {
      await teacherA.as(schoolA).get('/api/v1/roles').expect(403);
      const res = await adminA
        .as(schoolA)
        .get('/api/v1/roles?search=lib&sort=-name')
        .expect(200);
      expect(res.body.data.map((r: { name: string }) => r.name)).toEqual([
        'librarian',
      ]);
      await adminA.as(schoolA).get('/api/v1/roles?sort=secret').expect(400);
    });

    it('shows one role with who holds it here; a platform role is 404', async () => {
      const teacher = await sharedRole(app, 'teacher');
      const res = await adminA
        .as(schoolA)
        .get(`/api/v1/roles/${teacher.id}`)
        .expect(200);
      expect(res.body.people).toEqual([
        {
          id: teacherA.user.id,
          name: teacherA.user.name,
          email: teacherA.user.email,
        },
      ]);
      expect(res.body.permissions).toContain('take attendance');

      const platformRole = await sharedRole(app, 'platform-admin');
      await adminA
        .as(schoolA)
        .get(`/api/v1/roles/${platformRole.id}`)
        .expect(404);
      await adminA.as(schoolA).get('/api/v1/roles/not-a-uuid').expect(400);
    });

    it('grantable permissions: what the author holds here, never platform or organization ones', async () => {
      const res = await adminA
        .as(schoolA)
        .get('/api/v1/roles/grantable-permissions')
        .expect(200);
      expect(res.body.permissions).toContain('manage role');
      expect(res.body.permissions).not.toContain('read safeguarding case');
      expect(res.body.permissions).not.toContain('manage organization');
      expect(res.body.permissions).toHaveLength(176);

      const all = await platform
        .as(schoolA)
        .get('/api/v1/roles/grantable-permissions')
        .expect(200);
      expect(all.body.permissions).toHaveLength(199 - 9);
      await teacherA
        .as(schoolA)
        .get('/api/v1/roles/grantable-permissions')
        .expect(403);
    });
  });

  describe('writing', () => {
    it('creates a role and records role.created and permission.attached', async () => {
      const res = await adminA
        .as(schoolA)
        .post('/api/v1/roles')
        .send({
          name: ' Registrar ',
          description: 'Admissions office',
          permissions: ['read student', 'update student', 'read student'],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        name: 'Registrar',
        description: 'Admissions office',
        shared: false,
        builtIn: false,
        permissions: ['read student', 'update student'],
        holders: 0,
      });
      const [created] = await auditEvents(app, 'role.created', res.body.id);
      expect(created).toMatchObject({
        schoolId: schoolA.id,
        actorId: adminA.user.id,
        context: {
          name: 'Registrar',
          permissions: ['read student', 'update student'],
        },
      });
      const [attached] = await auditEvents(
        app,
        'permission.attached',
        res.body.id,
      );
      expect(attached.context).toEqual({
        permissions: ['read student', 'update student'],
      });
    });

    it('refuses a name the campus already uses, in any capitals, shared roles included', async () => {
      for (const name of ['registrar', 'LIBRARIAN', 'Admin']) {
        const res = await adminA
          .as(schoolA)
          .post('/api/v1/roles')
          .send({ name, permissions: [] })
          .expect(422);
        expect(res.body.error.message).toBe(
          `This campus already has a role called ${name}.`,
        );
      }
      // Another campus may use the name.
      await adminB
        .as(schoolB)
        .post('/api/v1/roles')
        .send({ name: 'Registrar', permissions: ['read student'] })
        .expect(201);
    });

    it('a role holding a permission its author lacks is refused with 422', async () => {
      const res = await adminA
        .as(schoolA)
        .post('/api/v1/roles')
        .send({
          name: 'Counsellor',
          permissions: ['read student', 'read safeguarding case'],
        })
        .expect(422);
      expect(res.body.error).toEqual({
        code: 'rule_violation',
        message:
          'You cannot put something in a role that you do not hold yourself: read safeguarding case.',
      });
      // Platform and organization permissions never go in a campus role,
      // not even from a platform administrator.
      await platform
        .as(schoolA)
        .post('/api/v1/roles')
        .send({ name: 'Super', permissions: ['manage platform'] })
        .expect(422);
    });

    it('refuses unknown permission names (400) and needs "manage role" (403)', async () => {
      const res = await adminA
        .as(schoolA)
        .post('/api/v1/roles')
        .send({ name: 'Typo', permissions: ['read studnet'] })
        .expect(400);
      expect(res.body.error.fields.permissions).toEqual([
        '"read studnet" is not a permission.',
      ]);
      await teacherA
        .as(schoolA)
        .post('/api/v1/roles')
        .send({ name: 'Mine', permissions: [] })
        .expect(403);
      await adminA.as(schoolA).post('/api/v1/roles').send({}).expect(400);
    });

    it('every role route needs its permission (403)', async () => {
      const [{ id }] = await dataSource.query(
        "SELECT id FROM roles WHERE school_id = $1 AND name = 'Registrar'",
        [schoolA.id],
      );
      const t = teacherA.as(schoolA);
      await t.get(`/api/v1/roles/${id}`).expect(403);
      await t.put(`/api/v1/roles/${id}`).send({ permissions: [] }).expect(403);
      await t
        .post(`/api/v1/roles/${id}/copies`)
        .send({ name: 'X' })
        .expect(403);
      await t.post(`/api/v1/roles/${id}/archive`).expect(403);
      await t.post(`/api/v1/roles/${id}/restore`).expect(403);
      await t
        .delete(`/api/v1/accounts/${teacherA.user.id}/roles/${id}`)
        .expect(403);
    });

    it('another campus’s role answers 404 everywhere', async () => {
      const [{ id }] = await dataSource.query(
        "SELECT id FROM roles WHERE school_id = $1 AND name = 'Registrar'",
        [schoolB.id],
      );
      const a = adminA.as(schoolA);
      await a.get(`/api/v1/roles/${id}`).expect(404);
      await a.put(`/api/v1/roles/${id}`).send({ permissions: [] }).expect(404);
      await a
        .post(`/api/v1/roles/${id}/copies`)
        .send({ name: 'X' })
        .expect(404);
      await a.post(`/api/v1/roles/${id}/archive`).expect(404);
      await a.post(`/api/v1/roles/${id}/restore`).expect(404);
      await a
        .post(`/api/v1/accounts/${adminA.user.id}/roles`)
        .send({ roleId: id })
        .expect(404);
    });

    it('a built-in role cannot be changed or archived', async () => {
      const teacher = await sharedRole(app, 'teacher');
      const res = await adminA
        .as(schoolA)
        .put(`/api/v1/roles/${teacher.id}`)
        .send({ permissions: ['read student'] })
        .expect(422);
      expect(res.body.error.message).toBe(
        'teacher is a built-in role. Copy it and change the copy instead.',
      );
      await adminA
        .as(schoolA)
        .post(`/api/v1/roles/${teacher.id}/archive`)
        .expect(422);
    });

    it('changing a shared role gives the campus its own copy and moves its holders', async () => {
      const librarian = await sharedRole(app, 'librarian');
      const holderA = await person(app, {
        memberOf: [schoolA],
        roles: [['librarian', schoolA]],
      });
      const holderB = await person(app, {
        memberOf: [schoolB],
        roles: [['librarian', schoolB]],
      });

      const res = await adminA
        .as(schoolA)
        .put(`/api/v1/roles/${librarian.id}`)
        .send({
          permissions: ['read student', 'read library'],
          description: 'Our library',
        })
        .expect(200);
      expect(res.body.id).not.toBe(librarian.id);
      expect(res.body).toMatchObject({
        name: 'librarian',
        shared: false,
        permissions: ['read library', 'read student'],
        holders: 1,
      });
      expect(await holders(res.body.id, schoolA)).toEqual([holderA.user.id]);
      expect(await holders(librarian.id, schoolA)).toEqual([]);
      expect(await holders(librarian.id, schoolB)).toEqual([holderB.user.id]);

      // The shared role is untouched and listed once at A, as the copy.
      const shared = await adminB
        .as(schoolB)
        .get(`/api/v1/roles/${librarian.id}`)
        .expect(200);
      expect(shared.body.permissions).toHaveLength(4);
      const list = await adminA.as(schoolA).get('/api/v1/roles').expect(200);
      expect(
        list.body.data.filter((r: { name: string }) => r.name === 'librarian'),
      ).toEqual([expect.objectContaining({ id: res.body.id })]);

      // The campus must now give its own copy.
      const giving = await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${adminA.user.id}/roles`)
        .send({ roleId: librarian.id })
        .expect(422);
      expect(giving.body.error.message).toBe(
        'This campus keeps its own librarian. Give that one instead.',
      );

      const [tailored] = await auditEvents(app, 'role.created', res.body.id);
      expect(tailored.context).toEqual({
        name: 'librarian',
        tailored_from: librarian.id,
      });
      const [updated] = await auditEvents(app, 'role.updated', res.body.id);
      expect(updated.context).toMatchObject({
        permissions: ['read student', 'read library'],
      });
      const [detached] = await auditEvents(
        app,
        'permission.detached',
        res.body.id,
      );
      expect(detached.context).toEqual({
        permissions: ['lend library item', 'manage library'],
      });
    });

    it('an author cannot take out of a role what they do not hold', async () => {
      const created = await platform
        .as(schoolA)
        .post('/api/v1/roles')
        .send({
          name: 'Safeguarding lead',
          permissions: ['read student', 'read safeguarding case'],
        })
        .expect(201);
      const res = await adminA
        .as(schoolA)
        .put(`/api/v1/roles/${created.body.id}`)
        .send({ permissions: ['read student'] })
        .expect(422);
      expect(res.body.error.message).toBe(
        'You cannot take something out of a role that you do not hold yourself: read safeguarding case.',
      );
    });

    it('copying gives only what the person copying holds', async () => {
      const [{ id }] = await dataSource.query(
        "SELECT id FROM roles WHERE school_id = $1 AND name = 'Safeguarding lead'",
        [schoolA.id],
      );
      const res = await adminA
        .as(schoolA)
        .post(`/api/v1/roles/${id}/copies`)
        .send({ name: 'Pastoral assistant' })
        .expect(201);
      expect(res.body.permissions).toEqual(['read student']);
      await adminA
        .as(schoolA)
        .post(`/api/v1/roles/${id}/copies`)
        .send({ name: 'pastoral ASSISTANT' })
        .expect(422);
    });

    it('archives and restores a role; holders keep it; an archived role cannot be given', async () => {
      const created = await adminA
        .as(schoolA)
        .post('/api/v1/roles')
        .send({ name: 'Exams officer', permissions: ['read exam'] })
        .expect(201);
      const holder = await person(app, { memberOf: [schoolA] });
      await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${holder.user.id}/roles`)
        .send({ roleId: created.body.id })
        .expect(200);

      const archived = await adminA
        .as(schoolA)
        .post(`/api/v1/roles/${created.body.id}/archive`)
        .expect(200);
      expect(archived.body.archivedAt).not.toBeNull();
      expect(await holders(created.body.id, schoolA)).toEqual([holder.user.id]);
      const [event] = await auditEvents(app, 'role.archived', created.body.id);
      expect(event.context).toEqual({ name: 'Exams officer', holders: 1 });

      const other = await person(app, { memberOf: [schoolA] });
      const res = await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${other.user.id}/roles`)
        .send({ roleId: created.body.id })
        .expect(422);
      expect(res.body.error.message).toBe(
        'Exams officer is no longer offered at this campus.',
      );
      const listed = await adminA
        .as(schoolA)
        .get('/api/v1/roles?archived=true')
        .expect(200);
      expect(listed.body.data.map((r: { name: string }) => r.name)).toEqual([
        'Exams officer',
      ]);

      const restored = await adminA
        .as(schoolA)
        .post(`/api/v1/roles/${created.body.id}/restore`)
        .expect(200);
      expect(restored.body.archivedAt).toBeNull();
      const updates = await auditEvents(app, 'role.updated', created.body.id);
      expect(updates.at(-1)?.context).toEqual({
        name: 'Exams officer',
        restored: true,
      });
    });
  });

  describe('giving and taking roles', () => {
    it('gives a staff role once and records role.attached', async () => {
      const member = await person(app, { memberOf: [schoolA] });
      const teacher = await sharedRole(app, 'teacher');
      const res = await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${member.user.id}/roles`)
        .send({ roleId: teacher.id })
        .expect(200);
      expect(res.body.roles).toEqual([
        { id: teacher.id, name: 'teacher', global: false },
      ]);
      await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${member.user.id}/roles`)
        .send({ roleId: teacher.id })
        .expect(200);
      const events = await auditEvents(app, 'role.attached', member.user.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        schoolId: schoolA.id,
        actorId: adminA.user.id,
        context: { role: 'teacher', role_id: teacher.id },
      });

      await adminA
        .as(schoolA)
        .delete(`/api/v1/accounts/${member.user.id}/roles/${teacher.id}`)
        .expect(204);
      const [detached] = await auditEvents(
        app,
        'role.detached',
        member.user.id,
      );
      expect(detached.context).toEqual({
        role: 'teacher',
        role_id: teacher.id,
      });
      expect(await holders(teacher.id, schoolA)).not.toContain(member.user.id);
    });

    it('refuses the platform roles (404) and the family roles (422)', async () => {
      const member = await person(app, { memberOf: [schoolA] });
      for (const name of ['platform-admin', 'organization-admin']) {
        const role = await sharedRole(app, name);
        await platform
          .as(schoolA)
          .post(`/api/v1/accounts/${member.user.id}/roles`)
          .send({ roleId: role.id })
          .expect(404);
      }
      const student = await sharedRole(app, 'student');
      const res = await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${member.user.id}/roles`)
        .send({ roleId: student.id })
        .expect(422);
      expect(res.body.error.message).toBe(
        'student is given through enrollment and guardian links, not here.',
      );
    });

    it('nobody gives or takes a role that holds more than they do', async () => {
      const [{ id }] = await dataSource.query(
        "SELECT id FROM roles WHERE school_id = $1 AND name = 'Safeguarding lead'",
        [schoolA.id],
      );
      const member = await person(app, { memberOf: [schoolA] });
      const give = await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${member.user.id}/roles`)
        .send({ roleId: id })
        .expect(422);
      expect(give.body.error.message).toBe(
        'You cannot put something in a role that you do not hold yourself: read safeguarding case.',
      );
      await platform
        .as(schoolA)
        .post(`/api/v1/accounts/${member.user.id}/roles`)
        .send({ roleId: id })
        .expect(200);
      const take = await adminA
        .as(schoolA)
        .delete(`/api/v1/accounts/${member.user.id}/roles/${id}`)
        .expect(422);
      expect(take.body.error.message).toBe(
        'Safeguarding lead holds more than you do, so you cannot take it away.',
      );
    });

    it('needs "manage role" (403) and a member of the campus (404)', async () => {
      const teacher = await sharedRole(app, 'teacher');
      const member = await person(app, { memberOf: [schoolA] });
      await teacherA
        .as(schoolA)
        .post(`/api/v1/accounts/${member.user.id}/roles`)
        .send({ roleId: teacher.id })
        .expect(403);
      await adminA
        .as(schoolA)
        .post(`/api/v1/accounts/${adminB.user.id}/roles`)
        .send({ roleId: teacher.id })
        .expect(404);
      await adminA
        .as(schoolA)
        .delete(`/api/v1/accounts/${adminB.user.id}/roles/${teacher.id}`)
        .expect(404);
    });
  });

  describe('the last role manager', () => {
    let schoolC: School;
    let adminC: Person;

    beforeAll(async () => {
      schoolC = await createSchool(app, organization);
      adminC = await campusAdmin(app, schoolC);
    });

    it('cannot lose the admin role, from themself or a platform admin', async () => {
      const admin = await sharedRole(app, 'admin');
      for (const actor of [adminC, platform]) {
        const res = await actor
          .as(schoolC)
          .delete(`/api/v1/accounts/${adminC.user.id}/roles/${admin.id}`)
          .expect(422);
        expect(res.body.error.message).toBe(LAST_MANAGER);
      }
      expect(await holders(admin.id, schoolC)).toEqual([adminC.user.id]);
    });

    it('a role change that removes the last "manage role" is refused', async () => {
      const created = await platform
        .as(schoolC)
        .post('/api/v1/roles')
        .send({
          name: 'Role keeper',
          permissions: ['read role', 'manage role'],
        })
        .expect(201);
      const keeper = await person(app, { memberOf: [schoolC] });
      await platform
        .as(schoolC)
        .post(`/api/v1/accounts/${keeper.user.id}/roles`)
        .send({ roleId: created.body.id })
        .expect(200);
      const admin = await sharedRole(app, 'admin');
      // With the keeper, the admin role can go.
      await platform
        .as(schoolC)
        .delete(`/api/v1/accounts/${adminC.user.id}/roles/${admin.id}`)
        .expect(204);
      // Now the keeper's role is the only way left to manage roles.
      const res = await platform
        .as(schoolC)
        .put(`/api/v1/roles/${created.body.id}`)
        .send({ permissions: ['read role'] })
        .expect(422);
      expect(res.body.error.message).toBe(LAST_MANAGER);
      // Unrelated changes to the role are fine.
      await platform
        .as(schoolC)
        .put(`/api/v1/roles/${created.body.id}`)
        .send({
          permissions: ['read role', 'manage role', 'read student'],
        })
        .expect(200);
    });

    it('a campus with no role manager does not block other changes', async () => {
      const schoolD = await createSchool(app, organization);
      const member = await person(app, { memberOf: [schoolD] });
      const teacher = await sharedRole(app, 'teacher');
      await platform
        .as(schoolD)
        .post(`/api/v1/accounts/${member.user.id}/roles`)
        .send({ roleId: teacher.id })
        .expect(200);
      await platform
        .as(schoolD)
        .delete(`/api/v1/accounts/${member.user.id}/roles/${teacher.id}`)
        .expect(204);
      // A platform admin gives the new campus its first role manager.
      const admin = await sharedRole(app, 'admin');
      await platform
        .as(schoolD)
        .post(`/api/v1/accounts/${member.user.id}/roles`)
        .send({ roleId: admin.id })
        .expect(200);
    });
  });
});
