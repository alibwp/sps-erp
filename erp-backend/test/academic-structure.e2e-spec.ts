import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
import { CycleSections } from '../src/curriculum/cycle-sections.service.js';
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
  makeLevel,
  makeOfferings,
  makeSection,
  makeSubject,
  teacherOf,
} from './support/curriculum.js';
import { createTestApp } from './support/test-app.js';

const NOW = new Date('2026-11-10T12:00:00Z');

describe('Academic structure (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const clock = new FixedClock(NOW);
  let organization: Organization;
  let campus: School;
  let admin: Person;
  let closedYear: CalendarYear;
  let year: CalendarYear;

  const refusal = (res: { body: { error: { message: string } } }) =>
    res.body.error.message;

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
  });

  // Requests are limited per person (60 a minute), so each test works as a
  // fresh admin of the same campus.
  beforeEach(async () => {
    admin = await campusAdmin(app, campus);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('levels', () => {
    let group: { id: string };
    let child: { id: string };

    it('a level group sits at the top; a level sits under an active group', async () => {
      group = await makeLevel(admin, campus, {
        name: 'Junior school',
        isGroup: true,
      });
      child = await makeLevel(admin, campus, {
        name: 'Primary 1',
        parentId: group.id,
        code: 'P1',
      });
      expect(child).toMatchObject({
        parentId: group.id,
        isGroup: false,
        status: 'active',
      });
      const [event] = await auditEvents(
        app,
        'academic_level.created',
        child.id,
      );
      expect(event.context).toEqual({
        parent_id: group.id,
        is_group: false,
        code: 'P1',
      });

      const post = (body: object) =>
        admin.as(campus).post('/api/v1/academic-levels').send(body);
      expect(
        refusal(
          await post({ name: 'X', isGroup: true, parentId: group.id }).expect(
            422,
          ),
        ),
      ).toBe('A level group must be a top-level group without a parent.');
      expect(
        refusal(await post({ name: 'Y', parentId: child.id }).expect(422)),
      ).toBe('Choose one of the listed level groups.');
      expect(refusal(await post({ name: 'primary 1' }).expect(422))).toBe(
        'This school already has a level with that name.',
      );
      expect(
        refusal(await post({ name: 'Other', code: 'p1' }).expect(422)),
      ).toBe('This school already has a level with that short code.');

      // Names are per campus, and another campus's level is not found.
      const other = await createSchool(app, organization);
      const otherAdmin = await campusAdmin(app, other);
      await makeLevel(otherAdmin, other, { name: 'Primary 1', code: 'P1' });
      await otherAdmin
        .as(other)
        .get(`/api/v1/academic-levels/${child.id}`)
        .expect(404);
    });

    it('refuses changes that would break the tree', async () => {
      const patch = (id: string, body: object) =>
        admin.as(campus).patch(`/api/v1/academic-levels/${id}`).send(body);
      expect(
        refusal(await patch(group.id, { isGroup: false }).expect(422)),
      ).toBe(
        'Move the child levels first before marking this group as a teachable level.',
      );
      expect(
        refusal(await patch(child.id, { parentId: child.id }).expect(422)),
      ).toBe('A level cannot sit under itself.');
      const taught = await makeLevel(admin, campus);
      await makeSection(admin, campus, year.id, taught.id);
      expect(
        refusal(await patch(taught.id, { isGroup: true }).expect(422)),
      ).toBe('This level has sections, so it cannot become a level group.');

      const renamed = await patch(child.id, {
        name: 'Primary One',
        position: 3,
      }).expect(200);
      expect(renamed.body).toMatchObject({
        name: 'Primary One',
        code: 'P1',
        position: 3,
      });
      const [event] = await auditEvents(
        app,
        'academic_level.updated',
        child.id,
      );
      expect(event.context).toMatchObject({
        from: { name: 'Primary 1', position: 0 },
        to: { name: 'Primary One', position: 3 },
      });
    });

    it('archives a level only when no running section uses it, and deletes only unused ones', async () => {
      const level = await makeLevel(admin, campus);
      await makeSection(admin, campus, year.id, level.id);
      const status = (id: string, to: string) =>
        admin
          .as(campus)
          .post(`/api/v1/academic-levels/${id}/status`)
          .send({ status: to });
      expect(refusal(await status(level.id, 'archived').expect(422))).toBe(
        'Archive the 1 draft or active sections of this class first.',
      );
      expect(refusal(await status(level.id, 'draft').expect(422))).toBe(
        'A Active class cannot become Draft.',
      );
      const del = (id: string) =>
        admin.as(campus).delete(`/api/v1/academic-levels/${id}`);
      expect(refusal(await del(level.id).expect(422))).toBe(
        'This level has year sections. Keep it for history instead of deleting it.',
      );
      expect(refusal(await del(group.id).expect(422))).toBe(
        'Move the child levels first before deleting this level group.',
      );

      const unused = await makeLevel(admin, campus, { name: 'Unused' });
      await del(unused.id).expect(204);
      const [event] = await auditEvents(
        app,
        'academic_level.deleted',
        unused.id,
      );
      expect(event.context).toEqual({
        name: 'Unused',
        code: null,
        is_group: false,
      });

      const spare = await makeLevel(admin, campus);
      await status(spare.id, 'archived').expect(200);
      expect(
        refusal(
          await admin
            .as(campus)
            .patch(`/api/v1/academic-levels/${spare.id}`)
            .send({ name: 'Back' })
            .expect(422),
        ),
      ).toBe('An archived class cannot be edited.');
    });

    it('moves a level among its siblings', async () => {
      const quiet = await createSchool(app, organization);
      const quietAdmin = await campusAdmin(app, quiet);
      const [a, b, c] = [
        await makeLevel(quietAdmin, quiet, { name: 'A' }),
        await makeLevel(quietAdmin, quiet, { name: 'B' }),
        await makeLevel(quietAdmin, quiet, { name: 'C' }),
      ];
      const move = (id: string, direction: string) =>
        quietAdmin
          .as(quiet)
          .post(`/api/v1/academic-levels/${id}/move`)
          .send({ direction });
      expect((await move(c.id, 'up').expect(200)).body).toEqual({
        moved: true,
      });
      expect((await move(a.id, 'up').expect(200)).body).toEqual({
        moved: false,
      });
      const list = await quietAdmin
        .as(quiet)
        .get('/api/v1/academic-levels')
        .expect(200);
      expect(list.body.map((level: { name: string }) => level.name)).toEqual([
        'A',
        'C',
        'B',
      ]);
      void b;
    });

    it('needs the class permissions', async () => {
      const teacher = await teacherOf(app, campus);
      await teacher.as(campus).get('/api/v1/academic-levels').expect(403);
      await teacher
        .as(campus)
        .post('/api/v1/academic-levels')
        .send({ name: 'Nope' })
        .expect(403);
    });
  });

  describe('sections', () => {
    let level: { id: string };
    let teacher: Person;

    beforeAll(async () => {
      level = await makeLevel(admin, campus, { name: 'Basic 4' });
      teacher = await teacherOf(app, campus);
    });

    it('needs an active teachable level, an open year and a teacher of the campus', async () => {
      const post = (body: object) =>
        admin
          .as(campus)
          .post('/api/v1/academic-cycle-sections')
          .send({
            academicYearId: year.id,
            academicLevelId: level.id,
            name: 'Gold',
            ...body,
          });
      const group = await makeLevel(admin, campus, { isGroup: true });
      expect(
        refusal(await post({ academicLevelId: group.id }).expect(422)),
      ).toBe(
        'A level group organizes teachable levels. Add this section under one of its child levels.',
      );
      const archived = await makeLevel(admin, campus);
      await admin
        .as(campus)
        .post(`/api/v1/academic-levels/${archived.id}/status`)
        .send({ status: 'archived' })
        .expect(200);
      expect(
        refusal(await post({ academicLevelId: archived.id }).expect(422)),
      ).toBe('Choose an active class for this section.');
      expect(
        refusal(await post({ academicYearId: closedYear.id }).expect(422)),
      ).toBe(
        'The academic cycle is closed. Reopen it before configuring sections.',
      );
      const stranger = await person(app);
      expect(
        refusal(
          await post({ homeroomTeacherId: stranger.user.id }).expect(422),
        ),
      ).toBe('The class teacher does not work in this school.');
      const clerk = await person(app, { memberOf: [campus] });
      expect(
        refusal(await post({ homeroomTeacherId: clerk.user.id }).expect(422)),
      ).toBe('Only a teacher can be a class teacher.');

      const created = await post({
        homeroomTeacherId: teacher.user.id,
        capacity: 30,
      }).expect(201);
      expect(created.body).toMatchObject({
        name: 'Gold',
        status: 'draft',
        capacity: 30,
        homeroomTeacher: { id: teacher.user.id, name: teacher.user.name },
      });
      expect(refusal(await post({ name: 'GOLD' }).expect(422))).toBe(
        'This class already has a section with this name in this school year. Choose another name.',
      );
      const [event] = await auditEvents(
        app,
        'academic_cycle_section.created',
        created.body.id,
      );
      expect(event.context).toEqual({
        academic_year_id: year.id,
        academic_level_id: level.id,
        homeroom_teacher_id: teacher.user.id,
      });
    });

    it('speaks in the campus’s own words', async () => {
      const worded = await createSchool(app, organization);
      const wordedAdmin = await campusAdmin(app, worded);
      await dataSource.query(
        `UPDATE school_operating_profiles
            SET labels = labels || '{"class_level": "Form", "section": "Arm", "homeroom_teacher": "Form tutor"}'::jsonb
          WHERE school_id = $1`,
        [worded.id],
      );
      const wordedYear = await createCalendar(
        wordedAdmin,
        worded,
        calendarBody(2026),
        true,
      );
      const form = await makeLevel(wordedAdmin, worded);
      const clerk = await person(app, { memberOf: [worded] });
      const res = await wordedAdmin
        .as(worded)
        .post('/api/v1/academic-cycle-sections')
        .send({
          academicYearId: wordedYear.id,
          academicLevelId: form.id,
          name: 'Blue',
          homeroomTeacherId: clerk.user.id,
        })
        .expect(422);
      expect(refusal(res)).toBe('Only a teacher can be a form tutor.');
      await makeSection(wordedAdmin, worded, wordedYear.id, form.id);
      expect(
        refusal(
          await wordedAdmin
            .as(worded)
            .post(`/api/v1/academic-levels/${form.id}/status`)
            .send({ status: 'archived' })
            .expect(422),
        ),
      ).toBe('Archive the 1 draft or active arms of this form first.');
    });

    it('lets a later stage refuse archiving and lowering the capacity', async () => {
      const section = await makeSection(admin, campus, year.id, level.id, {
        capacity: 40,
      });
      app.get(CycleSections).registerUsage({
        seatsTaken: async (_manager, row) => (row.id === section.id ? 3 : 0),
        archiveRefusal: async (_manager, row) =>
          row.id === section.id
            ? 'Move the 3 learners of this section before archiving it.'
            : null,
      });
      const patch = (body: object) =>
        admin
          .as(campus)
          .patch(`/api/v1/academic-cycle-sections/${section.id}`)
          .send(body);
      const low = await patch({ capacity: 2 }).expect(422);
      expect(refusal(low)).toBe(
        '3 seats are taken in this section now, counting open waitlist offers. Set a capacity of at least 3.',
      );
      expect(low.body.error.fields).toEqual({ capacity: [refusal(low)] });
      await patch({ capacity: 3, room: 'B12' }).expect(200);
      expect(
        refusal(
          await admin
            .as(campus)
            .post(`/api/v1/academic-cycle-sections/${section.id}/status`)
            .send({ status: 'archived' })
            .expect(422),
        ),
      ).toBe('Move the 3 learners of this section before archiving it.');
    });

    it('moves through its statuses and stops changing in a closed year', async () => {
      const section = await makeSection(admin, campus, year.id, level.id);
      const status = (id: string, to: string) =>
        admin
          .as(campus)
          .post(`/api/v1/academic-cycle-sections/${id}/status`)
          .send({ status: to });
      await status(section.id, 'active').expect(200);
      expect(refusal(await status(section.id, 'draft').expect(422))).toBe(
        'A Active section cannot become Draft.',
      );
      await status(section.id, 'archived').expect(200);
      expect(
        refusal(
          await admin
            .as(campus)
            .patch(`/api/v1/academic-cycle-sections/${section.id}`)
            .send({ name: 'Renamed' })
            .expect(422),
        ),
      ).toBe('An archived section cannot be edited.');

      const later = await createCalendar(admin, campus, calendarBody(2030));
      const waiting = await makeSection(admin, campus, later.id, level.id);
      await dataSource.query(
        "UPDATE academic_years SET status = 'closed' WHERE id = $1",
        [later.id],
      );
      expect(refusal(await status(waiting.id, 'active').expect(422))).toBe(
        'The academic cycle is closed. Reopen it before activating a section.',
      );
      expect(
        refusal(
          await admin
            .as(campus)
            .patch(`/api/v1/academic-cycle-sections/${waiting.id}`)
            .send({ room: 'C1' })
            .expect(422),
        ),
      ).toBe(
        'The academic cycle is closed. Reopen it before editing a section.',
      );
    });

    it('rolls sections forward once, leaving archived ones and retired levels behind', async () => {
      const rolling = await createSchool(app, organization);
      const rollingAdmin = await campusAdmin(app, rolling);
      const source = await createCalendar(
        rollingAdmin,
        rolling,
        calendarBody(2026),
        true,
      );
      const target = await createCalendar(
        rollingAdmin,
        rolling,
        calendarBody(2027),
      );
      const kept = await makeLevel(rollingAdmin, rolling, { name: 'Kept' });
      const retired = await makeLevel(rollingAdmin, rolling, {
        name: 'Retired',
      });
      const teacherHere = await teacherOf(app, rolling);
      const gold = await makeSection(
        rollingAdmin,
        rolling,
        source.id,
        kept.id,
        {
          name: 'Gold',
          room: 'A1',
          capacity: 25,
          homeroomTeacherId: teacherHere.user.id,
        },
      );
      const old = await makeSection(rollingAdmin, rolling, source.id, kept.id, {
        name: 'Old',
      });
      await rollingAdmin
        .as(rolling)
        .post(`/api/v1/academic-cycle-sections/${old.id}/status`)
        .send({ status: 'archived' })
        .expect(200);
      const gone = await makeSection(
        rollingAdmin,
        rolling,
        source.id,
        retired.id,
        { name: 'Gone' },
      );
      await rollingAdmin
        .as(rolling)
        .post(`/api/v1/academic-cycle-sections/${gone.id}/status`)
        .send({ status: 'archived' })
        .expect(200);
      await rollingAdmin
        .as(rolling)
        .post(`/api/v1/academic-levels/${retired.id}/status`)
        .send({ status: 'archived' })
        .expect(200);

      const path = `/api/v1/academic-years/${target.id}/sections/roll-forward`;
      const preview = await rollingAdmin
        .as(rolling)
        .get(`${path}?sourceYearId=${source.id}`)
        .expect(200);
      expect(preview.body.copies.map((s: { name: string }) => s.name)).toEqual([
        'Gold',
      ]);
      expect(
        preview.body.leftBehind.map((s: { name: string }) => s.name).sort(),
      ).toEqual(['Gone', 'Old']);
      const run = await rollingAdmin
        .as(rolling)
        .post(path)
        .send({ sourceYearId: source.id })
        .expect(200);
      expect(run.body.created).toEqual([
        expect.objectContaining({
          name: 'Gold',
          academicYearId: target.id,
          academicLevelId: kept.id,
          room: 'A1',
          capacity: 25,
          status: 'draft',
          homeroomTeacher: null,
        }),
      ]);
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
      ).toEqual([expect.objectContaining({ id: gold.id })]);
      const events = await auditEvents(
        app,
        'academic_cycle_section.rolled_forward',
        target.id,
      );
      expect(events).toHaveLength(1);
      expect(events[0].context).toMatchObject({
        source_academic_year_id: source.id,
        academic_cycle_section_ids: [run.body.created[0].id],
      });

      expect(
        refusal(
          await rollingAdmin
            .as(rolling)
            .post(path)
            .send({ sourceYearId: target.id })
            .expect(422),
        ),
      ).toBe('Choose a different academic cycle to receive the sections.');
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
            .post(`/api/v1/academic-years/${past.id}/sections/roll-forward`)
            .send({ sourceYearId: source.id })
            .expect(422),
        ),
      ).toBe('The target academic cycle is closed.');
    });
  });

  describe('subjects', () => {
    it('keeps one subject per name, ignoring case, among those not deleted', async () => {
      const maths = await makeSubject(admin, campus, 'Mathematics');
      const post = (name: string) =>
        admin
          .as(campus)
          .post('/api/v1/subjects')
          .send({ name, shortName: 'X' });
      expect(refusal(await post('MATHEMATICS').expect(422))).toBe(
        'This school already has a subject with that name.',
      );
      const art = await makeSubject(admin, campus, 'Art');
      expect(
        refusal(
          await admin
            .as(campus)
            .patch(`/api/v1/subjects/${art.id}`)
            .send({ name: 'mathematics' })
            .expect(422),
        ),
      ).toBe('This school already has a subject with that name.');
      await admin.as(campus).delete(`/api/v1/subjects/${art.id}`).expect(204);
      await admin.as(campus).get(`/api/v1/subjects/${art.id}`).expect(404);
      await post('Art').expect(201);
      const list = await admin
        .as(campus)
        .get('/api/v1/subjects?search=math')
        .expect(200);
      expect(list.body.data.map((s: { id: string }) => s.id)).toEqual([
        maths.id,
      ]);
    });

    it('a taught subject is kept', async () => {
      const taught = await makeSubject(admin, campus);
      const level = await makeLevel(admin, campus);
      await makeOfferings(admin, campus, {
        subjectId: taught.id,
        academicYearId: year.id,
        academicPeriodId: period(year, 'First term').id,
        academicLevelId: level.id,
        rosterMode: 'academic_level',
      });
      expect(
        refusal(
          await admin
            .as(campus)
            .delete(`/api/v1/subjects/${taught.id}`)
            .expect(422),
        ),
      ).toBe(
        'This subject is taught, so it cannot be deleted. Close its course offerings first.',
      );
    });

    it('needs the subject permissions', async () => {
      const teacher = await teacherOf(app, campus);
      await teacher.as(campus).get('/api/v1/subjects').expect(403);
    });
  });

  describe('calendar removals', () => {
    it('keeps a draft calendar with sections, and a period with offerings', async () => {
      const level = await makeLevel(admin, campus);
      const withSections = await createCalendar(
        admin,
        campus,
        calendarBody(2028),
      );
      await makeSection(admin, campus, withSections.id, level.id);
      expect(
        refusal(
          await admin
            .as(campus)
            .delete(`/api/v1/academic-years/${withSections.id}`)
            .expect(422),
        ),
      ).toBe(
        'This calendar has sections or course offerings, so it cannot be deleted.',
      );

      const withOfferings = await createCalendar(
        admin,
        campus,
        calendarBody(2032),
      );
      const subject = await makeSubject(admin, campus);
      await makeOfferings(admin, campus, {
        subjectId: subject.id,
        academicYearId: withOfferings.id,
        academicPeriodId: period(withOfferings, 'Second term').id,
        academicLevelId: level.id,
        rosterMode: 'academic_level',
      });
      const body = calendarBody(2032);
      const resave = await admin
        .as(campus)
        .put(`/api/v1/academic-years/${withOfferings.id}`)
        .send({
          ...body,
          periods: [
            { ...body.periods[0], id: period(withOfferings, 'First term').id },
            { ...body.periods[2], id: period(withOfferings, 'Third term').id },
          ],
        })
        .expect(422);
      expect(refusal(resave)).toBe(
        'Second term has course offerings, so it cannot be removed.',
      );
      expect(
        refusal(
          await admin
            .as(campus)
            .delete(
              `/api/v1/academic-periods/${period(withOfferings, 'Second term').id}`,
            )
            .expect(422),
        ),
      ).toBe('Second term has course offerings, so it cannot be removed.');
      // Without them the draft still goes.
      const empty = await createCalendar(admin, campus, calendarBody(2034));
      await admin
        .as(campus)
        .delete(`/api/v1/academic-years/${empty.id}`)
        .expect(204);
    });
  });

  describe('setup and leaving the campus', () => {
    it('the setup checklist counts classes, sections and offerings', async () => {
      const fresh = await createSchool(app, organization);
      const freshAdmin = await campusAdmin(app, fresh);
      const freshYear = await createCalendar(
        freshAdmin,
        fresh,
        calendarBody(2026),
        true,
      );
      const group = await makeLevel(freshAdmin, fresh, { isGroup: true });
      const level = await makeLevel(freshAdmin, fresh, { parentId: group.id });
      const section = await makeSection(
        freshAdmin,
        fresh,
        freshYear.id,
        level.id,
      );
      const subject = await makeSubject(freshAdmin, fresh);
      await makeOfferings(freshAdmin, fresh, {
        subjectId: subject.id,
        academicYearId: freshYear.id,
        academicPeriodId: 'all',
        academicLevelId: level.id,
        rosterMode: 'home_section',
        academicCycleSectionIds: [section.id],
      });
      const setup = await freshAdmin
        .as(fresh)
        .get('/api/v1/school/setup')
        .expect(200);
      expect(setup.body.counts).toMatchObject({
        academicLevels: 1,
        cycleSections: 1,
        courseOfferings: 3,
      });
      const complete = (key: string) =>
        setup.body.items.find((item: { key: string }) => item.key === key)
          .complete;
      expect(
        ['academic_levels', 'cycle_sections', 'course_offerings'].map(complete),
      ).toEqual([true, true, true]);
      const yearSetup = await freshAdmin
        .as(fresh)
        .get(`/api/v1/academic-years/${freshYear.id}/setup`)
        .expect(200);
      expect(
        yearSetup.body.steps
          .filter((step: { value: string }) =>
            ['structure', 'subjects'].includes(step.value),
          )
          .map((step: { complete: boolean }) => step.complete),
      ).toEqual([true, true]);
    });

    it('ends a leaving teacher’s assignments and hands back their sections in running years', async () => {
      const level = await makeLevel(admin, campus);
      const leaving = await teacherOf(app, campus);
      const running = await makeSection(admin, campus, year.id, level.id, {
        homeroomTeacherId: leaving.user.id,
      });
      const nextYear = await createCalendar(admin, campus, calendarBody(2031));
      const upcoming = await makeSection(admin, campus, nextYear.id, level.id, {
        homeroomTeacherId: leaving.user.id,
      });
      const subject = await makeSubject(admin, campus);
      const [offering] = await makeOfferings(admin, campus, {
        subjectId: subject.id,
        academicYearId: year.id,
        academicPeriodId: period(year, 'First term').id,
        academicLevelId: level.id,
        rosterMode: 'academic_level',
      });
      const assigned = await admin
        .as(campus)
        .post(`/api/v1/course-offerings/${offering.id}/teaching-assignments`)
        .send({ userId: leaving.user.id, startsOn: '2026-09-01' })
        .expect(201);

      await admin
        .as(campus)
        .post(`/api/v1/accounts/${leaving.user.id}/membership/end`)
        .expect(204);

      const [assignment] = await dataSource.query(
        'SELECT ends_on::text FROM teaching_assignments WHERE id = $1',
        [assigned.body.id],
      );
      expect(assignment.ends_on).toBe('2026-11-10');
      const [ended] = await auditEvents(
        app,
        'teaching_assignment.ended',
        assigned.body.id,
      );
      expect(ended).toMatchObject({
        actorId: admin.user.id,
        context: { ends_on: '2026-11-10' },
      });
      const homeroom = async (id: string) =>
        (
          await dataSource.query(
            'SELECT homeroom_teacher_id FROM academic_cycle_sections WHERE id = $1',
            [id],
          )
        )[0].homeroom_teacher_id;
      expect(await homeroom(running.id)).toBeNull();
      expect(await homeroom(upcoming.id)).toBe(leaving.user.id);
    });
  });
});
