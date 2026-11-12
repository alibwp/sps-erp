import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AcademicCalendarJobs } from '../src/academic/academic-calendar-jobs.service.js';
import { SchoolSetup } from '../src/academic/school-setup.service.js';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
import { MailService } from '../src/mail/mail.service.js';
import type { Organization } from '../src/organizations/entities/organization.entity.js';
import type { School } from '../src/organizations/entities/school.entity.js';
import {
  type CalendarYear,
  calendarBody,
  createCalendar,
  history,
  period,
  personWith,
  statusOf,
} from './support/academic.js';
import {
  type Person,
  auditEvents,
  campusAdmin,
  createOrganization,
  createSchool,
  makeOrganizationMember,
  person,
} from './support/campus.js';
import { fakeMail } from './support/identity.js';
import { createTestApp } from './support/test-app.js';

const NOW = new Date('2026-11-10T12:00:00Z');

const TEMPLATE = {
  name: 'Three terms',
  cycleLengthDays: 365,
  isDefault: true,
  autoOpen: true,
  generateAheadWeeks: 6,
  remindDaysBefore: 14,
  periods: [
    {
      name: 'Term 1',
      type: 'term',
      position: 1,
      startOffsetDays: 0,
      lengthDays: 106,
    },
    {
      name: 'Term 2',
      type: 'term',
      position: 2,
      startOffsetDays: 126,
      lengthDays: 86,
    },
    {
      name: 'Term 3',
      type: 'term',
      position: 3,
      startOffsetDays: 226,
      lengthDays: 108,
    },
    {
      name: 'Term 1 exams',
      type: 'exam_window',
      position: 1,
      startOffsetDays: 90,
      lengthDays: 10,
      parentIndex: 1,
    },
  ],
};

