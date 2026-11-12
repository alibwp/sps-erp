import { Controller, Get, type INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ClosureReadiness } from '../src/academic/closure-readiness.service.js';
import {
  RequireAcademicPeriod,
  Working,
} from '../src/academic/academic-period.guard.js';
import type { WorkingPeriod } from '../src/academic/academic-period-context.service.js';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
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
  person,
} from './support/campus.js';
import { createTestApp } from './support/test-app.js';

// Routes that need a working period exist from later stages on.
@Controller('test-probe/working-period')
class WorkingPeriodProbe {
  @Get()
  @RequireAcademicPeriod()
  show(@Working() working: WorkingPeriod) {
    return {
      yearId: working.academicYear?.id,
      periodId: working.academicPeriod?.id,
      source: working.source,
    };
  }
}

const NOW = new Date('2026-11-10T12:00:00Z');

describe('Academic calendar (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const clock = new FixedClock(NOW);
  let organization: Organization;
  let schoolA: School;
  let adminA: Person;
  let teacherA: Person;

  beforeAll(async () => {
    app = await createTestApp({
      controllers: [WorkingPeriodProbe],
      overrides: [{ provide: Clock, useValue: clock }],
    });
    dataSource = app.get(DataSource);
    organization = await createOrganization(app);
    schoolA = await createSchool(app, organization);
    adminA = await campusAdmin(app, schoolA);
    teacherA = await person(app, {
      memberOf: [schoolA],
      roles: [['teacher', schoolA]],
    });
  });

  afterEach(() => clock.set(NOW));

  afterAll(async () => {
    await app.close();
  });

  describe('saving a calendar', () => {
    it('creates a draft year with its terms in date order', async () => {
      const body = calendarBody(2026);
      body.periods.reverse();
      const res = await adminA
        .as(schoolA)
        .post('/api/v1/academic-years')
        .send(body)
        .expect(201);
      expect(res.body).toMatchObject({
        name: '2026–27',
        startYear: 2026,
        stopYear: 2027,
        startsOn: '2026-09-01',
        endsOn: '2027-07-31',
        status: 'draft',
        isCampusDefault: false,
      });
      expect(
        res.body.periods.map(
          (p: { name: string; position: number; status: string }) => [
            p.name,
            p.position,
            p.status,
          ],
        ),
      ).toEqual([
        ['First term', 1, 'draft'],
        ['Second term', 2, 'draft'],
        ['Third term', 3, 'draft'],
      ]);
      const [event] = await auditEvents(
        app,
        'academic_calendar.saved',
        res.body.id,
      );
      expect(event).toMatchObject({
        actorId: adminA.user.id,
        schoolId: schoolA.id,
        context: {
          created: true,
          starts_on: '2026-09-01',
          ends_on: '2027-07-31',
          period_count: 3,
        },
      });
    });

    it.each([
      [
        'overlapping terms',
        (b: ReturnType<typeof calendarBody>) =>
          (b.periods[1].startsOn = '2030-12-10'),
        'Second term overlaps First term.',
      ],
      [
        'a term outside the year',
        (b: ReturnType<typeof calendarBody>) =>
          (b.periods[2].endsOn = '2031-08-31'),
        'Third term must sit inside the school calendar dates.',
      ],
      [
        'a sub-period type at the top level',
        (b: ReturnType<typeof calendarBody>) =>
          (b.periods[0].type = 'exam_window'),
        'A school calendar can only use terms, semesters, trimesters, quarters, or custom reporting periods.',
      ],
      [
        'a term ending before it starts',
        (b: ReturnType<typeof calendarBody>) =>
          (b.periods[0].endsOn = '2030-08-31'),
        'First term cannot end before it starts.',
      ],
    ])('refuses %s', async (_case, change, message) => {
      const body = calendarBody(2030);
      change(body);
      const res = await adminA
        .as(schoolA)
        .post('/api/v1/academic-years')
        .send(body)
        .expect(422);
      expect(res.body.error.message).toBe(message);
    });

    it('refuses a year overlapping another year of the campus', async () => {
      const res = await adminA
        .as(schoolA)
        .post('/api/v1/academic-years')
        .send({
          ...calendarBody(2026),
          startsOn: '2027-07-01',
          endsOn: '2028-06-30',
          periods: [],
        })
        .expect(400);
      expect(res.body.error.fields.periods).toBeDefined();
      const overlap = calendarBody(2027);
      overlap.startsOn = '2027-07-01';
      overlap.periods[0].startsOn = '2027-07-01';
      const refused = await adminA
        .as(schoolA)
        .post('/api/v1/academic-years')
        .send(overlap)
        .expect(422);
      expect(refused.body.error.message).toBe(
        'This calendar overlaps 2026–27.',
      );
    });

    it('rewrites a draft: kept periods by id, others removed', async () => {
      const draft = await createCalendar(adminA, schoolA, calendarBody(2028));
      const body = calendarBody(2028);
      const res = await adminA
        .as(schoolA)
        .put(`/api/v1/academic-years/${draft.id}`)
        .send({
          ...body,
          periods: [
            {
              ...body.periods[0],
              id: period(draft, 'First term').id,
              name: 'Autumn',
            },
            {
              name: 'Spring',
              type: 'semester',
              startsOn: '2029-01-05',
              endsOn: '2029-07-31',
            },
          ],
        })
        .expect(200);
      expect(res.body.periods.map((p: { name: string }) => p.name)).toEqual([
        'Autumn',
        'Spring',
      ]);
      expect(res.body.periods[0].id).toBe(period(draft, 'First term').id);
      const [{ n }] = await dataSource.query(
        'SELECT count(*)::int AS n FROM academic_periods WHERE academic_year_id = $1',
        [draft.id],
      );
      expect(n).toBe(2);
    });

    it('needs the permission (403) and the campus (404)', async () => {
      await teacherA
        .as(schoolA)
        .post('/api/v1/academic-years')
        .send(calendarBody(2031))
        .expect(403);
      const other = await createSchool(app, organization);
      const adminOther = await campusAdmin(app, other);
      const theirs = await createCalendar(
        adminOther,
        other,
        calendarBody(2026),
      );
      const a = adminA.as(schoolA);
      await a.get(`/api/v1/academic-years/${theirs.id}`).expect(404);
      await a
        .put(`/api/v1/academic-years/${theirs.id}`)
        .send(calendarBody(2026))
        .expect(404);
      await a.post(`/api/v1/academic-years/${theirs.id}/publish`).expect(404);
      await a.delete(`/api/v1/academic-years/${theirs.id}`).expect(404);
      await a
        .get(`/api/v1/academic-periods/${period(theirs, 'First term').id}`)
        .expect(404);
    });
  });

  describe('publishing (frozen clock: 10 November 2026)', () => {
    it('sets each status from its dates and makes the year the campus default', async () => {
      const [{ id }] = await dataSource.query(
        'SELECT id FROM academic_years WHERE school_id = $1 AND start_year = 2026',
        [schoolA.id],
      );
      const res = await adminA
        .as(schoolA)
        .post(`/api/v1/academic-years/${id}/publish`)
        .expect(200);
      expect(res.body).toMatchObject({ status: 'open', isCampusDefault: true });
      expect(res.body.periods.map((p: { status: string }) => p.status)).toEqual(
        ['open', 'scheduled', 'scheduled'],
      );
      const [school] = await dataSource.query(
        'SELECT academic_year_id, academic_period_id FROM schools WHERE id = $1',
        [schoolA.id],
      );
      expect(school).toEqual({
        academic_year_id: id,
        academic_period_id: period(res.body, 'First term').id,
      });
      expect(await history(app, id)).toEqual([
        expect.objectContaining({
          from_status: 'draft',
          to_status: 'open',
          changed_by: adminA.user.id,
        }),
      ]);
      expect(
        await auditEvents(app, 'academic_calendar.published', id),
      ).toHaveLength(1);

      const again = await adminA
        .as(schoolA)
        .post(`/api/v1/academic-years/${id}/publish`)
        .expect(422);
      expect(again.body.error.message).toBe(
        'Only a draft calendar can be published.',
      );
    });

    it('a finished year is published closed with its periods, and still becomes the default', async () => {
      const past = await createCalendar(
        adminA,
        schoolA,
        calendarBody(2025),
        true,
      );
      expect(past.status).toBe('closed');
      expect(past.periods.map((p) => p.status)).toEqual([
        'closed',
        'closed',
        'closed',
      ]);
      const [school] = await dataSource.query(
        'SELECT academic_year_id FROM schools WHERE id = $1',
        [schoolA.id],
      );
      expect(school.academic_year_id).toBe(past.id);
    });

    it('uses the campus’s own today', async () => {
      // 20:00 UTC on 10 November is already 11 November in Karachi.
      clock.set(new Date('2026-11-10T20:00:00Z'));
      const body = {
        startsOn: '2026-09-01',
        endsOn: '2027-07-31',
        periods: [
          {
            name: 'Autumn',
            type: 'term',
            startsOn: '2026-09-01',
            endsOn: '2026-11-10',
          },
          {
            name: 'Winter',
            type: 'term',
            startsOn: '2026-11-11',
            endsOn: '2027-03-31',
          },
        ],
      };
      const karachi = await createSchool(app, organization, {
        timezone: 'Asia/Karachi',
      });
      const utc = await createSchool(app, organization);
      const inKarachi = await createCalendar(
        await campusAdmin(app, karachi),
        karachi,
        body,
        true,
      );
      const inUtc = await createCalendar(
        await campusAdmin(app, utc),
        utc,
        body,
        true,
      );
      expect(inKarachi.periods.map((p) => p.status)).toEqual([
        'closed',
        'open',
      ]);
      expect(inUtc.periods.map((p) => p.status)).toEqual(['open', 'scheduled']);
    });
  });

  describe('status changes', () => {
    let year: CalendarYear;
    let schoolS: School;
    let adminS: Person;

    beforeAll(async () => {
      schoolS = await createSchool(app, organization);
      adminS = await campusAdmin(app, schoolS);
      year = await createCalendar(adminS, schoolS, calendarBody(2026), true);
    });

    const move = (
      who: Person,
      kind: 'academic-years' | 'academic-periods',
      id: string,
      body: object,
    ) =>
      who.as(schoolS).post(`/api/v1/${kind}/${id}/status-changes`).send(body);

    it('refuses every move outside the table with 422', async () => {
      const res = await move(adminS, 'academic-years', year.id, {
        to: 'archived',
      }).expect(422);
      expect(res.body.error.message).toBe(
        'An academic period cannot move from open to archived.',
      );
      const second = period(year, 'Second term').id;
      const scheduled = await move(adminS, 'academic-periods', second, {
        to: 'closing',
      }).expect(422);
      expect(scheduled.body.error.message).toBe(
        'An academic period cannot move from scheduled to closing.',
      );
      await move(adminS, 'academic-periods', second, { to: 'paused' }).expect(
        400,
      );
    });

    it('asks for the permission the move needs', async () => {
      const first = period(year, 'First term').id;
      const editor = await personWith(app, schoolS, ['update academic period']);
      const closer = await personWith(app, schoolS, ['close academic period']);
      const reopener = await personWith(app, schoolS, [
        'reopen academic period',
      ]);

      await move(editor, 'academic-periods', first, { to: 'closed' }).expect(
        403,
      );
      await move(closer, 'academic-periods', first, { to: 'closed' }).expect(
        200,
      );
      expect(await statusOf(app, 'academic_periods', first)).toBe('closed');
      const [, closed] = await history(app, first);
      expect(closed).toMatchObject({
        from_status: 'open',
        to_status: 'closed',
        changed_by: closer.user.id,
        checklist: [],
      });
      const [event] = (
        await auditEvents(app, 'academic_period.status_changed', first)
      ).slice(-1);
      expect(event).toMatchObject({
        actorId: closer.user.id,
        schoolId: schoolS.id,
        context: { from: 'open', to: 'closed', reason: null },
      });

      await move(editor, 'academic-periods', first, {
        to: 'open',
        reason: 'Late marks',
      }).expect(403);
      await move(closer, 'academic-periods', first, {
        to: 'open',
        reason: 'Late marks',
      }).expect(403);
      const noReason = await move(reopener, 'academic-periods', first, {
        to: 'open',
      }).expect(422);
      expect(noReason.body.error.message).toBe(
        'Say why this period is being reopened.',
      );
      await move(reopener, 'academic-periods', first, {
        to: 'open',
        reason: 'Late marks',
      }).expect(200);
      expect((await history(app, first)).at(-1)).toMatchObject({
        to_status: 'open',
        reason: 'Late marks',
      });

      const second = period(year, 'Second term').id;
      await move(editor, 'academic-periods', second, { to: 'draft' }).expect(
        200,
      );
      await move(editor, 'academic-periods', second, {
        to: 'scheduled',
      }).expect(200);
      // Asking for the current state again changes nothing.
      const before = (await history(app, second)).length;
      await move(editor, 'academic-periods', second, {
        to: 'scheduled',
      }).expect(200);
      expect(await history(app, second)).toHaveLength(before);
    });

    it('closing a year closes its periods; a period of a closed year cannot reopen', async () => {
      const res = await move(adminS, 'academic-years', year.id, {
        to: 'closed',
      }).expect(200);
      expect(res.body.status).toBe('closed');
      expect(res.body.periods.map((p: { status: string }) => p.status)).toEqual(
        ['closed', 'closed', 'closed'],
      );
      const [yearClose] = (await history(app, year.id)).slice(-1);
      expect(yearClose.checklist).toEqual([
        {
          key: 'open_periods',
          summary:
            'Closing this cycle will also close the periods still open in it.',
          count: 1,
          blocking: false,
        },
      ]);
      for (const p of res.body.periods) {
        expect((await history(app, p.id)).at(-1)).toMatchObject({
          to_status: 'closed',
        });
      }

      const second = period(year, 'Second term').id;
      const refused = await move(adminS, 'academic-periods', second, {
        to: 'open',
        reason: 'Mistake',
      }).expect(422);
      expect(refused.body.error.message).toBe(
        'Reopen the academic year before you reopen this period.',
      );

      await move(adminS, 'academic-years', year.id, {
        to: 'open',
        reason: 'Closed too early',
      }).expect(200);
      expect(await statusOf(app, 'academic_periods', second)).toBe('closed');
      await move(adminS, 'academic-periods', second, {
        to: 'open',
        reason: 'Mistake',
      }).expect(200);
    });

    it('another campus’s year or period is 404; a teacher gets 403', async () => {
      await move(adminA, 'academic-years', year.id, { to: 'closing' })
        .set('X-School-Id', schoolA.id)
        .expect(404);
      const t = await person(app, {
        memberOf: [schoolS],
        roles: [['teacher', schoolS]],
      });
      await move(t, 'academic-years', year.id, { to: 'closing' }).expect(403);
      await t
        .as(schoolS)
        .get(`/api/v1/academic-years/${year.id}/status-changes`)
        .expect(403);
      const listed = await adminS
        .as(schoolS)
        .get(`/api/v1/academic-years/${year.id}/status-changes`)
        .expect(200);
      expect(listed.body.map((h: { toStatus: string }) => h.toStatus)).toEqual([
        'open',
        'closed',
        'open',
      ]);
    });
  });

  describe('closure readiness', () => {
    let schoolR: School;
    let adminR: Person;
    let year: CalendarYear;
    let blocked: string;

    beforeAll(async () => {
      // A blocking check like Stage 10's incomplete grade entries.
      app.get(ClosureReadiness).register(async (_manager, p) => ({
        key: 'ungraded_entries',
        summary: 'Grade entries are still incomplete.',
        count: p.name === 'Blocked term' ? 3 : 0,
        blocking: true,
      }));
      schoolR = await createSchool(app, organization);
      adminR = await campusAdmin(app, schoolR);
      const body = calendarBody(2026);
      body.periods[2].name = 'Blocked term';
      year = await createCalendar(adminR, schoolR, body, true);
      blocked = period(year, 'Blocked term').id;
    });

    it('reports the findings and refuses a close with a blocking one unless forced', async () => {
      const readiness = await adminR
        .as(schoolR)
        .get(`/api/v1/academic-periods/${blocked}/closure-readiness`)
        .expect(200);
      expect(readiness.body).toEqual({
        ready: false,
        findings: [
          {
            key: 'ungraded_entries',
            summary: 'Grade entries are still incomplete.',
            count: 3,
            blocking: true,
          },
        ],
      });
      const refused = await adminR
        .as(schoolR)
        .post(`/api/v1/academic-periods/${blocked}/status-changes`)
        .send({ to: 'closed' })
        .expect(422);
      expect(refused.body.error.message).toBe(
        'This period is not ready to close. Grade entries are still incomplete.',
      );
      // force needs the close permission like any close.
      const editor = await personWith(app, schoolR, ['update academic period']);
      await editor
        .as(schoolR)
        .post(`/api/v1/academic-periods/${blocked}/status-changes`)
        .send({ to: 'closed', force: true })
        .expect(403);
      await adminR
        .as(schoolR)
        .post(`/api/v1/academic-periods/${blocked}/status-changes`)
        .send({ to: 'closed', force: true })
        .expect(200);
      expect((await history(app, blocked)).at(-1)).toMatchObject({
        to_status: 'closed',
        checklist: [
          expect.objectContaining({
            key: 'ungraded_entries',
            count: 3,
            blocking: true,
          }),
        ],
      });
    });

    it('a year adds up its periods’ findings', async () => {
      const res = await adminR
        .as(schoolR)
        .get(`/api/v1/academic-years/${year.id}/closure-readiness`)
        .expect(200);
      expect(res.body.ready).toBe(false);
      expect(
        res.body.findings.map((f: { key: string; count: number }) => [
          f.key,
          f.count,
        ]),
      ).toEqual([
        ['open_periods', 1],
        ['ungraded_entries', 3],
      ]);
      await adminR
        .as(schoolR)
        .post(`/api/v1/academic-years/${year.id}/status-changes`)
        .send({ to: 'closed' })
        .expect(422);
      await adminR
        .as(schoolR)
        .post(`/api/v1/academic-years/${year.id}/status-changes`)
        .send({ to: 'closed', force: true })
        .expect(200);
      const t = await person(app, {
        memberOf: [schoolR],
        roles: [['teacher', schoolR]],
      });
      await t
        .as(schoolR)
        .get(`/api/v1/academic-years/${year.id}/closure-readiness`)
        .expect(403);
    });
  });

  describe('dates and sub-periods', () => {
    let schoolD: School;
    let adminD: Person;
    let year: CalendarYear;

    beforeAll(async () => {
      schoolD = await createSchool(app, organization);
      adminD = await campusAdmin(app, schoolD);
      year = await createCalendar(adminD, schoolD, calendarBody(2026), true);
    });

    const dates = (id: string, body: object, kind = 'academic-periods') =>
      adminD.as(schoolD).put(`/api/v1/${kind}/${id}/dates`).send(body);

    it('changes dates with the reference rules', async () => {
      const first = period(year, 'First term').id;
      const second = period(year, 'Second term').id;
      const third = period(year, 'Third term').id;

      await dates(second, {
        startsOn: '2027-01-06',
        endsOn: '2027-03-31',
      }).expect(200);
      const [event] = await auditEvents(
        app,
        'academic_period.dates_changed',
        second,
      );
      expect(event.context).toEqual({
        from: { starts_on: '2027-01-05', ends_on: '2027-03-31' },
        to: { starts_on: '2027-01-06', ends_on: '2027-03-31' },
        reason: null,
      });

      const inUse = await dates(first, {
        startsOn: '2026-09-01',
        endsOn: '2026-12-18',
      }).expect(422);
      expect(inUse.body.error.message).toBe(
        'Say why the dates of a period already in use are changing.',
      );
      await dates(first, {
        startsOn: '2026-09-01',
        endsOn: '2026-12-18',
        reason: 'Snow days',
      }).expect(200);

      const overlap = await dates(second, {
        startsOn: '2026-12-10',
        endsOn: '2027-03-31',
      }).expect(422);
      expect(overlap.body.error.message).toBe(
        'Second term overlaps First term.',
      );
      const outside = await dates(third, {
        startsOn: '2027-04-15',
        endsOn: '2027-08-15',
      }).expect(422);
      expect(outside.body.error.message).toBe(
        'This period must run inside 2026-09-01 to 2027-07-31.',
      );
      const backwards = await dates(third, {
        startsOn: '2027-05-01',
        endsOn: '2027-04-30',
      }).expect(422);
      expect(backwards.body.error.message).toBe(
        'A period cannot end before it starts.',
      );
      const shrink = await dates(
        year.id,
        {
          startsOn: '2026-09-01',
          endsOn: '2027-06-30',
          reason: 'Shorter year',
        },
        'academic-years',
      ).expect(422);
      expect(shrink.body.error.message).toBe(
        'Third term would fall outside the new dates.',
      );

      await adminD
        .as(schoolD)
        .post(`/api/v1/academic-periods/${third}/status-changes`)
        .send({ to: 'closed' })
        .expect(200);
      const closed = await dates(third, {
        startsOn: '2027-04-16',
        endsOn: '2027-07-31',
      }).expect(422);
      expect(closed.body.error.message).toBe(
        'A closed period keeps its dates. Reopen it before you change them.',
      );
    });

    it('adds sub-periods inside a top-level period', async () => {
      const second = period(year, 'Second term').id;
      const create = (body: object) =>
        adminD
          .as(schoolD)
          .post(`/api/v1/academic-years/${year.id}/periods`)
          .send(body);
      const exams = await create({
        name: 'Mid-term exams',
        type: 'exam_window',
        startsOn: '2027-02-10',
        endsOn: '2027-02-14',
        parentId: second,
      }).expect(201);
      expect(exams.body).toMatchObject({
        parentId: second,
        status: 'scheduled',
        position: 1,
      });
      expect(await history(app, exams.body.id)).toEqual([
        expect.objectContaining({
          from_status: 'draft',
          to_status: 'scheduled',
        }),
      ]);

      const cases: Array<[object, string]> = [
        [
          {
            name: 'Too late',
            type: 'holiday',
            startsOn: '2027-03-30',
            endsOn: '2027-04-02',
            parentId: second,
          },
          'This period must run inside 2027-01-06 to 2027-03-31.',
        ],
        [
          {
            name: 'Nested term',
            type: 'term',
            startsOn: '2027-02-01',
            endsOn: '2027-02-02',
            parentId: second,
          },
          'A period inside another can only be an exam window, a holiday, or a reporting period.',
        ],
        [
          {
            name: 'Loose holiday',
            type: 'holiday',
            startsOn: '2027-04-05',
            endsOn: '2027-04-10',
          },
          'A school calendar can only use terms, semesters, trimesters, quarters, or custom reporting periods.',
        ],
        [
          {
            name: 'Clash',
            type: 'holiday',
            startsOn: '2027-02-14',
            endsOn: '2027-02-16',
            parentId: second,
          },
          'Clash overlaps Mid-term exams.',
        ],
        [
          {
            name: 'Late window',
            type: 'exam_window',
            startsOn: '2027-06-01',
            endsOn: '2027-06-05',
            parentId: period(year, 'Third term').id,
          },
          'Reopen Third term before you add a period to it.',
        ],
      ];
      for (const [body, message] of cases) {
        const res = await create(body).expect(422);
        expect(res.body.error.message).toBe(message);
      }

      const tree = await adminD
        .as(schoolD)
        .get(`/api/v1/academic-years/${year.id}`)
        .expect(200);
      expect(period(tree.body, 'Second term').children).toEqual([
        expect.objectContaining({
          name: 'Mid-term exams',
          type: 'exam_window',
        }),
      ]);
      const shrink = await dates(second, {
        startsOn: '2027-01-06',
        endsOn: '2027-02-12',
      }).expect(422);
      expect(shrink.body.error.message).toBe(
        'Mid-term exams would fall outside the new dates.',
      );
    });

    it('deletes drafts only', async () => {
      const draft = await createCalendar(adminD, schoolD, calendarBody(2030));
      await adminD
        .as(schoolD)
        .delete(`/api/v1/academic-periods/${period(draft, 'Second term').id}`)
        .expect(204);
      await adminD
        .as(schoolD)
        .delete(`/api/v1/academic-years/${draft.id}`)
        .expect(204);
      const refused = await adminD
        .as(schoolD)
        .delete(`/api/v1/academic-years/${year.id}`)
        .expect(422);
      expect(refused.body.error.message).toBe(
        'Only a draft calendar that was never published can be deleted. Archive it instead.',
      );
      await adminD
        .as(schoolD)
        .delete(`/api/v1/academic-periods/${period(year, 'First term').id}`)
        .expect(422);
    });
  });

  describe('working period', () => {
    let schoolC: School;
    let adminC: Person;
    let teacher: Person;
    let current: CalendarYear;
    let past: CalendarYear;
    const probe = (who: Person, headers: Record<string, string> = {}) => {
      const test = who.as(schoolC).get('/api/v1/test-probe/working-period');
      for (const [name, value] of Object.entries(headers))
        test.set(name, value);
      return test;
    };

    beforeAll(async () => {
      schoolC = await createSchool(app, organization);
      adminC = await campusAdmin(app, schoolC);
      teacher = await person(app, {
        memberOf: [schoolC],
        roles: [['teacher', schoolC]],
      });
    });

    it('answers 409 academic_period_required while the campus has no year', async () => {
      const res = await probe(teacher).expect(409);
      expect(res.body.error).toEqual({
        code: 'academic_period_required',
        message:
          'No academic period is set for this request. Set a working academic period first.',
      });
      const context = await teacher
        .as(schoolC)
        .get('/api/v1/me/context')
        .expect(200);
      expect(context.body.working).toEqual({
        schoolId: schoolC.id,
        academicYear: null,
        academicPeriod: null,
        source: null,
        periodError: null,
      });
    });

    it('follows the header, then the saved choice, then the calendar, then the campus default', async () => {
      current = await createCalendar(adminC, schoolC, calendarBody(2026), true);
      const first = period(current, 'First term').id;
      const second = period(current, 'Second term').id;
      const third = period(current, 'Third term').id;

      expect((await probe(teacher).expect(200)).body).toEqual({
        yearId: current.id,
        periodId: first,
        source: 'calendar',
      });
      expect(
        (await probe(teacher, { 'X-Academic-Period-Id': second }).expect(200))
          .body,
      ).toMatchObject({
        periodId: second,
        source: 'header',
      });
      await probe(teacher, { 'X-Academic-Period-Id': 'nope' }).expect(400);
      await probe(teacher, {
        'X-Academic-Period-Id': '00000000-0000-4000-8000-000000000000',
      }).expect(404);

      await teacher
        .as(schoolC)
        .put('/api/v1/me/context')
        .send({ academicPeriodId: third })
        .expect(200);
      expect((await probe(teacher).expect(200)).body).toMatchObject({
        periodId: third,
        source: 'preference',
      });
      const context = await teacher
        .as(schoolC)
        .get('/api/v1/me/context')
        .expect(200);
      expect(context.body.working).toMatchObject({
        academicYear: { id: current.id, name: '2026–27' },
        academicPeriod: { id: third, name: 'Third term' },
        source: 'preference',
        periodError: null,
      });

      // Another year, then back: the earlier choice in a year is kept.
      past = await createCalendar(adminC, schoolC, calendarBody(2025), true);
      await teacher
        .as(schoolC)
        .put('/api/v1/me/context')
        .send({ academicYearId: past.id })
        .expect(200);
      expect((await probe(teacher).expect(200)).body).toMatchObject({
        yearId: past.id,
        periodId: period(past, 'First term').id,
        source: 'preference',
      });
      await teacher
        .as(schoolC)
        .put('/api/v1/me/context')
        .send({ academicYearId: current.id })
        .expect(200);
      expect((await probe(teacher).expect(200)).body).toMatchObject({
        periodId: third,
      });

      // Someone with no choice, on a day no period covers: the campus default
      // (the last calendar published: 2025–26 and its first term).
      clock.set(new Date('2026-12-20T12:00:00Z'));
      const newcomer = await person(app, { memberOf: [schoolC] });
      expect((await probe(newcomer).expect(200)).body).toEqual({
        yearId: past.id,
        periodId: period(past, 'First term').id,
        source: 'campus_default',
      });
    });

    it('PUT /me/context refuses what the reference refuses', async () => {
      const put = (who: Person, body: object) =>
        who.as(schoolC).put('/api/v1/me/context').send(body);
      const draft = await createCalendar(adminC, schoolC, calendarBody(2027));
      expect(
        (await put(teacher, { academicYearId: draft.id }).expect(422)).body
          .error.message,
      ).toBe(
        'Publish the school calendar before making it the working calendar.',
      );
      expect(
        (
          await put(teacher, {
            academicPeriodId: period(past, 'Second term').id,
          }).expect(422)
        ).body.error.message,
      ).toBe('That academic period is not in your working academic year.');
      const window = await adminC
        .as(schoolC)
        .post(`/api/v1/academic-years/${current.id}/periods`)
        .send({
          name: 'Mock exams',
          type: 'exam_window',
          startsOn: '2027-02-01',
          endsOn: '2027-02-05',
          parentId: period(current, 'Second term').id,
        })
        .expect(201);
      expect(
        (await put(teacher, { academicPeriodId: window.body.id }).expect(422))
          .body.error.message,
      ).toBe('Choose a top-level reporting period as your working period.');
      await probe(teacher, { 'X-Academic-Period-Id': window.body.id }).expect(
        404,
      );
      await put(teacher, {}).expect(400);
      const reader = await personWith(app, schoolC, ['read academic year']);
      await put(reader, {
        academicPeriodId: period(current, 'First term').id,
      }).expect(403);
      const yearOnly = await personWith(app, schoolC, ['set academic year']);
      await put(yearOnly, {
        academicPeriodId: period(current, 'First term').id,
      }).expect(403);
      await put(yearOnly, { academicYearId: current.id }).expect(200);
    });

    it('two top-level periods covering today stop it with 409, whatever was chosen', async () => {
      const [{ id: extra }] = await dataSource.query(
        `INSERT INTO academic_periods (school_id, academic_year_id, name, type, position, starts_on, ends_on, status)
         VALUES ($1, $2, 'Overlapping term', 'term', 9, '2026-11-01', '2026-11-30', 'open') RETURNING id`,
        [schoolC.id, current.id],
      );
      try {
        const message =
          'The calendar has overlapping reporting periods: First term, Overlapping term. Fix their dates before continuing.';
        const res = await probe(teacher).expect(409);
        expect(res.body.error).toEqual({
          code: 'academic_periods_overlap',
          message,
        });
        await probe(teacher, {
          'X-Academic-Period-Id': period(current, 'Second term').id,
        }).expect(409);
        const context = await teacher
          .as(schoolC)
          .get('/api/v1/me/context')
          .expect(200);
        expect(context.body.working).toMatchObject({
          academicPeriod: null,
          periodError: message,
        });
        const put = await teacher
          .as(schoolC)
          .put('/api/v1/me/context')
          .send({ academicPeriodId: period(current, 'Second term').id })
          .expect(422);
        expect(put.body.error.message).toBe(message);
      } finally {
        await dataSource.query('DELETE FROM academic_periods WHERE id = $1', [
          extra,
        ]);
      }
    });
  });
});
