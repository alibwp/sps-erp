import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
import { MailService } from '../src/mail/mail.service.js';
import type { Organization } from '../src/organizations/entities/organization.entity.js';
import type { School } from '../src/organizations/entities/school.entity.js';
import { StaffLeave } from '../src/staff/staff-leave.service.js';
import { StaffProfiles } from '../src/staff/staff-profiles.service.js';
import {
  calendarBody,
  createCalendar,
  personWith,
} from './support/academic.js';
import {
  type Person,
  campusAdmin,
  createOrganization,
  createSchool,
  person,
} from './support/campus.js';
import { makeLevel, makeSection } from './support/curriculum.js';
import { admit, activeSection } from './support/enrollments.js';
import { fakeMail } from './support/identity.js';
import { createTestApp } from './support/test-app.js';

// 12:00 UTC: 17:00 in Karachi, the same day.
const NOW = new Date('2026-11-10T12:00:00Z');

describe('Staff operations (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const clock = new FixedClock(NOW);
  const mail = fakeMail();
  let organization: Organization;
  let campus: School;
  let admin: Person;
  let yearId: string;
  let levelId: string;
  // Cover the leave the test in progress marks.
  let coverRefusal: string | null = null;

  const refusal = (res: { body: { error: { message: string } } }) =>
    res.body.error.message;

  const member = (roles: string[] = ['teacher'], school = campus) =>
    person(app, {
      memberOf: [school],
      roles: roles.map((role) => [role, school] as [string, School]),
    });

  const profileFor = async (
    who: Person,
    fields: Record<string, unknown> = {},
    as = admin,
    school = campus,
  ) =>
    (
      await as
        .as(school)
        .post('/api/v1/staff-profiles')
        .send({ userId: who.user.id, employmentType: 'full_time', ...fields })
        .expect(201)
    ).body as { id: string; userId: string };

  const update = (id: string, body: object, as = admin, school = campus) =>
    as.as(school).patch(`/api/v1/staff-profiles/${id}`).send(body);

  const membership = async (userId: string, school = campus) =>
    (
      await dataSource.query(
        'SELECT status FROM school_memberships WHERE user_id = $1 AND school_id = $2',
        [userId, school.id],
      )
    )[0]?.status;

  const askLeave = (profileId: string, startsOn: string, endsOn: string) =>
    admin.as(campus).post('/api/v1/staff-leave').send({
      staffProfileId: profileId,
      type: 'annual',
      startsOn,
      endsOn,
    });

  const move = (id: string, status: string, as = admin) =>
    as
      .as(campus)
      .post(`/api/v1/staff-leave/${id}/status-changes`)
      .send({ status });

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: MailService, useValue: mail.service },
      ],
    });
    dataSource = app.get(DataSource);
    app.get(StaffLeave).registerApprovalCheck(async () => coverRefusal);
    organization = await createOrganization(app);
    campus = await createSchool(app, organization, {
      timezone: 'Asia/Karachi',
    });
    const setup = await campusAdmin(app, campus);
    yearId = (await createCalendar(setup, campus, calendarBody(2026), true)).id;
    levelId = (await makeLevel(setup, campus)).id;
  });

  // A section of the running year whose class teacher is the person.
  const homeroomOf = async (teacher: Person) =>
    (
      await makeSection(admin, campus, yearId, levelId, {
        homeroomTeacherId: teacher.user.id,
      })
    ).id;
  const homeroomTeacher = async (sectionId: string) =>
    (
      await dataSource.query(
        'SELECT homeroom_teacher_id FROM academic_cycle_sections WHERE id = $1',
        [sectionId],
      )
    )[0].homeroom_teacher_id;

  // Requests are limited per person (60 a minute).
  beforeEach(async () => {
    admin = await campusAdmin(app, campus);
  });

  afterEach(() => {
    clock.set(NOW);
    coverRefusal = null;
  });

  afterAll(async () => {
    await app.close();
  });

  it('every route answers 404 while the campus has staff operations off', async () => {
    const quiet = await createSchool(app, organization);
    const quietAdmin = await campusAdmin(app, quiet);
    await dataSource.query(
      `INSERT INTO feature_settings (school_id, feature, enabled) VALUES ($1, 'staff_operations', false)`,
      [quiet.id],
    );
    await quietAdmin.as(quiet).get('/api/v1/staff-profiles').expect(404);
    await quietAdmin.as(quiet).get('/api/v1/staff-leave').expect(404);
    await quietAdmin
      .as(quiet)
      .post('/api/v1/staff-profiles')
      .send({ userId: quietAdmin.user.id, employmentType: 'full_time' })
      .expect(404);
  });

  describe('employment records', () => {
    it('one record per member here, never a learner, staff numbers unique ignoring case', async () => {
      const teacher = await member();
      const record = await profileFor(teacher, {
        staffNumber: 'ST-001',
        jobTitle: 'Mathematics teacher',
        department: 'Sciences',
        joinedOn: '2024-08-01',
      });
      const again = await admin
        .as(campus)
        .post('/api/v1/staff-profiles')
        .send({ userId: teacher.user.id, employmentType: 'contract' })
        .expect(422);
      expect(refusal(again)).toBe(
        'This person already has an employment record here.',
      );

      const other = await member();
      const taken = await admin
        .as(campus)
        .post('/api/v1/staff-profiles')
        .send({
          userId: other.user.id,
          employmentType: 'part_time',
          staffNumber: 'st-001',
        })
        .expect(422);
      expect(refusal(taken)).toBe(
        'Another person already has staff number st-001.',
      );

      const stranger = await person(app);
      const outside = await admin
        .as(campus)
        .post('/api/v1/staff-profiles')
        .send({ userId: stranger.user.id, employmentType: 'intern' })
        .expect(400);
      expect(outside.body.error.fields.userId).toEqual([
        'Choose somebody who works in this school.',
      ]);

      const section = await activeSection(admin, campus, yearId, levelId);
      const learner = await admit(admin, campus, section.id);
      const res = await admin
        .as(campus)
        .post('/api/v1/staff-profiles')
        .send({ userId: learner.userId, employmentType: 'volunteer' })
        .expect(422);
      expect(refusal(res)).toBe(
        'This person is still a learner. A learner cannot be made staff.',
      );

      // The person reads their own record without "read staff profile".
      const own = await teacher
        .as(campus)
        .get(`/api/v1/staff-profiles/${record.id}`)
        .expect(200);
      expect(own.body).toMatchObject({
        staffNumber: 'ST-001',
        jobTitle: 'Mathematics teacher',
        employmentType: 'full_time',
        status: 'active',
        joinedOn: '2024-08-01',
      });
      await teacher
        .as(campus)
        .get(`/api/v1/staff-profiles/${(await profileFor(other)).id}`)
        .expect(403);
    });

    it('weekly hours never overlap on one day', async () => {
      const record = await profileFor(await member());
      const add = (dayOfWeek: number, startsAt: string, endsAt: string) =>
        admin
          .as(campus)
          .post(`/api/v1/staff-profiles/${record.id}/availability`)
          .send({ dayOfWeek, startsAt, endsAt });
      await add(1, '08:00', '12:00').expect(201);
      const overlap = await add(1, '11:00', '14:00').expect(422);
      expect(refusal(overlap)).toBe(
        'These hours overlap 08:00 to 12:00 on the same day.',
      );
      await add(1, '12:00', '14:00').expect(201);
      await add(2, '09:00', '11:00').expect(201);
      const backwards = await add(3, '10:00', '09:00').expect(400);
      expect(backwards.body.error.fields.endsAt).toEqual([
        'The ends at field must be a time after starts at.',
      ]);
      const shown = await admin
        .as(campus)
        .get(`/api/v1/staff-profiles/${record.id}`)
        .expect(200);
      expect(
        shown.body.availability.map(
          (h: { dayOfWeek: number; startsAt: string }) =>
            `${h.dayOfWeek} ${h.startsAt}`,
        ),
      ).toEqual(['1 08:00', '1 12:00', '2 09:00']);
    });

    it('credentials have an expiry and are verified by somebody else', async () => {
      const teacher = await member();
      const record = await profileFor(teacher);
      const credential = await admin
        .as(campus)
        .post(`/api/v1/staff-profiles/${record.id}/credentials`)
        .send({
          type: 'teaching licence',
          name: 'Licensed teacher',
          issuedOn: '2020-01-01',
          expiresOn: '2025-12-31',
        })
        .expect(201);
      expect(credential.body).toMatchObject({
        expired: true,
        verifiedAt: null,
      });

      const verified = await admin
        .as(campus)
        .post(
          `/api/v1/staff-profiles/${record.id}/credentials/${credential.body.id}/verify`,
        )
        .expect(200);
      expect(verified.body.verifiedBy).toEqual({
        id: admin.user.id,
        name: admin.user.name,
      });

      // Nobody verifies their own.
      const ownRecord = await profileFor(admin);
      const own = await admin
        .as(campus)
        .post(`/api/v1/staff-profiles/${ownRecord.id}/credentials`)
        .send({ type: 'first aid', name: 'First aid at work' })
        .expect(201);
      const refused = await admin
        .as(campus)
        .post(
          `/api/v1/staff-profiles/${ownRecord.id}/credentials/${own.body.id}/verify`,
        )
        .expect(403);
      expect(refusal(refused)).toBe('You cannot verify your own credential.');

      const backwards = await admin
        .as(campus)
        .post(`/api/v1/staff-profiles/${record.id}/credentials`)
        .send({
          type: 'check',
          name: 'Background check',
          issuedOn: '2026-01-01',
          expiresOn: '2025-01-01',
        })
        .expect(400);
      expect(backwards.body.error.fields.expiresOn).toEqual([
        'The expires on field must be a date after or equal to issued on.',
      ]);
    });
  });

  describe('leaving', () => {
    it('refuses leaving before joining, for a person who holds more, and for the last role manager', async () => {
      const teacher = await member();
      const record = await profileFor(teacher, { joinedOn: '2026-09-01' });
      const early = await update(record.id, {
        status: 'left',
        leftOn: '2026-08-31',
      }).expect(422);
      expect(refusal(early)).toBe('A person cannot leave before they joined.');

      // Holds "update school" here, which a campus admin cannot give.
      const senior = await personWith(app, campus, ['update school']);
      const seniorRecord = await profileFor(senior);
      const more = await update(seniorRecord.id, { status: 'left' }).expect(
        422,
      );
      expect(refusal(more)).toBe(
        'This person holds more at this school than you do, so you cannot record that they left.',
      );

      const solo = await createSchool(app, organization);
      const soloAdmin = await campusAdmin(app, solo);
      const soloRecord = await profileFor(soloAdmin, {}, soloAdmin, solo);
      const last = await update(
        soloRecord.id,
        { status: 'left' },
        soloAdmin,
        solo,
      ).expect(422);
      expect(refusal(last)).toBe(
        'Nobody else at this campus can manage roles. Give somebody else role management before recording that this person left.',
      );
    });

    it('a last day ahead keeps access and duties until then, and cancels leave after it', async () => {
      const teacher = await member();
      const record = await profileFor(teacher);
      const section = await homeroomOf(teacher);
      const before = (
        await askLeave(record.id, '2026-11-12', '2026-11-13').expect(201)
      ).body;
      const after = (
        await askLeave(record.id, '2026-11-20', '2026-11-25').expect(201)
      ).body;

      const left = await update(record.id, {
        status: 'left',
        leftOn: '2026-11-15',
      }).expect(200);
      expect(left.body).toMatchObject({ status: 'left', leftOn: '2026-11-15' });
      expect(await membership(teacher.user.id)).toBe('active');
      // Still their class until they go.
      expect(await homeroomTeacher(section)).toBe(teacher.user.id);

      const statuses = await dataSource.query(
        'SELECT id, status FROM staff_leave_requests WHERE staff_profile_id = $1 ORDER BY starts_on',
        [record.id],
      );
      expect(statuses).toEqual([
        { id: before.id, status: 'requested' },
        { id: after.id, status: 'cancelled' },
      ]);
      const history = await admin
        .as(campus)
        .get(`/api/v1/staff-leave/${after.id}`)
        .expect(200);
      expect(history.body.history).toEqual([
        expect.objectContaining({
          fromStatus: 'requested',
          toStatus: 'cancelled',
          reason: 'The person left on 15 Nov 2026.',
        }),
      ]);

      const refused = await askLeave(
        record.id,
        '2026-12-01',
        '2026-12-02',
      ).expect(422);
      expect(refusal(refused)).toBe('This person no longer works here.');
    });

    it('a past last day ends access at once, and taking them back restores it', async () => {
      const teacher = await member();
      const record = await profileFor(teacher, { joinedOn: '2025-01-01' });
      const section = await homeroomOf(teacher);
      await update(record.id, { status: 'left', leftOn: '2026-11-09' }).expect(
        200,
      );
      expect(await membership(teacher.user.id)).toBe('ended');
      expect(await homeroomTeacher(section)).toBeNull();

      await update(record.id, { status: 'active' }).expect(200);
      expect(await membership(teacher.user.id)).toBe('active');
      const back = await admin
        .as(campus)
        .get(`/api/v1/staff-profiles/${record.id}`)
        .expect(200);
      expect(back.body).toMatchObject({ status: 'active', leftOn: null });
    });

    it('the leavers job ends access once campus today is after the last day', async () => {
      const teacher = await member();
      const record = await profileFor(teacher);
      await update(record.id, { status: 'left', leftOn: '2026-11-10' }).expect(
        200,
      );
      const job = app.get(StaffProfiles);

      // Still their last day in Karachi.
      expect(await job.endLeaversAccess()).toBe(0);
      expect(await membership(teacher.user.id)).toBe('active');

      // 20:00 UTC is already 11 November in Karachi, though not in UTC.
      clock.set(new Date('2026-11-10T20:00:00Z'));
      expect(await job.endLeaversAccess()).toBeGreaterThanOrEqual(1);
      expect(await membership(teacher.user.id)).toBe('ended');
    });

    it('the leavers job keeps the last role manager, and logs it', async () => {
      const solo = await createSchool(app, organization);
      const soloAdmin = await campusAdmin(app, solo);
      const helper = await campusAdmin(app, solo);
      const record = await profileFor(soloAdmin, {}, soloAdmin, solo);
      await update(
        record.id,
        { status: 'left', leftOn: '2026-11-10' },
        soloAdmin,
        solo,
      ).expect(200);
      // The other manager leaves the campus first.
      await dataSource.query(
        `UPDATE school_memberships SET status = 'ended' WHERE user_id = $1 AND school_id = $2`,
        [helper.user.id, solo.id],
      );
      clock.set(new Date('2026-11-12T12:00:00Z'));
      await app.get(StaffProfiles).endLeaversAccess();
      expect(await membership(soloAdmin.user.id, solo)).toBe('active');
    });
  });

  describe('leave', () => {
    it('refuses leave that ends before it starts, and overlapping leave', async () => {
      const record = await profileFor(await member());
      const backwards = await askLeave(
        record.id,
        '2026-12-05',
        '2026-12-01',
      ).expect(400);
      expect(backwards.body.error.fields.endsOn).toEqual([
        'Leave cannot end before it starts.',
      ]);
      await askLeave(record.id, '2026-12-01', '2026-12-05').expect(201);
      const overlap = await askLeave(
        record.id,
        '2026-12-05',
        '2026-12-08',
      ).expect(422);
      expect(refusal(overlap)).toBe('These days are already asked for.');
      await askLeave(record.id, '2026-12-06', '2026-12-08').expect(201);
    });

    it('follows the transition table', async () => {
      const record = await profileFor(await member());
      const leave = (
        await askLeave(record.id, '2027-01-04', '2027-01-08').expect(201)
      ).body;
      expect(leave).toMatchObject({ status: 'requested', days: 5 });

      await move(leave.id, 'declined').expect(200);
      // Declined leave may be asked for again, unless the days were taken meanwhile.
      const clash = (
        await askLeave(record.id, '2027-01-08', '2027-01-09').expect(201)
      ).body;
      expect(refusal(await move(leave.id, 'requested').expect(422))).toBe(
        'These days are already asked for.',
      );
      await move(clash.id, 'cancelled').expect(200);
      await move(leave.id, 'requested').expect(200);
      await move(leave.id, 'approved').expect(200);
      expect(refusal(await move(leave.id, 'requested').expect(422))).toBe(
        'Leave cannot move from Approved to Requested.',
      );
      const taken = await move(leave.id, 'taken').expect(200);
      expect(taken.body.status).toBe('taken');
      expect(refusal(await move(leave.id, 'cancelled').expect(422))).toBe(
        'Leave cannot move from Taken to Cancelled.',
      );
      expect(
        taken.body.history.map(
          (step: { fromStatus: string; toStatus: string }) =>
            `${step.fromStatus}>${step.toStatus}`,
        ),
      ).toEqual([
        'requested>declined',
        'declined>requested',
        'requested>approved',
        'approved>taken',
      ]);
    });

    it('who may move leave: approvers decide, never their own; the person may cancel theirs', async () => {
      const teacher = await member();
      const record = await profileFor(teacher);
      const leave = (
        await askLeave(record.id, '2027-02-01', '2027-02-02').expect(201)
      ).body;
      const colleague = await member();

      // A teacher holds no leave permission: they read and cancel only their own.
      await teacher
        .as(campus)
        .get(`/api/v1/staff-leave/${leave.id}`)
        .expect(200);
      await colleague
        .as(campus)
        .get(`/api/v1/staff-leave/${leave.id}`)
        .expect(403);
      await move(leave.id, 'approved', teacher).expect(403);
      await move(leave.id, 'cancelled', colleague).expect(403);
      await move(leave.id, 'cancelled', teacher).expect(200);

      // An approver never decides their own leave.
      const ownRecord = await profileFor(admin);
      const own = (
        await askLeave(ownRecord.id, '2027-03-01', '2027-03-02').expect(201)
      ).body;
      await move(own.id, 'approved').expect(403);
      await move(own.id, 'declined').expect(403);
      await move(own.id, 'cancelled').expect(200);
    });

    it('approval waits for the cover check', async () => {
      const record = await profileFor(await member());
      const leave = (
        await askLeave(record.id, '2027-04-05', '2027-04-06').expect(201)
      ).body;
      coverRefusal =
        'Ada still covers 2 lessons in these days. Withdraw that cover first.';
      const res = await move(leave.id, 'approved').expect(422);
      expect(refusal(res)).toBe(coverRefusal);
      coverRefusal = null;
      await move(leave.id, 'approved').expect(200);
    });
  });
});
