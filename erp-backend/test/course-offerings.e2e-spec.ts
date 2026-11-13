import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
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
} from './support/campus.js';
import {
  type Level,
  type Offering,
  type Section,
  makeLevel,
  makeOfferings,
  makeSection,
  makeSubject,
  teacherOf,
} from './support/curriculum.js';
import { createTestApp } from './support/test-app.js';

const NOW = new Date('2026-11-10T12:00:00Z');

describe('Course offerings (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const clock = new FixedClock(NOW);
  let organization: Organization;
  let campus: School;
  let admin: Person;
  let closedYear: CalendarYear;
  let year: CalendarYear;
  let level: Level;
  let group: Level;
  let child: Level;
  let otherLevel: Level;
  let a: Section;
  let b: Section;
  let c: Section;
  let maths: { id: string };
  let music: { id: string; name: string };
  let firstTerm: string;
  let secondTerm: string;

  const refusal = (res: { body: { error: { message: string } } }) =>
    res.body.error.message;
  const create = (body: object) =>
    admin.as(campus).post('/api/v1/course-offerings').send(body);
  const status = (id: string, to: string) =>
    admin
      .as(campus)
      .post(`/api/v1/course-offerings/${id}/status`)
      .send({ status: to });
  const exceptions = (yearId: string) =>
    `/api/v1/academic-years/${yearId}/instructional-model/exceptions`;

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: Clock, useValue: clock }],
    });
    dataSource = app.get(DataSource);
    organization = await createOrganization(app);
    campus = await createSchool(app, organization);
    admin = await campusAdmin(app, campus);
    closedYear = await createCalendar(admin, campus, calendarBody(2025), true);
    year = await createCalendar(admin, campus, calendarBody(2026), true);
    firstTerm = period(year, 'First term').id;
    secondTerm = period(year, 'Second term').id;
    level = await makeLevel(admin, campus, { name: 'Basic 5' });
    otherLevel = await makeLevel(admin, campus, { name: 'Basic 6' });
    group = await makeLevel(admin, campus, { name: 'Seniors', isGroup: true });
    child = await makeLevel(admin, campus, { name: 'SS1', parentId: group.id });
    a = await makeSection(admin, campus, year.id, level.id, { name: 'A' });
    b = await makeSection(admin, campus, year.id, level.id, { name: 'B' });
    c = await makeSection(admin, campus, year.id, level.id, { name: 'C' });
    maths = await makeSubject(admin, campus, 'Mathematics');
    music = await makeSubject(admin, campus, 'Music');
  });

  // Requests are limited per person (60 a minute), so each test works as a
  // fresh admin of the same campus.
  beforeEach(async () => {
    admin = await campusAdmin(app, campus);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('creating', () => {
    it('one offering per period, with the roster each mode needs', async () => {
      const base = {
        subjectId: maths.id,
        academicYearId: year.id,
        academicPeriodId: firstTerm,
        academicLevelId: level.id,
      };
      const cases: Array<[object, string]> = [
        [{ rosterMode: 'home_section' }, 'Select exactly one section.'],
        [
          { rosterMode: 'home_section', academicCycleSectionIds: [a.id, b.id] },
          'Select exactly one section.',
        ],
        [
          { rosterMode: 'academic_level', academicCycleSectionIds: [a.id] },
          'A whole-level offering does not select sections or individual learners.',
        ],
        [
          {
            rosterMode: 'home_section',
            academicCycleSectionIds: [a.id],
            academicLevelId: otherLevel.id,
          },
          'Every selected section must belong to this level and academic cycle.',
        ],
        [
          {
            rosterMode: 'home_section',
            academicCycleSectionIds: [a.id],
            academicLevelId: group.id,
          },
          'A level group has no sections of its own. Choose the whole group or named learners for this subject.',
        ],
        [
          {
            rosterMode: 'academic_level',
            academicPeriodId: period(closedYear, 'First term').id,
          },
          'The academic period does not belong to the academic year.',
        ],
        [
          {
            rosterMode: 'academic_level',
            academicYearId: closedYear.id,
            academicPeriodId: period(closedYear, 'First term').id,
          },
          'Reopen the academic cycle before creating a course offering.',
        ],
        [
          { rosterMode: 'academic_level', name: 'x'.repeat(101) },
          'Use a name of 100 characters or fewer.',
        ],
      ];
      for (const [body, message] of cases) {
        expect(refusal(await create({ ...base, ...body }).expect(422))).toBe(
          message,
        );
      }

      const exams = await admin
        .as(campus)
        .post(`/api/v1/academic-years/${year.id}/periods`)
        .send({
          name: 'Exams',
          type: 'exam_window',
          parentId: firstTerm,
          startsOn: '2026-12-01',
          endsOn: '2026-12-10',
        })
        .expect(201);
      expect(
        refusal(
          await create({
            ...base,
            rosterMode: 'academic_level',
            academicPeriodId: exams.body.id,
          }).expect(422),
        ),
      ).toBe('A course offering runs for a top-level period of the year.');

      const all = await create({
        ...base,
        academicPeriodId: 'all',
        rosterMode: 'home_section',
        academicCycleSectionIds: [c.id],
        plannedPeriodsPerWeek: 5,
        name: '  Further maths ',
      }).expect(201);
      expect(all.body.map((row: Offering) => row.academicPeriodId)).toEqual(
        year.periods.map((p) => p.id),
      );
      expect(all.body[0]).toMatchObject({
        status: 'draft',
        rosterMode: 'home_section',
        academicCycleSectionIds: [c.id],
        plannedPeriodsPerWeek: 5,
        name: 'Further maths',
        subject: { id: maths.id, name: 'Mathematics' },
      });
      const [event] = await auditEvents(
        app,
        'course_offering.created',
        all.body[0].id,
      );
      expect(event.context).toEqual({
        subject_id: maths.id,
        academic_year_id: year.id,
        academic_period_id: firstTerm,
        academic_level_id: level.id,
        roster_mode: 'home_section',
        academic_cycle_section_ids: [c.id],
        student_record_ids: [],
      });

      const teacher = await teacherOf(app, campus);
      await teacher
        .as(campus)
        .post('/api/v1/course-offerings')
        .send(base)
        .expect(403);
      await teacher.as(campus).get('/api/v1/course-offerings').expect(403);
    });
  });

  describe('the teaching model and its exceptions', () => {
    it('a combined roster needs the model or an exception for that subject', async () => {
      const combined = {
        subjectId: music.id,
        academicYearId: year.id,
        academicPeriodId: firstTerm,
        academicLevelId: level.id,
        rosterMode: 'combined_home_sections',
        academicCycleSectionIds: [a.id, b.id],
      };
      expect(refusal(await create(combined).expect(422))).toBe(
        'The teaching setup does not allow this way of choosing learners for the academic cycle. Record an exception for this subject if it is taught differently on purpose.',
      );

      const grant = (body: object) =>
        admin.as(campus).post(exceptions(year.id)).send(body);
      const musicCombined = {
        subjectId: music.id,
        rosterMode: 'combined_home_sections',
        academicLevelId: level.id,
      };
      expect(
        refusal(await grant({ ...musicCombined, reason: '  ' }).expect(422)),
      ).toBe('Say why this subject is taught differently.');
      expect(
        refusal(
          await grant({
            ...musicCombined,
            rosterMode: 'home_section',
            reason: 'x',
          }).expect(422),
        ),
      ).toBe(
        'The campus model already allows this, so no exception is needed.',
      );
      expect(
        refusal(
          await admin
            .as(campus)
            .post(exceptions(closedYear.id))
            .send({ ...musicCombined, reason: 'x' })
            .expect(422),
        ),
      ).toBe('This cycle is closed.');

      const granted = await grant({
        ...musicCombined,
        reason: 'One choir for both arms',
      }).expect(201);
      expect(granted.body).toMatchObject({
        subject: { id: music.id, name: 'Music' },
        academicLevel: { id: level.id, name: 'Basic 5' },
        rosterMode: 'combined_home_sections',
        running: true,
        grantedBy: { id: admin.user.id },
      });
      const again = await grant({ ...musicCombined, reason: 'Again' }).expect(
        200,
      );
      expect(again.body.id).toBe(granted.body.id);
      const [event] = await auditEvents(
        app,
        'instructional_model.exception_granted',
        granted.body.id,
      );
      expect(event.context).toEqual({
        subject: 'Music',
        roster_mode: 'combined_home_sections',
        level: 'Basic 5',
        reason: 'One choir for both arms',
      });

      const [offering] = (await create(combined).expect(201)).body;
      expect(offering.rosterMode).toBe('combined_home_sections');
      // Only music, and only at that level.
      expect(
        refusal(await create({ ...combined, subjectId: maths.id }).expect(422)),
      ).toContain('Record an exception');

      const revoke = (id: string) =>
        admin.as(campus).post(`${exceptions(year.id)}/${id}/revoke`);
      expect((await revoke(granted.body.id).expect(200)).body).toMatchObject({
        running: false,
        revokedById: admin.user.id,
      });
      expect(refusal(await revoke(granted.body.id).expect(422))).toBe(
        'This exception was already taken back.',
      );
      // The offering made under it keeps its roster; new ones are refused.
      const kept = await admin
        .as(campus)
        .get(`/api/v1/course-offerings/${offering.id}`)
        .expect(200);
      expect(kept.body.rosterMode).toBe('combined_home_sections');
      await create(combined).expect(422);

      const listed = await admin
        .as(campus)
        .get(exceptions(year.id))
        .expect(200);
      expect(listed.body.map((row: { id: string }) => row.id)).toEqual([
        granted.body.id,
      ]);
      const teacher = await teacherOf(app, campus);
      await teacher.as(campus).get(exceptions(year.id)).expect(403);
      await teacher
        .as(campus)
        .post(exceptions(year.id))
        .send({ ...musicCombined, reason: 'x' })
        .expect(403);
    });

    it('an exception with no level covers every level', async () => {
      const drama = await makeSubject(admin, campus, 'Drama');
      await admin
        .as(campus)
        .post(exceptions(year.id))
        .send({
          subjectId: drama.id,
          rosterMode: 'individual_roster',
          reason: 'Elective',
        })
        .expect(201);
      for (const target of [level, otherLevel]) {
        await create({
          subjectId: drama.id,
          academicYearId: year.id,
          academicPeriodId: firstTerm,
          academicLevelId: target.id,
          rosterMode: 'individual_roster',
        }).expect(201);
      }
    });
  });

  describe('activation', () => {
    const homeIn = (section: Section, periodId = firstTerm) => ({
      subjectId: maths.id,
      academicYearId: year.id,
      academicPeriodId: periodId,
      academicLevelId: level.id,
      rosterMode: 'home_section',
      academicCycleSectionIds: [section.id],
    });

    it('needs an open period, a complete roster, and no active twin', async () => {
      const [first] = (await create(homeIn(a)).expect(201)).body;
      const activated = await status(first.id, 'active').expect(200);
      expect(activated.body.status).toBe('active');
      const [event] = await auditEvents(
        app,
        'course_offering.status_changed',
        first.id,
      );
      expect(event.context).toEqual({
        from: 'draft',
        to: 'active',
        academic_period_id: firstTerm,
      });

      const [twin] = (await create(homeIn(a)).expect(201)).body;
      expect(refusal(await status(twin.id, 'active').expect(422))).toBe(
        'An active offering already exists for this subject, period, level, and section group.',
      );
      const [later] = (await create(homeIn(a, secondTerm)).expect(201)).body;
      expect(refusal(await status(later.id, 'active').expect(422))).toBe(
        'Open the academic period before activating its course offering.',
      );

      // Archiving frees the key.
      await status(first.id, 'archived').expect(200);
      await status(twin.id, 'active').expect(200);
      expect(refusal(await status(first.id, 'active').expect(422))).toBe(
        'A Archived offering cannot move to Active.',
      );
      expect(
        refusal(
          await admin
            .as(campus)
            .patch(`/api/v1/course-offerings/${first.id}`)
            .send({ name: 'Late' })
            .expect(422),
        ),
      ).toBe('An archived course offering cannot be changed.');
    });

    it('a named-learner offering waits for its learners', async () => {
      const elective = await makeSubject(admin, campus, 'Coding');
      await admin
        .as(campus)
        .post(exceptions(year.id))
        .send({
          subjectId: elective.id,
          rosterMode: 'individual_roster',
          reason: 'Club',
        })
        .expect(201);
      const [named] = (
        await create({
          subjectId: elective.id,
          academicYearId: year.id,
          academicPeriodId: firstTerm,
          academicLevelId: level.id,
          rosterMode: 'individual_roster',
        }).expect(201)
      ).body;
      expect(refusal(await status(named.id, 'active').expect(422))).toBe(
        'Add at least one named learner before activating this course offering.',
      );
    });

    it('two activations racing for one roster: one wins, the other is refused', async () => {
      const [one] = (await create(homeIn(b)).expect(201)).body;
      const [two] = (await create(homeIn(b)).expect(201)).body;
      const results = await Promise.all([
        status(one.id, 'active'),
        status(two.id, 'active'),
      ]);
      expect(results.map((res) => res.status).sort()).toEqual([200, 422]);
      const loser = results.find((res) => res.status === 422)!;
      expect(refusal(loser)).toBe(
        'An active offering already exists for this subject, period, level, and section group.',
      );
      const [{ count }] = await dataSource.query(
        "SELECT count(*)::int AS count FROM course_offerings WHERE id = ANY($1) AND status = 'active'",
        [[one.id, two.id]],
      );
      expect(count).toBe(1);
    });
  });

  describe('changing an offering', () => {
    it('renames it, and changes its roster under the same rules', async () => {
      const science = await makeSubject(admin, campus, 'Science');
      const base = {
        subjectId: science.id,
        academicYearId: year.id,
        academicPeriodId: firstTerm,
        academicLevelId: level.id,
      };
      const [draft] = (
        await create({
          ...base,
          rosterMode: 'home_section',
          academicCycleSectionIds: [a.id],
        }).expect(201)
      ).body;
      const renamed = await admin
        .as(campus)
        .patch(`/api/v1/course-offerings/${draft.id}`)
        .send({ name: 'Science A' })
        .expect(200);
      expect(renamed.body.name).toBe('Science A');
      const [event] = await auditEvents(
        app,
        'course_offering.renamed',
        draft.id,
      );
      expect(event.context).toEqual({ from: null, to: 'Science A' });
      expect(
        (
          await admin
            .as(campus)
            .patch(`/api/v1/course-offerings/${draft.id}`)
            .send({ name: '' })
            .expect(200)
        ).body.name,
      ).toBeNull();

      const roster = (id: string, body: object) =>
        admin
          .as(campus)
          .put(`/api/v1/course-offerings/${id}/roster`)
          .send(body);
      expect(
        refusal(
          await roster(draft.id, {
            rosterMode: 'combined_home_sections',
            academicCycleSectionIds: [a.id, b.id],
          }).expect(422),
        ),
      ).toBe(
        'The teaching setup does not allow this way of choosing learners for the academic cycle.',
      );
      expect(
        refusal(
          await roster(draft.id, { rosterMode: 'home_section' }).expect(422),
        ),
      ).toBe('Select exactly one section.');
      const retired = await makeSection(admin, campus, year.id, level.id, {
        name: 'Retired',
      });
      await admin
        .as(campus)
        .post(`/api/v1/academic-cycle-sections/${retired.id}/status`)
        .send({ status: 'archived' })
        .expect(200);
      expect(
        refusal(
          await roster(draft.id, {
            rosterMode: 'home_section',
            academicCycleSectionIds: [retired.id],
          }).expect(422),
        ),
      ).toBe(
        'Every selected section must belong to this class and school year.',
      );
      const moved = await roster(draft.id, {
        rosterMode: 'home_section',
        academicCycleSectionIds: [c.id],
      }).expect(200);
      expect(moved.body.academicCycleSectionIds).toEqual([c.id]);
      const [rosterEvent] = await auditEvents(
        app,
        'course_offering.roster_updated',
        draft.id,
      );
      expect(rosterEvent.context).toEqual({
        roster_mode: 'home_section',
        academic_cycle_section_ids: [c.id],
        student_record_ids: [],
      });

      // An active offering keeps its key unique and keeps a roster.
      await status(draft.id, 'active').expect(200);
      const [onA] = (
        await create({
          ...base,
          rosterMode: 'home_section',
          academicCycleSectionIds: [a.id],
        }).expect(201)
      ).body;
      await status(onA.id, 'active').expect(200);
      expect(
        refusal(
          await roster(onA.id, {
            rosterMode: 'home_section',
            academicCycleSectionIds: [c.id],
          }).expect(422),
        ),
      ).toBe(
        'An active offering already exists for this subject, period, class, and roster.',
      );
      await admin
        .as(campus)
        .post(exceptions(year.id))
        .send({
          subjectId: science.id,
          rosterMode: 'individual_roster',
          reason: 'Lab groups',
        })
        .expect(201);
      expect(
        refusal(
          await roster(onA.id, { rosterMode: 'individual_roster' }).expect(422),
        ),
      ).toBe(
        'Add at least one named learner before changing an active offering.',
      );
    });

    it('nothing changes in a closed period', async () => {
      const later = await createCalendar(admin, campus, calendarBody(2029));
      const [offering] = await makeOfferings(admin, campus, {
        subjectId: maths.id,
        academicYearId: later.id,
        academicPeriodId: period(later, 'First term').id,
        academicLevelId: level.id,
        rosterMode: 'academic_level',
      });
      await dataSource.query(
        "UPDATE academic_periods SET status = 'closed' WHERE id = $1",
        [period(later, 'First term').id],
      );
      expect(
        refusal(
          await admin
            .as(campus)
            .put(`/api/v1/course-offerings/${offering.id}/roster`)
            .send({ rosterMode: 'academic_level' })
            .expect(422),
        ),
      ).toBe('Reopen the academic cycle before changing this course offering.');
    });
  });

  describe('bulk creation', () => {
    it('creates per section and level, and skips what is already taught', async () => {
      const art = await makeSubject(admin, campus, 'Art');
      const bulk = (levels: object[]) =>
        admin
          .as(campus)
          .post('/api/v1/course-offerings/bulk')
          .send({
            subjectId: art.id,
            academicYearId: year.id,
            academicPeriodId: 'all',
            levels,
          })
          .expect(200);
      const first = await bulk([
        {
          academicLevelId: level.id,
          rosterMode: 'home_section',
          academicCycleSectionIds: [a.id, b.id],
        },
        { academicLevelId: child.id, rosterMode: 'academic_level' },
      ]);
      expect(first.body.created).toHaveLength(9);
      expect(first.body.skipped).toEqual([]);
      expect(
        first.body.created
          .filter((row: Offering) => row.academicLevelId === level.id)
          .map((row: Offering) => row.academicCycleSectionIds),
      ).toEqual([[a.id], [a.id], [a.id], [b.id], [b.id], [b.id]]);

      const again = await bulk([
        {
          academicLevelId: level.id,
          rosterMode: 'home_section',
          academicCycleSectionIds: [a.id, c.id],
        },
        { academicLevelId: child.id, rosterMode: 'academic_level' },
      ]);
      expect(
        again.body.created.map((row: Offering) => row.academicCycleSectionIds),
      ).toEqual([[c.id], [c.id], [c.id]]);
      expect(again.body.skipped).toHaveLength(6);
      expect(again.body.skipped[0]).toEqual({
        academicPeriodId: firstTerm,
        academicLevelId: level.id,
        rosterMode: 'home_section',
        academicCycleSectionIds: [a.id],
        reason: 'This subject is already taught here.',
      });
    });
  });

  describe('rolling offerings forward', () => {
    it('matches periods and sections, skips what is taught, and reports problems', async () => {
      const rolling = await createSchool(app, organization);
      const rollingAdmin = await campusAdmin(app, rolling);
      const source = await createCalendar(
        rollingAdmin,
        rolling,
        calendarBody(2026),
        true,
      );
      const targetBody = calendarBody(2027);
      targetBody.periods[2].name = 'Summer term';
      const target = await createCalendar(rollingAdmin, rolling, targetBody);
      const grade = await makeLevel(rollingAdmin, rolling);
      const gold = await makeSection(
        rollingAdmin,
        rolling,
        source.id,
        grade.id,
        { name: 'Gold' },
      );
      const silver = await makeSection(
        rollingAdmin,
        rolling,
        source.id,
        grade.id,
        { name: 'Silver' },
      );
      await makeSection(rollingAdmin, rolling, target.id, grade.id, {
        name: 'gold',
      });
      const subject = await makeSubject(rollingAdmin, rolling);
      const offer = (periodName: string, body: object) =>
        makeOfferings(rollingAdmin, rolling, {
          subjectId: subject.id,
          academicYearId: source.id,
          academicPeriodId: period(source, periodName).id,
          academicLevelId: grade.id,
          ...body,
        });
      const [onGold] = await offer('First term', {
        rosterMode: 'home_section',
        academicCycleSectionIds: [gold.id],
        capacity: 30,
      });
      const [whole] = await offer('Second term', {
        rosterMode: 'academic_level',
      });
      const [onSilver] = await offer('First term', {
        rosterMode: 'home_section',
        academicCycleSectionIds: [silver.id],
      });
      const [summer] = await offer('Third term', {
        rosterMode: 'academic_level',
      });

      const path = `/api/v1/academic-years/${target.id}/course-offerings/roll-forward`;
      const preview = await rollingAdmin
        .as(rolling)
        .get(`${path}?sourceYearId=${source.id}`)
        .expect(200);
      expect(
        preview.body.copies.map(
          (copy: { offering: Offering; periodName: string }) => [
            copy.offering.id,
            copy.periodName,
          ],
        ),
      ).toEqual([
        [onGold.id, 'First term'],
        [whole.id, 'Second term'],
      ]);
      expect(
        preview.body.problems.map(
          (problem: { offering: Offering; reason: string }) => [
            problem.offering.id,
            problem.reason,
          ],
        ),
      ).toEqual([
        [onSilver.id, 'Create the matching sections in the new year first.'],
        [
          summer.id,
          'The matching reporting period does not exist in the new year.',
        ],
      ]);

      const run = await rollingAdmin
        .as(rolling)
        .post(path)
        .send({ sourceYearId: source.id })
        .expect(200);
      expect(run.body.created).toHaveLength(2);
      expect(run.body.created[0]).toMatchObject({
        academicYearId: target.id,
        academicPeriodId: period(target, 'First term').id,
        status: 'draft',
        capacity: 30,
      });
      const [event] = await auditEvents(
        app,
        'course_offering.created',
        run.body.created[0].id,
      );
      expect(event.context).toEqual({
        source_academic_year_id: source.id,
        target_academic_year_id: target.id,
        rolled_forward: true,
      });
      expect(
        (
          await rollingAdmin
            .as(rolling)
            .post(path)
            .send({ sourceYearId: source.id })
            .expect(200)
        ).body.created,
      ).toEqual([]);
      expect(
        (
          await rollingAdmin
            .as(rolling)
            .get(`${path}?sourceYearId=${source.id}`)
            .expect(200)
        ).body.skips,
      ).toHaveLength(2);

      expect(
        refusal(
          await rollingAdmin
            .as(rolling)
            .post(path)
            .send({ sourceYearId: target.id })
            .expect(422),
        ),
      ).toBe(
        'Choose a different academic year to receive the course offerings.',
      );
      const past = await createCalendar(
        rollingAdmin,
        rolling,
        calendarBody(2024),
        true,
      );
      expect(
        refusal(
          await rollingAdmin
            .as(rolling)
            .get(
              `/api/v1/academic-years/${past.id}/course-offerings/roll-forward?sourceYearId=${source.id}`,
            )
            .expect(422),
        ),
      ).toBe(
        'Reopen the target academic year before copying course offerings.',
      );
    });
  });

  describe('teaching assignments and the roster', () => {
    let combined: Offering;
    let whole: Offering;
    let partTeacher: Person;
    let fullTeacher: Person;

    beforeAll(async () => {
      const choir = await makeSubject(admin, campus, 'Choir');
      await admin
        .as(campus)
        .post(exceptions(year.id))
        .send({
          subjectId: choir.id,
          rosterMode: 'combined_home_sections',
          reason: 'Joint choir',
        })
        .expect(201);
      await admin
        .as(campus)
        .post(exceptions(year.id))
        .send({
          subjectId: choir.id,
          rosterMode: 'individual_roster',
          reason: 'Soloists',
        })
        .expect(201);
      [combined] = await makeOfferings(admin, campus, {
        subjectId: choir.id,
        academicYearId: year.id,
        academicPeriodId: firstTerm,
        academicLevelId: level.id,
        rosterMode: 'combined_home_sections',
        academicCycleSectionIds: [a.id, b.id],
      });
      [whole] = await makeOfferings(admin, campus, {
        subjectId: choir.id,
        academicYearId: year.id,
        academicPeriodId: firstTerm,
        academicLevelId: group.id,
        rosterMode: 'academic_level',
      });
      partTeacher = await teacherOf(app, campus);
      fullTeacher = await teacherOf(app, campus);
    });

    const assign = (offeringId: string, body: object) =>
      admin
        .as(campus)
        .post(`/api/v1/course-offerings/${offeringId}/teaching-assignments`)
        .send(body);

    it('only a teacher of the campus, on a section of the offering', async () => {
      const stranger = await person(app);
      expect(
        refusal(
          await assign(combined.id, { userId: stranger.user.id }).expect(422),
        ),
      ).toBe('The teacher does not work in this school.');
      const clerk = await person(app, { memberOf: [campus] });
      expect(
        refusal(
          await assign(combined.id, { userId: clerk.user.id }).expect(422),
        ),
      ).toBe('Only a teacher can be assigned to a subject.');
      expect(
        refusal(
          await assign(combined.id, {
            userId: partTeacher.user.id,
            academicCycleSectionId: c.id,
          }).expect(422),
        ),
      ).toBe('The home group does not belong to this offering.');

      const created = await assign(combined.id, {
        userId: partTeacher.user.id,
        academicCycleSectionId: a.id,
        role: 'supporting',
      }).expect(201);
      expect(created.body).toMatchObject({
        teacher: { id: partTeacher.user.id },
        role: 'supporting',
        section: { id: a.id, name: 'A' },
        startsOn: '2026-11-10',
        endsOn: null,
        running: true,
      });
      const repeat = await assign(combined.id, {
        userId: partTeacher.user.id,
        academicCycleSectionId: a.id,
      }).expect(200);
      expect(repeat.body.id).toBe(created.body.id);
      const [event] = await auditEvents(
        app,
        'teaching_assignment.created',
        created.body.id,
      );
      expect(event.context).toMatchObject({
        teacher_id: partTeacher.user.id,
        role: 'supporting',
        academic_cycle_section_id: a.id,
        course_offering_id: combined.id,
      });

      await assign(combined.id, { userId: fullTeacher.user.id }).expect(201);
      const listed = await admin
        .as(campus)
        .get(`/api/v1/course-offerings/${combined.id}/teaching-assignments`)
        .expect(200);
      expect(listed.body).toHaveLength(2);
    });

    it('ends an assignment, never before it starts', async () => {
      const temp = await teacherOf(app, campus);
      const created = await assign(whole.id, {
        userId: temp.user.id,
        startsOn: '2026-11-01',
      }).expect(201);
      const end = (body: object) =>
        admin
          .as(campus)
          .post(`/api/v1/teaching-assignments/${created.body.id}/end`)
          .send(body);
      expect(refusal(await end({ endsOn: '2026-10-31' }).expect(422))).toBe(
        'An assignment cannot end before it starts.',
      );
      const ended = await end({}).expect(200);
      expect(ended.body).toMatchObject({ endsOn: '2026-11-10', running: true });
      expect(
        (await end({ endsOn: '2026-12-31' }).expect(200)).body.endsOn,
      ).toBe('2026-11-10');
      expect(
        await auditEvents(app, 'teaching_assignment.ended', created.body.id),
      ).toHaveLength(1);
    });

    it('a teacher of part of the offering sees only their section', async () => {
      const roster = (who: Person, offeringId: string) =>
        who.as(campus).get(`/api/v1/course-offerings/${offeringId}/roster`);
      const all = await roster(admin, combined.id).expect(200);
      expect(all.body).toMatchObject({
        rosterMode: 'combined_home_sections',
        academicLevelIds: [level.id],
        studentRecordIds: [],
        limitedToSections: false,
      });
      expect(all.body.sections.map((s: { id: string }) => s.id)).toEqual([
        a.id,
        b.id,
      ]);

      const part = await roster(partTeacher, combined.id).expect(200);
      expect(part.body.sections.map((s: { id: string }) => s.id)).toEqual([
        a.id,
      ]);
      expect(part.body.limitedToSections).toBe(true);
      const full = await roster(fullTeacher, combined.id).expect(200);
      expect(full.body.limitedToSections).toBe(false);
      expect(full.body.sections).toHaveLength(2);

      const outsider = await teacherOf(app, campus);
      await roster(outsider, combined.id).expect(403);

      // Named learners: no sections; the learners come with Stage 5.
      const [soloists] = await makeOfferings(admin, campus, {
        subjectId: combined.subject.id,
        academicYearId: year.id,
        academicPeriodId: firstTerm,
        academicLevelId: level.id,
        rosterMode: 'individual_roster',
      });
      expect((await roster(admin, soloists.id).expect(200)).body).toMatchObject(
        {
          rosterMode: 'individual_roster',
          academicLevelIds: [level.id],
          sections: [],
          studentRecordIds: [],
        },
      );

      // A whole-group offering reaches the child levels' sections.
      const childSection = await makeSection(admin, campus, year.id, child.id, {
        name: 'Ruby',
      });
      const groupRoster = await roster(admin, whole.id).expect(200);
      expect(groupRoster.body.academicLevelIds.sort()).toEqual(
        [child.id, group.id].sort(),
      );
      expect(
        groupRoster.body.sections.map((s: { id: string }) => s.id),
      ).toEqual([childSection.id]);
    });

    it('nothing changes in a closed year', async () => {
      const later = await createCalendar(admin, campus, calendarBody(2033));
      const [offering] = await makeOfferings(admin, campus, {
        subjectId: maths.id,
        academicYearId: later.id,
        academicPeriodId: period(later, 'First term').id,
        academicLevelId: level.id,
        rosterMode: 'academic_level',
      });
      await dataSource.query(
        "UPDATE academic_years SET status = 'closed' WHERE id = $1",
        [later.id],
      );
      expect(
        refusal(
          await assign(offering.id, { userId: fullTeacher.user.id }).expect(
            422,
          ),
        ),
      ).toBe(
        'The academic year is closed. Reopen it before you change teaching.',
      );
    });
  });

  describe('model migration impact', () => {
    it('counts the offerings the new model refuses and leaves them alone', async () => {
      const moving = await createSchool(app, organization);
      const movingAdmin = await campusAdmin(app, moving);
      const running = await createCalendar(
        movingAdmin,
        moving,
        calendarBody(2026),
        true,
      );
      const grade = await makeLevel(movingAdmin, moving);
      const one = await makeSection(movingAdmin, moving, running.id, grade.id);
      const two = await makeSection(movingAdmin, moving, running.id, grade.id);
      const subject = await makeSubject(movingAdmin, moving);
      const migrate = (model: string) =>
        movingAdmin
          .as(moving)
          .post(
            `/api/v1/academic-years/${running.id}/instructional-model/migrations`,
          )
          .send({ model, reason: 'Timetable change' })
          .expect(201);
      await migrate('hybrid');
      const offer = (body: object) =>
        makeOfferings(movingAdmin, moving, {
          subjectId: subject.id,
          academicYearId: running.id,
          academicPeriodId: period(running, 'First term').id,
          academicLevelId: grade.id,
          ...body,
        });
      const [joint] = await offer({
        rosterMode: 'combined_home_sections',
        academicCycleSectionIds: [one.id, two.id],
      });
      await offer({
        rosterMode: 'home_section',
        academicCycleSectionIds: [one.id],
      });
      await offer({ rosterMode: 'individual_roster' });

      const back = await migrate('fixed_home_sections');
      expect(back.body.impact).toEqual({
        offerings: 3,
        offerings_by_roster: {
          combined_home_sections: 1,
          home_section: 1,
          individual_roster: 1,
        },
        exceptions: 2,
        exception_rosters: { combined_home_sections: 1, individual_roster: 1 },
      });
      const kept = await movingAdmin
        .as(moving)
        .get(`/api/v1/course-offerings/${joint.id}`)
        .expect(200);
      expect(kept.body.rosterMode).toBe('combined_home_sections');
      const [{ count }] = await dataSource.query(
        'SELECT count(*)::int AS count FROM instructional_model_exceptions WHERE school_id = $1',
        [moving.id],
      );
      expect(count).toBe(0);
    });
  });
});