describe('Academic setup (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const clock = new FixedClock(NOW);
  const mail = fakeMail();
  let organization: Organization;
  let owner: Person;
  let reader: Person;

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: MailService, useValue: mail.service },
      ],
    });
    dataSource = app.get(DataSource);
    organization = await createOrganization(app);
    owner = await person(app);
    await makeOrganizationMember(app, owner.user, organization);
    reader = await person(app);
    await makeOrganizationMember(app, reader.user, organization, [
      'read organization',
    ]);
  });

  afterEach(() => clock.set(NOW));

  afterAll(async () => {
    await app.close();
  });

  describe('calendar templates and cycles', () => {
    let templateId: string;
    let campus: School;
    const base = () => `/api/v1/organizations/${organization.id}`;

    beforeAll(async () => {
      campus = await createSchool(app, organization);
    });

    it('saves a template with nested periods (manage organization)', async () => {
      const res = await owner
        .as()
        .post(`${base()}/calendar-templates`)
        .send(TEMPLATE)
        .expect(201);
      templateId = res.body.id;
      expect(res.body).toMatchObject({
        name: 'Three terms',
        isDefault: true,
        cycleLengthDays: 365,
      });
      const term1 = res.body.periods.find(
        (p: { name: string }) => p.name === 'Term 1',
      );
      expect(
        res.body.periods.find(
          (p: { name: string }) => p.name === 'Term 1 exams',
        ),
      ).toMatchObject({
        parentId: term1.id,
        startOffsetDays: 90,
      });
      const [event] = await auditEvents(
        app,
        'calendar_template.saved',
        templateId,
      );
      expect(event.context).toEqual({
        organization_id: organization.id,
        period_count: 4,
        is_default: true,
      });

      const listed = await reader
        .as()
        .get(`${base()}/calendar-templates`)
        .expect(200);
      expect(listed.body.map((t: { id: string }) => t.id)).toEqual([
        templateId,
      ]);
      await reader
        .as()
        .post(`${base()}/calendar-templates`)
        .send(TEMPLATE)
        .expect(403);
      const stranger = await person(app);
      await stranger.as().get(`${base()}/calendar-templates`).expect(404);
    });

    it('refuses rows that do not fit, with the reference messages', async () => {
      const bad = {
        ...TEMPLATE,
        isDefault: false,
        periods: [
          TEMPLATE.periods[0],
          { ...TEMPLATE.periods[1], startOffsetDays: 100 },
        ],
      };
      const res = await owner
        .as()
        .post(`${base()}/calendar-templates`)
        .send(bad)
        .expect(422);
      expect(res.body.error.message).toBe(
        'Rows 1 and 2 share days. Periods side by side must not overlap.',
      );
      const tooLong = { ...TEMPLATE, cycleLengthDays: 200 };
      expect(
        (
          await owner
            .as()
            .post(`${base()}/calendar-templates`)
            .send(tooLong)
            .expect(422)
        ).body.error.message,
      ).toBe(
        'Row 2 ends after the school year ends. Shorten it or start it earlier.',
      );
    });

    it('one default per organization', async () => {
      const second = await owner
        .as()
        .post(`${base()}/calendar-templates`)
        .send({ ...TEMPLATE, name: 'Two semesters' })
        .expect(201);
      const listed = await owner
        .as()
        .get(`${base()}/calendar-templates`)
        .expect(200);
      expect(
        listed.body
          .filter((t: { isDefault: boolean }) => t.isDefault)
          .map((t: { id: string }) => t.id),
      ).toEqual([second.body.id]);
      // Back to the first one.
      await owner
        .as()
        .put(`${base()}/calendar-templates/${templateId}`)
        .send(TEMPLATE)
        .expect(200);
    });

    it('a campus overrides the default only with a reason, and can follow it again', async () => {
      const path = `${base()}/campuses/${campus.id}/calendar-template`;
      const [{ id: other }] = await dataSource.query(
        "SELECT id FROM calendar_templates WHERE organization_id = $1 AND name = 'Two semesters'",
        [organization.id],
      );
      const noReason = await owner
        .as()
        .put(path)
        .send({ calendarTemplateId: other })
        .expect(422);
      expect(noReason.body.error.message).toBe(
        'Say why this campus needs a calendar of its own.',
      );
      await owner
        .as()
        .put(path)
        .send({ calendarTemplateId: other, reason: 'Boarding term dates' })
        .expect(200);
      const [event] = await auditEvents(
        app,
        'campus_calendar.overridden',
        campus.id,
      );
      expect(event.context).toEqual({
        from: null,
        to: other,
        inherits: false,
        reason: 'Boarding term dates',
      });
      await owner.as().put(path).send({ calendarTemplateId: null }).expect(200);
      const foreignOrg = await createOrganization(app);
      const foreignOwner = await person(app);
      await makeOrganizationMember(app, foreignOwner.user, foreignOrg);
      const foreign = await foreignOwner
        .as()
        .post(`/api/v1/organizations/${foreignOrg.id}/calendar-templates`)
        .send(TEMPLATE)
        .expect(201);
      const refused = await owner
        .as()
        .put(path)
        .send({ calendarTemplateId: foreign.body.id, reason: 'x' })
        .expect(422);
      expect(refused.body.error.message).toBe(
        'That calendar template belongs to another organization.',
      );
      await reader
        .as()
        .put(path)
        .send({ calendarTemplateId: null })
        .expect(403);
    });

    it('generates a draft cycle with every period dated from the start (leap year)', async () => {
      const res = await owner
        .as()
        .post(`${base()}/campuses/${campus.id}/academic-cycles`)
        .send({ startsOn: '2027-09-01' })
        .expect(201);
      expect(res.body).toMatchObject({
        status: 'draft',
        startsOn: '2027-09-01',
        endsOn: '2028-08-30',
        name: '2027–28',
      });
      const dates = res.body.periods.map(
        (p: { name: string; startsOn: string; endsOn: string }) => [
          p.name,
          p.startsOn,
          p.endsOn,
        ],
      );
      expect(dates).toEqual([
        ['Term 1', '2027-09-01', '2027-12-15'],
        ['Term 2', '2028-01-05', '2028-03-30'],
        ['Term 3', '2028-04-14', '2028-07-30'],
      ]);
      expect(period(res.body, 'Term 1').children).toEqual([
        expect.objectContaining({
          name: 'Term 1 exams',
          startsOn: '2027-11-30',
          endsOn: '2027-12-09',
        }),
      ]);
      const [event] = await auditEvents(
        app,
        'academic_cycle.generated',
        res.body.id,
      );
      expect(event).toMatchObject({
        schoolId: campus.id,
        actorId: owner.user.id,
        context: {
          template_id: templateId,
          starts_on: '2027-09-01',
          ends_on: '2028-08-30',
          periods: 4,
        },
      });

      const clash = await owner
        .as()
        .post(`${base()}/campuses/${campus.id}/academic-cycles`)
        .send({ startsOn: '2028-03-01' })
        .expect(422);
      expect(clash.body.error.message).toBe(
        'This cycle runs over 2027–28, which covers 2027-09-01 to 2028-08-30.',
      );
      await reader
        .as()
        .post(`${base()}/campuses/${campus.id}/academic-cycles`)
        .send({ startsOn: '2030-09-01' })
        .expect(403);

      const bare = await createOrganization(app);
      const bareOwner = await person(app);
      await makeOrganizationMember(app, bareOwner.user, bare);
      const bareCampus = await createSchool(app, bare);
      const none = await bareOwner
        .as()
        .post(
          `/api/v1/organizations/${bare.id}/campuses/${bareCampus.id}/academic-cycles`,
        )
        .send({ startsOn: '2027-09-01' })
        .expect(422);
      expect(none.body.error.message).toBe(
        'This campus has no calendar template. Choose one, or set a default for the organization.',
      );
    });
  });

  describe('instructional model', () => {
    let campus: School;
    let admin: Person;
    let future: CalendarYear;
    let running: CalendarYear;
    const model = (who: Person, yearId: string) =>
      who
        .as(campus)
        .get(`/api/v1/academic-years/${yearId}/instructional-model`);

    beforeAll(async () => {
      campus = await createSchool(app, organization);
      admin = await campusAdmin(app, campus);
      future = await createCalendar(admin, campus, calendarBody(2027));
      running = await createCalendar(admin, campus, calendarBody(2026), true);
    });

    it('a year that has not started takes its model directly', async () => {
      const before = await model(admin, future.id).expect(200);
      expect(before.body).toMatchObject({
        model: 'fixed_home_sections',
        chosen: false,
        canSet: true,
        canMigrate: false,
        rosterModes: ['home_section', 'academic_level'],
        migrations: [],
      });
      const set = await admin
        .as(campus)
        .put(`/api/v1/academic-years/${future.id}/instructional-model`)
        .send({ model: 'hybrid' })
        .expect(200);
      expect(set.body).toMatchObject({ model: 'hybrid', chosen: true });
      const events = await auditEvents(app, 'instructional_model.changed');
      expect(events.at(-1)?.context).toMatchObject({
        from: null,
        to: 'hybrid',
        academic_year_id: future.id,
      });
      await admin
        .as(campus)
        .put(`/api/v1/academic-years/${future.id}/instructional-model`)
        .send({ model: 'hybrid' })
        .expect(200);
      expect(
        await auditEvents(app, 'instructional_model.changed'),
      ).toHaveLength(events.length);
    });

    it('a running year changes only through a migration with a reason', async () => {
      const set = await admin
        .as(campus)
        .put(`/api/v1/academic-years/${running.id}/instructional-model`)
        .send({ model: 'hybrid' })
        .expect(422);
      expect(set.body.error.message).toBe(
        'The instructional model of 2026–27 cannot change here, because the cycle has already started. Choose the model for a cycle that has not started, or move this one with the audited migration workflow.',
      );
      const migrate = (who: Person, yearId: string, body: object) =>
        who
          .as(campus)
          .post(
            `/api/v1/academic-years/${yearId}/instructional-model/migrations`,
          )
          .send(body);
      expect(
        (
          await migrate(admin, running.id, {
            model: 'subject_based_schedule',
            reason: ' ',
          }).expect(422)
        ).body.error.message,
      ).toBe('Say why this cycle is moving to another model.');
      const res = await migrate(admin, running.id, {
        model: 'subject_based_schedule',
        reason: 'Senior pathways start this term',
      }).expect(201);
      expect(res.body).toMatchObject({
        fromModel: 'fixed_home_sections',
        toModel: 'subject_based_schedule',
        impact: {
          offerings: 0,
          offerings_by_roster: {},
          exceptions: 0,
          exception_rosters: {},
        },
      });
      const [event] = await auditEvents(
        app,
        'instructional_model.migrated',
        res.body.id,
      );
      expect(event.context).toMatchObject({
        from: 'fixed_home_sections',
        to: 'subject_based_schedule',
      });
      expect(
        (await model(admin, running.id).expect(200)).body.migrations,
      ).toHaveLength(1);
      expect(
        (
          await migrate(admin, running.id, {
            model: 'subject_based_schedule',
            reason: 'again',
          }).expect(422)
        ).body.error.message,
      ).toBe('2026–27 already teaches with: A timetable of separate subjects');
      expect(
        (
          await migrate(admin, future.id, {
            model: 'subject_based_schedule',
            reason: 'x',
          }).expect(422)
        ).body.error.message,
      ).toBe(
        '2027–28 has not started yet, so choose its model on the teaching setup form instead.',
      );
      const past = await createCalendar(
        admin,
        campus,
        calendarBody(2025),
        true,
      );
      expect(
        (
          await migrate(admin, past.id, {
            model: 'hybrid',
            reason: 'x',
          }).expect(422)
        ).body.error.message,
      ).toBe(
        '2025–26 is finished, so how it was taught cannot change. Reopen the cycle first if it was closed by mistake.',
      );
      // The history is append-only.
      await expect(
        dataSource.query(
          "UPDATE instructional_model_migrations SET reason = 'x' WHERE id = $1",
          [res.body.id],
        ),
      ).rejects.toThrow(/append-only/);
    });

    it('permissions: settings managers set, migrators migrate, organization campus managers do both', async () => {
      const teacher = await person(app, {
        memberOf: [campus],
        roles: [['teacher', campus]],
      });
      await model(teacher, future.id).expect(403);
      const migrator = await personWith(app, campus, [
        'migrate instructional model',
      ]);
      await model(migrator, future.id).expect(200);
      await migrator
        .as(campus)
        .put(`/api/v1/academic-years/${future.id}/instructional-model`)
        .send({ model: 'subject_based_schedule' })
        .expect(403);
      const campusManager = await person(app, { memberOf: [campus] });
      await makeOrganizationMember(app, campusManager.user, organization, [
        'read organization',
        'manage organization campuses',
      ]);
      await campusManager
        .as(campus)
        .put(`/api/v1/academic-years/${future.id}/instructional-model`)
        .send({ model: 'subject_based_schedule' })
        .expect(200);
      const other = await createSchool(app, organization);
      const otherAdmin = await campusAdmin(app, other);
      await model(otherAdmin, future.id)
        .set('X-School-Id', other.id)
        .expect(404);
    });

    it('rolls a year’s setup forward into a year that lacks it', async () => {
      const target = await createCalendar(admin, campus, calendarBody(2028));
      for (const p of target.periods) {
        await admin
          .as(campus)
          .delete(`/api/v1/academic-periods/${p.id}`)
          .expect(204);
      }
      const preview = await admin
        .as(campus)
        .get(
          `/api/v1/academic-years/${target.id}/roll-forward?sourceYearId=${running.id}`,
        )
        .expect(200);
      expect(preview.body.createCount).toBe(4);
      expect(preview.body.items[0]).toMatchObject({
        key: 'instructional_model',
        details: ['A timetable of separate subjects'],
        willCreate: true,
      });
      expect(preview.body.items[1].details[0]).toBe(
        'First term (Sep 1, 2028 – Dec 15, 2028)',
      );

      const run = await admin
        .as(campus)
        .post(`/api/v1/academic-years/${target.id}/roll-forward`)
        .send({ sourceYearId: running.id })
        .expect(200);
      expect(run.body).toEqual({
        instructionalModel: true,
        academicPeriods: 3,
      });
      const detail = await admin
        .as(campus)
        .get(`/api/v1/academic-years/${target.id}`)
        .expect(200);
      expect(
        detail.body.periods.map(
          (p: { name: string; startsOn: string; status: string }) => [
            p.name,
            p.startsOn,
            p.status,
          ],
        ),
      ).toEqual([
        ['First term', '2028-09-01', 'draft'],
        ['Second term', '2029-01-05', 'draft'],
        ['Third term', '2029-04-15', 'draft'],
      ]);
      expect(
        await auditEvents(app, 'academic_year.setup_rolled_forward', target.id),
      ).toHaveLength(1);
      const again = await admin
        .as(campus)
        .post(`/api/v1/academic-years/${target.id}/roll-forward`)
        .send({ sourceYearId: running.id })
        .expect(200);
      expect(again.body).toEqual({
        instructionalModel: false,
        academicPeriods: 0,
      });
      expect(
        await auditEvents(app, 'academic_year.setup_rolled_forward', target.id),
      ).toHaveLength(1);
      await admin
        .as(campus)
        .post(`/api/v1/academic-years/${target.id}/roll-forward`)
        .send({ sourceYearId: target.id })
        .expect(422);
    });
  });

  describe('setup checklists', () => {
    let campus: School;
    let admin: Person;

    beforeAll(async () => {
      campus = await createSchool(app, organization);
      admin = await campusAdmin(app, campus);
    });

    it('a new campus is in progress and cannot acknowledge', async () => {
      const res = await admin
        .as(campus)
        .get('/api/v1/school/setup')
        .expect(200);
      expect(res.body.progress.current).toBe('details');
      expect(res.body.items.map((i: { key: string }) => i.key)).toEqual([
        'school_details',
        'academic_year',
        'academic_periods',
        'instructional_model',
        'academic_levels',
        'cycle_sections',
        'course_offerings',
        'grading_scales',
        'staff_access',
        'student_records',
      ]);
      expect(res.body).toMatchObject({
        academicYearId: null,
        requiredRemaining: 7,
        next: 'school_details',
        phase: {
          key: 'daily-work-v1:academic-year-none',
          status: 'in_progress',
        },
        showReadyNotice: false,
      });
      const refused = await admin
        .as(campus)
        .post('/api/v1/school/setup/acknowledge')
        .expect(422);
      expect(refused.body.error.message).toBe(
        'The setup is not ready to acknowledge. Finish the required steps first.',
      );
      const teacher = await person(app, {
        memberOf: [campus],
        roles: [['teacher', campus]],
      });
      await teacher.as(campus).get('/api/v1/school/setup').expect(403);
    });

    it('becomes ready once every required item is done, then is acknowledged', async () => {
      // Classes, sections and subjects come with Stage 4; stand in for them.
      const setup = app.get(SchoolSetup);
      for (const key of [
        'academic_levels',
        'cycle_sections',
        'course_offerings',
      ] as const) {
        setup.registerCount(key, async (_manager, school) =>
          school.id === campus.id ? 2 : 0,
        );
      }
      await admin
        .as(campus)
        .patch('/api/v1/school')
        .send({
          address: '1 Broad Street',
          country: 'Nigeria',
          state: 'Lagos',
          city: 'Lagos',
          postalCode: '100001',
        })
        .expect(200);
      const year = await createCalendar(
        admin,
        campus,
        calendarBody(2026),
        true,
      );
      await person(app, { memberOf: [campus], roles: [['teacher', campus]] });

      const res = await admin
        .as(campus)
        .get('/api/v1/school/setup')
        .expect(200);
      expect(res.body).toMatchObject({
        academicYearId: year.id,
        requiredRemaining: 0,
        phase: { status: 'ready' },
        showReadyNotice: true,
      });
      expect(
        res.body.items.find((i: { key: string }) => i.key === 'staff_access'),
      ).toMatchObject({ complete: true });
      // A year that has started keeps its approach: nothing left to choose.
      expect(
        res.body.items.find(
          (i: { key: string }) => i.key === 'instructional_model',
        ),
      ).toMatchObject({
        complete: true,
      });

      const ack = await admin
        .as(campus)
        .post('/api/v1/school/setup/acknowledge')
        .expect(200);
      expect(ack.body.phase).toMatchObject({
        status: 'acknowledged',
        acknowledgedById: admin.user.id,
      });
      const [event] = await auditEvents(app, 'school_setup.acknowledged');
      expect(event.context).toEqual({
        phase_key: `daily-work-v1:academic-year-${year.id}`,
        academic_year_id: year.id,
      });

      const yearSetup = await admin
        .as(campus)
        .get(`/api/v1/academic-years/${year.id}/setup`)
        .expect(200);
      expect(
        yearSetup.body.steps.map((s: { value: string; complete: boolean }) => [
          s.value,
          s.complete,
        ]),
      ).toEqual([
        ['calendar', true],
        ['teaching', false],
        ['structure', true],
        ['subjects', true],
        ['review', true],
      ]);
      expect(yearSetup.body.current).toBe('teaching');
    });
  });

  describe('scheduled jobs', () => {
    let orgJ: Organization;
    let campus: School;
    let admin: Person;
    let current: CalendarYear;
    let next: CalendarYear;
    let stray: string;
    let idle: School;
    let idleYear: CalendarYear;
    let templateJ: string;
    const jobs = () => app.get(AcademicCalendarJobs);

    beforeAll(async () => {
      orgJ = await createOrganization(app, { name: 'Jobs Trust' });
      const ownerJ = await person(app);
      await makeOrganizationMember(app, ownerJ.user, orgJ);
      const template = await ownerJ
        .as()
        .post(`/api/v1/organizations/${orgJ.id}/calendar-templates`)
        .send(TEMPLATE)
        .expect(201);
      templateJ = template.body.id;
      campus = await createSchool(app, orgJ, { name: 'Jobs Campus' });
      admin = await campusAdmin(app, campus);
      await person(app, { memberOf: [campus], roles: [['teacher', campus]] });
      current = await createCalendar(admin, campus, calendarBody(2026), true);
      next = await createCalendar(admin, campus, calendarBody(2027), true);
      const past = await createCalendar(
        admin,
        campus,
        calendarBody(2025),
        true,
      );
      // A scheduled period inside a closed year: its open is refused.
      [{ id: stray }] = await dataSource.query(
        `INSERT INTO academic_periods (school_id, academic_year_id, name, type, position, starts_on, ends_on, status)
         VALUES ($1, $2, 'Stray', 'other', 9, '2026-06-01', '2026-06-30', 'scheduled') RETURNING id`,
        [campus.id, past.id],
      );
      // A campus of an organization with no template never auto-opens.
      const bare = await createOrganization(app);
      idle = await createSchool(app, bare);
      idleYear = await createCalendar(
        await campusAdmin(app, idle),
        idle,
        calendarBody(2026),
        true,
      );
    });

    // The jobs walk every campus in the database, so the checks below look
    // at the jobs campus (and the campus with no template) only.
    const ours = () =>
      mail.sent.filter((m) => m.subject.startsWith('Jobs Campus:'));
    const draftedFrom = async (startsOn: string) =>
      dataSource.query(
        'SELECT starts_on::text, ends_on::text, status FROM academic_years WHERE school_id = $1 AND starts_on = $2',
        [campus.id, startsOn],
      );

    it('opens scheduled periods on their start date, skips refused ones, and never closes', async () => {
      clock.set(new Date('2027-01-05T00:30:00Z'));
      const result = await jobs().openDue();
      expect(result.skipped).toBe(1);
      expect(result.opened).toBeGreaterThanOrEqual(1);
      expect(
        await statusOf(
          app,
          'academic_periods',
          period(current, 'Second term').id,
        ),
      ).toBe('open');
      expect(
        await statusOf(
          app,
          'academic_periods',
          period(current, 'First term').id,
        ),
      ).toBe('open');
      expect(
        await statusOf(
          app,
          'academic_periods',
          period(current, 'Third term').id,
        ),
      ).toBe('scheduled');
      expect(await statusOf(app, 'academic_periods', stray)).toBe('scheduled');
      expect(await statusOf(app, 'academic_years', next.id)).toBe('scheduled');
      expect(
        await statusOf(
          app,
          'academic_periods',
          period(idleYear, 'Second term').id,
        ),
      ).toBe('scheduled');
      expect(
        (await history(app, period(current, 'Second term').id)).at(-1),
      ).toMatchObject({
        from_status: 'scheduled',
        to_status: 'open',
        changed_by: null,
      });
      // Running it again in the same hour changes nothing more.
      expect((await jobs().openDue()).opened).toBe(0);
    });

    it('opens a year before its periods', async () => {
      clock.set(new Date('2027-09-01T00:30:00Z'));
      await jobs().openDue();
      expect(await statusOf(app, 'academic_years', next.id)).toBe('open');
      expect(
        await statusOf(app, 'academic_periods', period(next, 'First term').id),
      ).toBe('open');
      const [yearOpened] = await dataSource.query(
        "SELECT created_at FROM academic_period_status_changes WHERE period_id = $1 AND to_status = 'open'",
        [next.id],
      );
      const [periodOpened] = await dataSource.query(
        "SELECT created_at FROM academic_period_status_changes WHERE period_id = $1 AND to_status = 'open'",
        [period(next, 'First term').id],
      );
      expect(new Date(yearOpened.created_at).getTime()).toBeLessThan(
        new Date(periodOpened.created_at).getTime(),
      );
    });

    it('reminds the staff who can close periods, once per period and kind', async () => {
      clock.set(new Date('2027-03-17T07:15:00Z'));
      mail.sent.length = 0;
      await jobs().sendReminders();
      expect(ours().every((m) => m.to === admin.user.email)).toBe(true);
      expect(
        ours()
          .map((m) => m.subject)
          .sort(),
      ).toEqual([
        'Jobs Campus: First term calendar reminder',
        'Jobs Campus: Second term calendar reminder',
      ]);
      const ends = ours().find((m) => m.subject.includes('Second term'));
      expect(ends?.text).toContain(
        'Second term at Jobs Campus ends on Mar 31, 2027. Start the closure-readiness check now.',
      );
      const overdue = ours().find((m) => m.subject.includes('First term'));
      expect(overdue?.text).toContain(
        'First term at Jobs Campus ended on Dec 15, 2026 and is still open. Review its closure-readiness check.',
      );
      // The campus with no template gets nothing, though its first term is
      // overdue too.
      expect(
        mail.sent.filter((m) => m.subject.startsWith(`${idle.name}:`)),
      ).toEqual([]);
      // Each reminder goes once.
      expect(await jobs().sendReminders()).toBe(0);

      // remind_days_before 0 switches them off (the third term would start
      // in 14 days and the second would be overdue).
      await dataSource.query(
        'UPDATE calendar_templates SET remind_days_before = 0 WHERE id = $1',
        [templateJ],
      );
      clock.set(new Date('2027-04-01T07:15:00Z'));
      mail.sent.length = 0;
      await jobs().sendReminders();
      expect(ours()).toEqual([]);
    });

    it('drafts the next cycle once the latest ends within the window', async () => {
      clock.set(new Date('2028-06-01T01:00:00Z'));
      await jobs().generateUpcoming();
      expect(await draftedFrom('2028-08-01')).toEqual([]);
      clock.set(new Date('2028-06-20T01:00:00Z'));
      await jobs().generateUpcoming();
      expect(await draftedFrom('2028-08-01')).toEqual([
        { starts_on: '2028-08-01', ends_on: '2029-07-31', status: 'draft' },
      ]);
      await jobs().generateUpcoming();
      const [{ count }] = await dataSource.query(
        'SELECT count(*)::int AS count FROM academic_years WHERE school_id = $1',
        [campus.id],
      );
      expect(count).toBe(4);
    });
  });
});
