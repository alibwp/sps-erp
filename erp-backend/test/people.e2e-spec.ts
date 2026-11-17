import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
import { GuardianLinks } from '../src/enrollments/guardian-links.service.js';
import { MailService } from '../src/mail/mail.service.js';
import type { School } from '../src/organizations/entities/school.entity.js';
import { calendarBody, createCalendar } from './support/academic.js';
import {
  type Person,
  addMember,
  campusAdmin,
  createOrganization,
  createSchool,
  person,
  platformAdmin,
} from './support/campus.js';
import { makeLevel } from './support/curriculum.js';
import {
  type Admitted,
  activeSection,
  admit,
  changeStatus,
} from './support/enrollments.js';
import { fakeMail } from './support/identity.js';
import { createTestApp } from './support/test-app.js';

const NOW = new Date('2026-11-10T12:00:00Z');

describe('Teachers, administrators and parents (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const clock = new FixedClock(NOW);
  const mail = fakeMail();
  let north: School;
  let south: School;
  let northAdmin: Person;
  let southAdmin: Person;
  let northSection: { id: string };
  let southSection: { id: string };
  const unlinked: Array<{ guardianId: string; learnerId: string }> = [];
  let counter = 0;

  const refusal = (res: { body: { error: { message: string } } }) =>
    res.body.error.message;
  const newPerson = (fields: Record<string, unknown> = {}) => {
    counter += 1;
    return {
      name: `Person ${counter}`,
      email: `person.${counter}.${Date.now().toString(36)}@school.test`,
      ...fields,
    };
  };
  const roleNames = async (userId: string, school: School) =>
    (
      await dataSource.query(
        `SELECT r.name FROM model_has_roles a JOIN roles r ON r.id = a.role_id
          WHERE a.user_id = $1 AND a.school_id = $2 ORDER BY r.name`,
        [userId, school.id],
      )
    ).map((row: { name: string }) => row.name);
  const membership = async (userId: string, school: School) =>
    (
      await dataSource.query(
        'SELECT status FROM school_memberships WHERE user_id = $1 AND school_id = $2',
        [userId, school.id],
      )
    )[0]?.status;
  const deletedAt = async (userId: string) =>
    (
      await dataSource.query('SELECT deleted_at FROM users WHERE id = $1', [
        userId,
      ])
    )[0].deleted_at;

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: MailService, useValue: mail.service },
      ],
    });
    dataSource = app.get(DataSource);
    app.get(GuardianLinks).registerUnlinkHook(async (_manager, link) => {
      unlinked.push({ guardianId: link.guardianId, learnerId: link.learnerId });
    });
    const organization = await createOrganization(app);
    north = await createSchool(app, organization, { name: 'North Campus' });
    south = await createSchool(app, organization, { name: 'South Campus' });
    northAdmin = await campusAdmin(app, north);
    southAdmin = await campusAdmin(app, south);
    const northYear = await createCalendar(
      northAdmin,
      north,
      calendarBody(2026),
      true,
    );
    northSection = await activeSection(
      northAdmin,
      north,
      northYear.id,
      (await makeLevel(northAdmin, north)).id,
    );
    const southYear = await createCalendar(
      southAdmin,
      south,
      calendarBody(2026),
      true,
    );
    southSection = await activeSection(
      southAdmin,
      south,
      southYear.id,
      (await makeLevel(southAdmin, south)).id,
    );
  });

  // Requests are limited per person (60 a minute).
  beforeEach(async () => {
    northAdmin = await campusAdmin(app, north);
    southAdmin = await campusAdmin(app, south);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('teachers', () => {
    it('adds a teacher: the account, the teacher role here and an invitation', async () => {
      const body = newPerson({ phone: '0300 1234567' });
      const res = await northAdmin
        .as(north)
        .post('/api/v1/teachers')
        .send(body)
        .expect(201);
      expect(res.body).toMatchObject({
        name: body.name,
        email: body.email,
        accountStatus: 'invited',
        phone: '0300 1234567',
      });
      expect(await roleNames(res.body.id, north)).toEqual(['teacher']);
      expect(mail.sent.some((m) => m.to === body.email)).toBe(true);

      const again = await northAdmin
        .as(north)
        .post('/api/v1/teachers')
        .send(body)
        .expect(422);
      expect(refusal(again)).toBe(
        `${body.name} already holds the teacher role at this school.`,
      );

      const list = await northAdmin
        .as(north)
        .get('/api/v1/teachers')
        .expect(200);
      expect(list.body.data.map((p: { id: string }) => p.id)).toContain(
        res.body.id,
      );
      await northAdmin
        .as(north)
        .get(`/api/v1/teachers/${res.body.id}`)
        .expect(200);
      const renamed = await northAdmin
        .as(north)
        .patch(`/api/v1/teachers/${res.body.id}`)
        .send({ name: 'Ms Teacher' })
        .expect(200);
      expect(renamed.body.name).toBe('Ms Teacher');
    });

    it('refuses an enrolled learner', async () => {
      const learner = await admit(northAdmin, north, northSection.id);
      const res = await northAdmin
        .as(north)
        .post('/api/v1/teachers')
        .send({ name: learner.name, email: learner.email })
        .expect(422);
      expect(refusal(res)).toBe(
        `${learner.name} is a learner. A learner cannot be made staff.`,
      );
      await northAdmin
        .as(north)
        .get(`/api/v1/teachers/${learner.userId}`)
        .expect(404);
    });

    it('removing ends the membership and deletes the account unless the person belongs elsewhere', async () => {
      const gone = await northAdmin
        .as(north)
        .post('/api/v1/teachers')
        .send(newPerson())
        .expect(201);
      await northAdmin
        .as(north)
        .delete(`/api/v1/teachers/${gone.body.id}`)
        .expect(204);
      expect(await membership(gone.body.id, north)).toBe('ended');
      expect(await deletedAt(gone.body.id)).not.toBeNull();
      await northAdmin
        .as(north)
        .get(`/api/v1/teachers/${gone.body.id}`)
        .expect(404);

      const shared = await northAdmin
        .as(north)
        .post('/api/v1/teachers')
        .send(newPerson())
        .expect(201);
      await southAdmin
        .as(south)
        .post('/api/v1/teachers')
        .send({ name: shared.body.name, email: shared.body.email })
        .expect(201);
      await northAdmin
        .as(north)
        .delete(`/api/v1/teachers/${shared.body.id}`)
        .expect(204);
      expect(await membership(shared.body.id, north)).toBe('ended');
      expect(await membership(shared.body.id, south)).toBe('active');
      expect(await deletedAt(shared.body.id)).toBeNull();
    });
  });

  describe('administrators', () => {
    it('only the platform administrator holds the admin permissions', async () => {
      await northAdmin
        .as(north)
        .post('/api/v1/admins')
        .send(newPerson())
        .expect(403);
      await northAdmin.as(north).get('/api/v1/admins').expect(403);

      const platform = await platformAdmin(app);
      const res = await platform
        .as(north)
        .post('/api/v1/admins')
        .send(newPerson())
        .expect(201);
      expect(await roleNames(res.body.id, north)).toEqual(['admin']);
      const list = await platform.as(north).get('/api/v1/admins').expect(200);
      expect(list.body.data.map((p: { id: string }) => p.id)).toContain(
        res.body.id,
      );
    });
  });

  describe('parents and guardian links', () => {
    it('one parent record per person, shared across campuses', async () => {
      const body = newPerson();
      const here = await northAdmin
        .as(north)
        .post('/api/v1/parents')
        .send(body)
        .expect(201);
      expect(await roleNames(here.body.id, north)).toEqual(['parent']);
      await southAdmin.as(south).post('/api/v1/parents').send(body).expect(201);
      expect(await roleNames(here.body.id, south)).toEqual(['parent']);
      expect(
        await dataSource.query(
          'SELECT count(*)::int AS n FROM parent_records WHERE user_id = $1',
          [here.body.id],
        ),
      ).toEqual([{ n: 1 }]);
    });

    it('links a learner of this campus in any state, and unlinking runs the hook', async () => {
      const parent = await northAdmin
        .as(north)
        .post('/api/v1/parents')
        .send(newPerson())
        .expect(201);
      const child = await admit(northAdmin, north, northSection.id);
      const graduate = await admit(northAdmin, north, northSection.id);
      await changeStatus(northAdmin, north, graduate.id, {
        status: 'graduated',
      }).expect(200);
      const farAway = await admit(southAdmin, south, southSection.id);
      const link = (studentId: string) =>
        northAdmin
          .as(north)
          .post(`/api/v1/parents/${parent.body.id}/children`)
          .send({ studentId });

      await link(child.id).expect(200);
      await link(child.id).expect(200);
      const both = await link(graduate.id).expect(200);
      expect(both.body.map((s: { id: string }) => s.id).sort()).toEqual(
        [child.id, graduate.id].sort(),
      );
      expect(refusal(await link(farAway.id).expect(422))).toBe(
        'This learner does not attend this school.',
      );

      await northAdmin
        .as(north)
        .delete(`/api/v1/parents/${parent.body.id}/children/${child.id}`)
        .expect(204);
      expect(unlinked).toContainEqual({
        guardianId: parent.body.id,
        learnerId: child.userId,
      });
      const left = await northAdmin
        .as(north)
        .get(`/api/v1/parents/${parent.body.id}/children`)
        .expect(200);
      expect(left.body.map((s: { id: string }) => s.id)).toEqual([graduate.id]);
    });

    it('removing a parent unlinks their learners here first', async () => {
      const parent = await northAdmin
        .as(north)
        .post('/api/v1/parents')
        .send(newPerson())
        .expect(201);
      const child = await admit(northAdmin, north, northSection.id);
      await northAdmin
        .as(north)
        .post(`/api/v1/parents/${parent.body.id}/children`)
        .send({ studentId: child.id })
        .expect(200);

      await northAdmin
        .as(north)
        .delete(`/api/v1/parents/${parent.body.id}`)
        .expect(204);
      expect(unlinked).toContainEqual({
        guardianId: parent.body.id,
        learnerId: child.userId,
      });
      expect(
        await dataSource.query(
          `SELECT count(*)::int AS n FROM parent_record_user link
             JOIN parent_records r ON r.id = link.parent_record_id WHERE r.user_id = $1`,
          [parent.body.id],
        ),
      ).toEqual([{ n: 0 }]);
      expect(await membership(parent.body.id, north)).toBe('ended');
    });

    it('a person who is not a parent here is not found', async () => {
      const teacher = await northAdmin
        .as(north)
        .post('/api/v1/teachers')
        .send(newPerson())
        .expect(201);
      const res = await northAdmin
        .as(north)
        .get(`/api/v1/parents/${teacher.body.id}`)
        .expect(404);
      expect(refusal(res)).toBe('Parent not found.');
    });
  });

  describe('what a parent reads', () => {
    let child: Admitted;
    let other: Admitted;

    beforeAll(async () => {
      const admin = await campusAdmin(app, north);
      child = await admit(admin, north, northSection.id);
      other = await admit(admin, north, northSection.id);
    });

    async function guardianOf(learner: Admitted, roles: string[]) {
      const guardian = await person(app, {
        memberOf: [north],
        roles: roles.map((role) => [role, north] as [string, School]),
      });
      await northAdmin
        .as(north)
        .post(`/api/v1/parents/${guardian.user.id}/children`)
        .send({ studentId: learner.id })
        .expect(200);
      return guardian;
    }

    it('a parent lists only their own children, and any other learner is not found', async () => {
      const parent = await guardianOf(child, ['parent']);
      const list = await parent.as(north).get('/api/v1/students').expect(200);
      expect(list.body.data.map((s: { id: string }) => s.id)).toEqual([
        child.id,
      ]);
      await parent.as(north).get(`/api/v1/students/${child.id}`).expect(200);
      await parent.as(north).get(`/api/v1/students/${other.id}`).expect(404);
      await parent
        .as(north)
        .get(`/api/v1/students/${other.id}/placements`)
        .expect(404);
      await parent
        .as(north)
        .get(`/api/v1/students/${other.id}/status-changes`)
        .expect(404);
    });

    it('a teacher who is also a parent keeps their staff reach', async () => {
      const teacher = await guardianOf(child, ['teacher', 'parent']);
      const list = await teacher.as(north).get('/api/v1/students').expect(200);
      expect(list.body.data.map((s: { id: string }) => s.id)).toEqual(
        expect.arrayContaining([child.id, other.id]),
      );
      await teacher.as(north).get(`/api/v1/students/${other.id}`).expect(200);
    });

    it('a parent at another campus too reads only their children here', async () => {
      const parent = await guardianOf(child, ['parent']);
      await addMember(app, parent.user, south);
      const list = await parent.as(north).get('/api/v1/students').expect(200);
      expect(list.body.data).toHaveLength(1);
    });
  });
});
