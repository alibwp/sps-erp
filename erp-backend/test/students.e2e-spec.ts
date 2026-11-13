import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
import { EnrollmentStatuses } from '../src/enrollments/enrollment-statuses.service.js';
import { MailService } from '../src/mail/mail.service.js';
import type { Organization } from '../src/organizations/entities/organization.entity.js';
import type { School } from '../src/organizations/entities/school.entity.js';
import {
  type CalendarYear,
  calendarBody,
  createCalendar,
  period,
} from './support/academic.js';
import {
  type Person,
  auditEvents,
  campusAdmin,
  createOrganization,
  createSchool,
  person,
  sharedRole,
} from './support/campus.js';
import {
  type Level,
  makeLevel,
  makeOfferings,
  makeSubject,
  teacherOf,
} from './support/curriculum.js';
import {
  activeSection,
  admission,
  admit,
  changeStatus,
  place,
} from './support/enrollments.js';
import { fakeMail } from './support/identity.js';
import { createTestApp } from './support/test-app.js';

const NOW = new Date('2026-11-10T12:00:00Z');

describe('Students and enrollments (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const clock = new FixedClock(NOW);
  const mail = fakeMail();
  let organization: Organization;
  let campus: School;
  let admin: Person;
  let year: CalendarYear;
  let level: Level;
  let a: { id: string; name: string };
  let b: { id: string; name: string };

  const refusal = (res: { body: { error: { message: string } } }) =>
    res.body.error.message;
  const post = (body: object, school: School = campus) =>
    admin.as(school).post('/api/v1/students').send(body);

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: MailService, useValue: mail.service },
      ],
    });
    dataSource = app.get(DataSource);
    organization = await createOrganization(app);
    campus = await createSchool(app, organization, { initials: 'SPS' });
    admin = await campusAdmin(app, campus);
    year = await createCalendar(admin, campus, calendarBody(2026), true);
    level = await makeLevel(admin, campus, { name: 'Basic 3' });
    a = await activeSection(admin, campus, year.id, level.id, {
      name: 'A',
      capacity: 30,
    });
    b = await activeSection(admin, campus, year.id, level.id, { name: 'B' });
  });

  // Requests are limited per person (60 a minute), so each test works as a
  // fresh admin of the same campus.
  beforeEach(async () => {
    admin = await campusAdmin(app, campus);
  });

  afterEach(() => clock.set(NOW));

  afterAll(async () => {
    await app.close();
  });

  describe('admission', () => {
    it('opens the account, the student role, the enrollment and the first placement', async () => {
      const body = admission(a.id, { gender: 'Female', city: 'Lagos' });
      const res = await post(body).expect(201);
      expect(res.body).toMatchObject({
        name: body.name,
        email: body.email,
        status: 'active',
        isPrimary: true,
        admissionDate: '2026-11-10',
        section: { id: a.id, name: 'A', academicYearId: year.id },
        gender: 'Female',
        city: 'Lagos',
        accountStatus: 'invited',
      });
      expect(res.body.admissionNumber).toMatch(/^SPS\/26\/\d{6}$/);

      const [role] = await dataSource.query(
        `SELECT r.name FROM model_has_roles m JOIN roles r ON r.id = m.role_id
          WHERE m.user_id = $1 AND m.school_id = $2`,
        [res.body.userId, campus.id],
      );
      expect(role.name).toBe('student');
      const placements = await admin
        .as(campus)
        .get(`/api/v1/students/${res.body.id}/placements`)
        .expect(200);
      expect(placements.body).toEqual([
        expect.objectContaining({
          section: expect.objectContaining({ id: a.id }),
          effectiveOn: '2026-11-10',
          reason: 'Admission',
          academicPeriodId: period(year, 'First term').id,
          changedBy: { id: admin.user.id, name: admin.user.name },
        }),
      ]);
      const [event] = await auditEvents(app, 'enrollment.placed', res.body.id);
      expect(event.context).toEqual({
        academic_year_id: year.id,
        academic_cycle_section_id: a.id,
        reason: 'Admission',
      });
      expect(mail.sent.some((message) => message.to === body.email)).toBe(true);
    });

    it('refuses who cannot be admitted, with the reference messages', async () => {
      const first = admission(a.id);
      const admitted = (await post(first).expect(201)).body;
      expect(refusal(await post({ ...first }).expect(422))).toBe(
        `${admitted.name} already holds the student role at this school.`,
      );
      const teacher = await teacherOf(app, campus);
      expect(
        refusal(
          await post(admission(a.id, { email: teacher.user.email })).expect(
            422,
          ),
        ),
      ).toBe(
        `${teacher.user.name} works as staff. A member of staff cannot be admitted as a learner.`,
      );

      const sibling = await createSchool(app, organization);
      const siblingAdmin = await campusAdmin(app, sibling);
      const siblingYear = await createCalendar(
        siblingAdmin,
        sibling,
        calendarBody(2026),
        true,
      );
      const siblingLevel = await makeLevel(siblingAdmin, sibling);
      const siblingSection = await activeSection(
        siblingAdmin,
        sibling,
        siblingYear.id,
        siblingLevel.id,
      );
      expect(
        refusal(
          await siblingAdmin
            .as(sibling)
            .post('/api/v1/students')
            .send(admission(siblingSection.id, { email: admitted.email }))
            .expect(422),
        ),
      ).toBe(
        'This learner is enrolled at another school. Ask that school to move or transfer them.',
      );

      const draft = await makeLevel(admin, campus);
      const draftSection = (
        await admin
          .as(campus)
          .post('/api/v1/academic-cycle-sections')
          .send({
            academicYearId: year.id,
            academicLevelId: draft.id,
            name: 'Draft',
          })
          .expect(201)
      ).body;
      const nextYear = await createCalendar(admin, campus, calendarBody(2027));
      const nextSection = await activeSection(
        admin,
        campus,
        nextYear.id,
        level.id,
      );
      for (const sectionId of [draftSection.id, nextSection.id]) {
        expect(refusal(await post(admission(sectionId)).expect(422))).toBe(
          'Choose an active section of the current year.',
        );
      }

      await post(admission(a.id, { admissionNumber: 'sps/99/000001' })).expect(
        201,
      );
      const taken = await post(
        admission(a.id, { admissionNumber: 'SPS/99/000001' }),
      ).expect(422);
      expect(refusal(taken)).toBe(
        'The admission number has already been taken.',
      );
      const future = await post(
        admission(a.id, { admissionDate: '2026-11-11' }),
      ).expect(400);
      expect(future.body.error.fields).toEqual({
        admissionDate: [
          'The date of admission field must be a date before or equal to 2026-11-10.',
        ],
      });
    });

    it('needs a working school year (409)', async () => {
      const bare = await createSchool(app, organization);
      const bareAdmin = await campusAdmin(app, bare);
      const res = await bareAdmin
        .as(bare)
        .post('/api/v1/students')
        .send(admission(a.id))
        .expect(409);
      expect(res.body.error.code).toBe('academic_period_required');
    });

    it('two admissions racing for the last seat: one is admitted, the other is sent to the waitlist', async () => {
      const last = await activeSection(admin, campus, year.id, level.id, {
        capacity: 1,
      });
      const results = await Promise.all([
        post(admission(last.id)),
        post(admission(last.id)),
      ]);
      expect(results.map((res) => res.status).sort()).toEqual([201, 422]);
      expect(refusal(results.find((res) => res.status === 422)!)).toBe(
        'The section is full at 1 seats, counting open waitlist offers. Add the candidate to its admission waitlist instead.',
      );
    });

    it('takes the admission number’s year from the campus’s today', async () => {
      const east = await createSchool(app, organization, {
        timezone: 'Pacific/Kiritimati',
      });
      const eastAdmin = await campusAdmin(app, east);
      const eastYear = await createCalendar(
        eastAdmin,
        east,
        calendarBody(2026),
        true,
      );
      const eastSection = await activeSection(
        eastAdmin,
        east,
        eastYear.id,
        (await makeLevel(eastAdmin, east)).id,
      );
      // 31 December in UTC is already 1 January on the campus. Signed in
      // then, so the session is current.
      clock.set(new Date('2026-12-31T12:00:00Z'));
      const res = await (
        await campusAdmin(app, east)
      )
        .as(east)
        .post('/api/v1/students')
        .send(admission(eastSection.id))
        .expect(201);
      expect(res.body.admissionNumber).toMatch(/^27\/\d{6}$/);
      expect(res.body.admissionDate).toBe('2027-01-01');
    });
  });

  describe('placements', () => {
    it('moves a learner within the working year, and the same section changes nothing', async () => {
      const learner = await admit(admin, campus, a.id);
      const moved = await place(admin, campus, learner.id, {
        academicCycleSectionId: b.id,
        reason: 'Smaller class',
        effectiveOn: '2026-11-09',
      }).expect(200);
      expect(moved.body.section.id).toBe(b.id);
      await place(admin, campus, learner.id, {
        academicCycleSectionId: b.id,
      }).expect(200);
      const history = await admin
        .as(campus)
        .get(`/api/v1/students/${learner.id}/placements`)
        .expect(200);
      expect(
        history.body.map(
          (row: {
            section: { id: string };
            effectiveOn: string;
            reason: string;
          }) => [row.section.id, row.effectiveOn, row.reason],
        ),
      ).toEqual([
        [a.id, '2026-11-10', 'Admission'],
        [b.id, '2026-11-09', 'Smaller class'],
      ]);
      const [{ count }] = await dataSource.query(
        'SELECT count(*)::int AS count FROM academic_year_student_records WHERE student_record_id = $1',
        [learner.id],
      );
      expect(count).toBe(1);
      // A move dated before the last one still agrees with where the
      // learner sits today.
      const subject = await makeSubject(admin, campus);
      const roster = async (sectionId: string) => {
        const [offering] = await makeOfferings(admin, campus, {
          subjectId: subject.id,
          academicYearId: year.id,
          academicPeriodId: period(year, 'First term').id,
          academicLevelId: level.id,
          rosterMode: 'home_section',
          academicCycleSectionIds: [sectionId],
        });
        const res = await admin
          .as(campus)
          .get(`/api/v1/course-offerings/${offering.id}/roster?date=2026-11-10`)
          .expect(200);
        return res.body.learners.map(
          (row: { studentRecordId: string }) => row.studentRecordId,
        );
      };
      expect(await roster(b.id)).toContain(learner.id);
      expect(await roster(a.id)).not.toContain(learner.id);
      await expect(
        dataSource.query(
          "UPDATE enrollment_placements SET reason = 'x' WHERE student_record_id = $1",
          [learner.id],
        ),
      ).rejects.toThrow(/append-only/);
    });

    it('refuses each placement the reference refuses', async () => {
      const learner = await admit(admin, campus, a.id);
      const draft = (
        await admin
          .as(campus)
          .post('/api/v1/academic-cycle-sections')
          .send({
            academicYearId: year.id,
            academicLevelId: level.id,
            name: 'Not yet',
          })
          .expect(201)
      ).body;
      expect(
        refusal(
          await place(admin, campus, learner.id, {
            academicCycleSectionId: draft.id,
          }).expect(422),
        ),
      ).toBe('Activate the section before placing a student in it.');
      const nextYear = await createCalendar(admin, campus, calendarBody(2028));
      const elsewhere = await activeSection(
        admin,
        campus,
        nextYear.id,
        level.id,
      );
      expect(
        refusal(
          await place(admin, campus, learner.id, {
            academicCycleSectionId: elsewhere.id,
          }).expect(422),
        ),
      ).toBe('That section does not belong to the working academic year.');
      expect(
        refusal(
          await place(admin, campus, learner.id, {
            academicCycleSectionId: b.id,
            effectiveOn: '2026-11-11',
          }).expect(422),
        ),
      ).toBe(
        'A new place starts when it is made. Choose today or an earlier day.',
      );
      const full = await activeSection(admin, campus, year.id, level.id, {
        capacity: 1,
      });
      await admit(admin, campus, full.id);
      expect(
        refusal(
          await place(admin, campus, learner.id, {
            academicCycleSectionId: full.id,
          }).expect(422),
        ),
      ).toBe(
        'The section is full at 1 seats, counting open waitlist offers. Add the candidate to its admission waitlist instead.',
      );
      await changeStatus(admin, campus, learner.id, {
        status: 'withdrawn',
      }).expect(200);
      expect(
        refusal(
          await place(admin, campus, learner.id, {
            academicCycleSectionId: b.id,
          }).expect(422),
        ),
      ).toBe('This enrollment is closed. It cannot take a new placement.');
      const teacher = await teacherOf(app, campus);
      await place(teacher, campus, learner.id, {
        academicCycleSectionId: b.id,
      }).expect(403);
    });
  });

  describe('enrollment states', () => {
    it('moves through the table, writing a history row and an audit event each time', async () => {
      const learner = await admit(admin, campus, a.id);
      const suspend = await changeStatus(admin, campus, learner.id, {
        status: 'suspended',
        reason: 'Fees review',
        effectiveOn: '2026-11-09',
      }).expect(200);
      expect(suspend.body.status).toBe('suspended');
      await changeStatus(admin, campus, learner.id, {
        status: 'suspended',
      }).expect(200);
      const history = await admin
        .as(campus)
        .get(`/api/v1/students/${learner.id}/status-changes`)
        .expect(200);
      expect(history.body).toEqual([
        expect.objectContaining({
          fromStatus: 'active',
          toStatus: 'suspended',
          effectiveOn: '2026-11-09',
          reason: 'Fees review',
          changedBy: { id: admin.user.id, name: admin.user.name },
        }),
      ]);
      const [event] = await auditEvents(
        app,
        'enrollment.status_changed',
        learner.id,
      );
      expect(event.context).toEqual({
        from: 'active',
        to: 'suspended',
        reason: 'Fees review',
      });

      expect(
        refusal(
          await changeStatus(admin, campus, learner.id, {
            status: 'active',
            effectiveOn: '2026-11-12',
          }).expect(422),
        ),
      ).toBe(
        'A change of state starts when it is made. Make it on 12 Nov 2026 or choose an earlier day.',
      );
      expect(
        refusal(
          await changeStatus(admin, campus, learner.id, {
            status: 'graduated',
          }).expect(422),
        ),
      ).toBe('An enrollment cannot move from suspended to graduated.');
      await changeStatus(admin, campus, learner.id, {
        status: 'transferred',
      }).expect(200);
      expect(
        refusal(
          await changeStatus(admin, campus, learner.id, {
            status: 'active',
          }).expect(422),
        ),
      ).toBe('An enrollment cannot move from transferred to active.');
      await changeStatus(admin, campus, learner.id, {
        status: 'archived',
      }).expect(200);
      expect(
        refusal(
          await changeStatus(admin, campus, learner.id, {
            status: 'withdrawn',
          }).expect(422),
        ),
      ).toBe('An enrollment cannot move from archived to withdrawn.');
    });

    it('takes a learner back only into a free seat, and not one who attends elsewhere or works as staff', async () => {
      const small = await activeSection(admin, campus, year.id, level.id, {
        capacity: 1,
      });
      const first = await admit(admin, campus, small.id);
      await changeStatus(admin, campus, first.id, {
        status: 'withdrawn',
      }).expect(200);
      await admit(admin, campus, small.id);
      expect(
        refusal(
          await changeStatus(admin, campus, first.id, {
            status: 'active',
          }).expect(422),
        ),
      ).toBe(
        'Their section is full at 1 learners. Free a seat or raise its size first.',
      );
      const back = await changeStatus(admin, campus, first.id, {
        status: 'active',
        academicCycleSectionId: b.id,
        reason: 'Back after a term away',
      }).expect(200);
      expect(back.body).toMatchObject({
        status: 'active',
        section: { id: b.id },
      });
      expect(
        refusal(
          await changeStatus(admin, campus, first.id, {
            status: 'suspended',
            academicCycleSectionId: a.id,
          }).expect(422),
        ),
      ).toBe('Only a learner who left can be taken back into a section.');

      // Now attends a sibling campus.
      const moved = await admit(admin, campus, a.id);
      await changeStatus(admin, campus, moved.id, {
        status: 'withdrawn',
      }).expect(200);
      const sibling = await createSchool(app, organization, {
        name: 'North Campus',
      });
      const siblingAdmin = await campusAdmin(app, sibling);
      const siblingYear = await createCalendar(
        siblingAdmin,
        sibling,
        calendarBody(2026),
        true,
      );
      const siblingSection = await activeSection(
        siblingAdmin,
        sibling,
        siblingYear.id,
        (await makeLevel(siblingAdmin, sibling)).id,
      );
      await siblingAdmin
        .as(sibling)
        .post('/api/v1/students')
        .send(admission(siblingSection.id, { email: moved.email }))
        .expect(201);
      expect(
        refusal(
          await changeStatus(admin, campus, moved.id, {
            status: 'active',
          }).expect(422),
        ),
      ).toBe(
        'This learner now attends North Campus. Ask that school to move or transfer them.',
      );

      // Now works here as staff.
      const hired = await admit(admin, campus, a.id);
      await changeStatus(admin, campus, hired.id, {
        status: 'withdrawn',
      }).expect(200);
      const teacherRole = await sharedRole(app, 'teacher');
      await admin
        .as(campus)
        .post(`/api/v1/accounts/${hired.userId}/roles`)
        .send({ roleId: teacherRole.id })
        .expect(200);
      expect(
        refusal(
          await changeStatus(admin, campus, hired.id, {
            status: 'active',
          }).expect(422),
        ),
      ).toBe(
        `${hired.name} works as staff. A member of staff cannot be admitted as a learner.`,
      );
    });

    it('archives a learner who left even when their old section has filled up', async () => {
      const small = await activeSection(admin, campus, year.id, level.id, {
        capacity: 1,
      });
      const graduate = await admit(admin, campus, small.id);
      await changeStatus(admin, campus, graduate.id, {
        status: 'graduated',
      }).expect(200);
      await admit(admin, campus, small.id);
      const archived = await changeStatus(admin, campus, graduate.id, {
        status: 'archived',
      }).expect(200);
      expect(archived.body.status).toBe('archived');
    });

    it('runs what other parts register when an enrollment closes, inside the change', async () => {
      const closed: Array<{
        status: string;
        effectiveOn: string;
        reason: string | null;
      }> = [];
      app
        .get(EnrollmentStatuses)
        .registerCloseHandler(
          async (_manager, _enrollment, status, context) => {
            closed.push({
              status,
              effectiveOn: context.effectiveOn,
              reason: context.reason,
            });
          },
        );
      const learner = await admit(admin, campus, a.id);
      await changeStatus(admin, campus, learner.id, {
        status: 'suspended',
      }).expect(200);
      expect(closed).toEqual([]);
      await changeStatus(admin, campus, learner.id, {
        status: 'withdrawn',
        reason: 'Moved abroad',
        effectiveOn: '2026-11-08',
      }).expect(200);
      expect(closed).toEqual([
        {
          status: 'withdrawn',
          effectiveOn: '2026-11-08',
          reason: 'Moved abroad',
        },
      ]);
    });
  });

  describe('graduated learners', () => {
    it('answer 403 on campus routes, except their own account and context', async () => {
      const member = await person(app, { memberOf: [campus] });
      const learner = await admit(admin, campus, a.id, {
        email: member.user.email,
      });
      await member.as(campus).get('/api/v1/school/features').expect(200);
      await changeStatus(admin, campus, learner.id, {
        status: 'graduated',
      }).expect(200);

      const blocked = await member
        .as(campus)
        .get('/api/v1/school/features')
        .expect(403);
      expect(blocked.body.error).toEqual({
        code: 'forbidden',
        message:
          'You cannot access this resource because you have been marked as graduated',
      });
      await member.as().get('/api/v1/me').expect(200);
      await member.as(campus).get('/api/v1/me/context').expect(200);
      await member.as(campus).get('/api/v1/me/permissions').expect(200);

      await changeStatus(admin, campus, learner.id, {
        status: 'active',
      }).expect(200);
      await member.as(campus).get('/api/v1/school/features').expect(200);
    });
  });

  describe('Stage 2 rules for learners', () => {
    it('a learner cannot hold a campus role', async () => {
      const learner = await admit(admin, campus, a.id);
      const teacherRole = await sharedRole(app, 'teacher');
      const res = await admin
        .as(campus)
        .post(`/api/v1/accounts/${learner.userId}/roles`)
        .send({ roleId: teacherRole.id })
        .expect(422);
      expect(refusal(res)).toBe(
        `${learner.name} is a learner. A learner cannot hold a campus role.`,
      );
    });

    it('a learner enrolled only at another campus is that campus’s to manage', async () => {
      const learner = await admit(admin, campus, a.id);
      const sibling = await createSchool(app, organization);
      const siblingAdmin = await campusAdmin(app, sibling);
      await siblingAdmin
        .as(sibling)
        .post('/api/v1/accounts')
        .send({ name: learner.name, email: learner.email })
        .expect(200);
      const message =
        'This learner attends another campus, so their account is managed there.';
      const suspend = await siblingAdmin
        .as(sibling)
        .post(`/api/v1/accounts/${learner.userId}/status-changes`)
        .send({ action: 'suspend' })
        .expect(403);
      expect(refusal(suspend)).toBe(message);
      expect(
        refusal(
          await siblingAdmin
            .as(sibling)
            .post(`/api/v1/accounts/${learner.userId}/invitation`)
            .expect(403),
        ),
      ).toBe(message);
      // Their own campus still manages them.
      await admin
        .as(campus)
        .post(`/api/v1/accounts/${learner.userId}/invitation`)
        .expect(201);
    });
  });

  describe('removing a learner', () => {
    it('withdraws them, ends the membership and deletes the account', async () => {
      const member = await person(app, { memberOf: [campus] });
      const learner = await admit(admin, campus, a.id, {
        email: member.user.email,
      });
      await admin
        .as(campus)
        .delete(`/api/v1/students/${learner.id}`)
        .expect(204);

      const [row] = await dataSource.query(
        `SELECT sr.status, m.status AS membership, u.deleted_at
           FROM student_records sr
           JOIN users u ON u.id = sr.user_id
           JOIN school_memberships m ON m.user_id = sr.user_id AND m.school_id = sr.school_id
          WHERE sr.id = $1`,
        [learner.id],
      );
      expect(row).toMatchObject({ status: 'withdrawn', membership: 'ended' });
      expect(row.deleted_at).not.toBeNull();
      const [event] = await auditEvents(app, 'account.deleted', learner.userId);
      expect(event.context).toEqual({
        email: learner.email,
        school_id: campus.id,
      });
      await member.as().get('/api/v1/me').expect(401);
    });

    it('keeps the account of a person another campus still has', async () => {
      const learner = await admit(admin, campus, a.id);
      const sibling = await createSchool(app, organization);
      const siblingAdmin = await campusAdmin(app, sibling);
      await siblingAdmin
        .as(sibling)
        .post('/api/v1/accounts')
        .send({ name: learner.name, email: learner.email })
        .expect(200);
      await admin
        .as(campus)
        .delete(`/api/v1/students/${learner.id}`)
        .expect(204);
      const [row] = await dataSource.query(
        'SELECT deleted_at FROM users WHERE id = $1',
        [learner.userId],
      );
      expect(row.deleted_at).toBeNull();
    });
  });

  describe('setup', () => {
    it('counts the active learners', async () => {
      const fresh = await createSchool(app, organization);
      const freshAdmin = await campusAdmin(app, fresh);
      const freshYear = await createCalendar(
        freshAdmin,
        fresh,
        calendarBody(2026),
        true,
      );
      const section = await activeSection(
        freshAdmin,
        fresh,
        freshYear.id,
        (await makeLevel(freshAdmin, fresh)).id,
      );
      await admit(freshAdmin, fresh, section.id);
      const leaving = await admit(freshAdmin, fresh, section.id);
      await changeStatus(freshAdmin, fresh, leaving.id, {
        status: 'withdrawn',
      }).expect(200);
      const setup = await freshAdmin
        .as(fresh)
        .get('/api/v1/school/setup')
        .expect(200);
      expect(setup.body.counts.students).toBe(1);
      expect(
        setup.body.items.find(
          (item: { key: string }) => item.key === 'student_records',
        ).complete,
      ).toBe(true);
    });
  });

  describe('named learners, sections and rosters', () => {
    let subject: { id: string };
    let other: Level;
    let x: { id: string };

    beforeAll(async () => {
      const setupAdmin = await campusAdmin(app, campus);
      subject = await makeSubject(setupAdmin, campus, 'Drama');
      for (const rosterMode of [
        'individual_roster',
        'combined_home_sections',
      ]) {
        await setupAdmin
          .as(campus)
          .post(
            `/api/v1/academic-years/${year.id}/instructional-model/exceptions`,
          )
          .send({ subjectId: subject.id, rosterMode, reason: 'Electives' })
          .expect(201);
      }
      other = await makeLevel(setupAdmin, campus, { name: 'Basic 4' });
      x = await activeSection(setupAdmin, campus, year.id, other.id, {
        name: 'X',
      });
    });

    const offer = (body: object) =>
      makeOfferings(admin, campus, {
        subjectId: subject.id,
        academicYearId: year.id,
        academicPeriodId: period(year, 'First term').id,
        academicLevelId: level.id,
        ...body,
      });

    it('names learners of the level this year, within capacity', async () => {
      const one = await admit(admin, campus, a.id);
      const two = await admit(admin, campus, b.id);
      const elsewhere = await admit(admin, campus, x.id);
      const create = (body: object) =>
        admin
          .as(campus)
          .post('/api/v1/course-offerings')
          .send({
            subjectId: subject.id,
            academicYearId: year.id,
            academicPeriodId: period(year, 'First term').id,
            academicLevelId: level.id,
            ...body,
          });
      expect(
        refusal(
          await create({
            rosterMode: 'individual_roster',
            studentRecordIds: [one.id, elsewhere.id],
          }).expect(422),
        ),
      ).toBe(
        'Every named learner must actively attend this class in this school.',
      );
      expect(
        refusal(
          await create({
            rosterMode: 'individual_roster',
            studentRecordIds: [one.id, two.id],
            capacity: 1,
          }).expect(422),
        ),
      ).toBe(
        'This subject has room for 1 learners. Name fewer learners or raise the capacity.',
      );
      expect(
        refusal(
          await create({
            rosterMode: 'home_section',
            academicCycleSectionIds: [a.id],
            studentRecordIds: [one.id],
          }).expect(422),
        ),
      ).toBe('A section roster does not name learners.');

      const [named] = await offer({
        rosterMode: 'individual_roster',
        studentRecordIds: [one.id, two.id],
      });
      expect(named.studentRecordIds.sort()).toEqual([one.id, two.id].sort());
      await admin
        .as(campus)
        .post(`/api/v1/course-offerings/${named.id}/status`)
        .send({ status: 'active' })
        .expect(200);
      expect(
        refusal(
          await admin
            .as(campus)
            .put(`/api/v1/course-offerings/${named.id}/roster`)
            .send({ rosterMode: 'individual_roster', studentRecordIds: [] })
            .expect(422),
        ),
      ).toBe(
        'Add at least one named learner before changing an active offering.',
      );
      const roster = await admin
        .as(campus)
        .get(`/api/v1/course-offerings/${named.id}/roster`)
        .expect(200);
      expect(roster.body.date).toBe('2026-11-10');
      expect(
        roster.body.learners
          .map((l: { studentRecordId: string }) => l.studentRecordId)
          .sort(),
      ).toEqual([one.id, two.id].sort());

      await changeStatus(admin, campus, two.id, { status: 'withdrawn' }).expect(
        200,
      );
      expect(
        refusal(
          await create({
            rosterMode: 'individual_roster',
            studentRecordIds: [two.id],
          }).expect(422),
        ),
      ).toBe(
        'Every named learner must actively attend this class in this school.',
      );
    });

    it('a section with placed learners is kept, and its seats count them', async () => {
      const busy = await activeSection(admin, campus, year.id, level.id, {
        capacity: 5,
      });
      await admit(admin, campus, busy.id);
      await admit(admin, campus, busy.id);
      expect(
        refusal(
          await admin
            .as(campus)
            .post(`/api/v1/academic-cycle-sections/${busy.id}/status`)
            .send({ status: 'archived' })
            .expect(422),
        ),
      ).toBe('Move the 2 learners of this section before archiving it.');
      expect(
        refusal(
          await admin
            .as(campus)
            .patch(`/api/v1/academic-cycle-sections/${busy.id}`)
            .send({ capacity: 1 })
            .expect(422),
        ),
      ).toBe(
        '2 seats are taken in this section now, counting open waitlist offers. Set a capacity of at least 2.',
      );
    });

    it('a learner who moved on the 5th is in the old section for the 4th and the new one for the 6th', async () => {
      clock.set(new Date('2026-10-01T09:00:00Z'));
      const mover = await admit(admin, campus, a.id);
      clock.set(NOW);
      await place(admin, campus, mover.id, {
        academicCycleSectionId: b.id,
        effectiveOn: '2026-11-05',
      }).expect(200);
      await changeStatus(admin, campus, mover.id, {
        status: 'withdrawn',
        effectiveOn: '2026-11-08',
      }).expect(200);
      const [inA] = await offer({
        rosterMode: 'home_section',
        academicCycleSectionIds: [a.id],
      });
      const [inB] = await offer({
        rosterMode: 'home_section',
        academicCycleSectionIds: [b.id],
      });
      const on = async (offeringId: string, day: string) =>
        (
          await admin
            .as(campus)
            .get(`/api/v1/course-offerings/${offeringId}/roster?date=${day}`)
            .expect(200)
        ).body.learners.map(
          (learner: { studentRecordId: string }) => learner.studentRecordId,
        );
      expect(await on(inA.id, '2026-11-04')).toContain(mover.id);
      expect(await on(inA.id, '2026-11-06')).not.toContain(mover.id);
      expect(await on(inB.id, '2026-11-04')).not.toContain(mover.id);
      expect(await on(inB.id, '2026-11-06')).toContain(mover.id);
      expect(await on(inB.id, '2026-11-07')).toContain(mover.id);
      expect(await on(inB.id, '2026-11-09')).not.toContain(mover.id);
      expect(await on(inA.id, '2026-09-30')).not.toContain(mover.id);
    });

    it('a teacher of one section of a combined offering sees only that section’s learners', async () => {
      const inA = await admit(admin, campus, a.id);
      const inB = await admit(admin, campus, b.id);
      const [joint] = await offer({
        rosterMode: 'combined_home_sections',
        academicCycleSectionIds: [a.id, b.id],
      });
      const teacher = await teacherOf(app, campus);
      await admin
        .as(campus)
        .post(`/api/v1/course-offerings/${joint.id}/teaching-assignments`)
        .send({ userId: teacher.user.id, academicCycleSectionId: a.id })
        .expect(201);
      const ids = (res: {
        body: { learners: Array<{ studentRecordId: string }> };
      }) => res.body.learners.map((learner) => learner.studentRecordId);
      const mine = await teacher
        .as(campus)
        .get(`/api/v1/course-offerings/${joint.id}/roster`)
        .expect(200);
      expect(mine.body.limitedToSections).toBe(true);
      expect(ids(mine)).toContain(inA.id);
      expect(ids(mine)).not.toContain(inB.id);
      expect(
        mine.body.learners.every(
          (learner: { academicCycleSectionId: string }) =>
            learner.academicCycleSectionId === a.id,
        ),
      ).toBe(true);
      const all = await admin
        .as(campus)
        .get(`/api/v1/course-offerings/${joint.id}/roster`)
        .expect(200);
      expect(ids(all)).toEqual(expect.arrayContaining([inA.id, inB.id]));
    });
  });
});
