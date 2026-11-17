import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
import { MailService } from '../src/mail/mail.service.js';
import type { Organization } from '../src/organizations/entities/organization.entity.js';
import type { School } from '../src/organizations/entities/school.entity.js';
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
  makeOrganizationMember,
  person,
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

describe('Cohorts and programmes (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const clock = new FixedClock(NOW);
  const mail = fakeMail();
  let organization: Organization;
  let north: School;
  let south: School;
  let admin: Person;
  let northYearId: string;
  let northSection: { id: string };
  let southSection: { id: string };
  let counter = 0;

  const refusal = (res: { body: { error: { message: string } } }) =>
    res.body.error.message;
  const learner = () => admit(admin, north, northSection.id);
  const name = (prefix: string) => {
    counter += 1;
    return `${prefix} ${counter}`;
  };

  const newCohort = (body: Record<string, unknown> = {}, as = admin) =>
    as
      .as(north)
      .post('/api/v1/cohorts')
      .send({ name: name('Group'), type: 'club', ...body });
  const join = (cohortId: string, studentId: string, body: object = {}) =>
    admin
      .as(north)
      .post(`/api/v1/cohorts/${cohortId}/members`)
      .send({ studentId, ...body });

  const newProgram = (body: Record<string, unknown> = {}) =>
    admin
      .as(north)
      .post('/api/v1/programs')
      .send({ name: name('Programme'), type: 'club', ...body });
  const place = (programId: string, studentId: string) =>
    admin
      .as(north)
      .post(`/api/v1/programs/${programId}/places`)
      .send({ studentId });
  const move = (
    programId: string,
    placeId: string,
    status: string,
    seen: string,
  ) =>
    admin
      .as(north)
      .post(`/api/v1/programs/${programId}/places/${placeId}/status-changes`)
      .send({ status, seen });

  const places = (studentId: string) =>
    dataSource.query(
      `SELECT program_id, status, note FROM program_participations
        WHERE student_record_id = $1 ORDER BY created_at`,
      [studentId],
    );
  const memberships = (studentId: string) =>
    dataSource.query(
      `SELECT cohort_id, joined_on::text AS joined_on, left_on::text AS left_on FROM cohort_members
        WHERE student_record_id = $1 ORDER BY created_at`,
      [studentId],
    );

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: MailService, useValue: mail.service },
      ],
    });
    dataSource = app.get(DataSource);
    organization = await createOrganization(app);
    north = await createSchool(app, organization, { name: 'North Campus' });
    south = await createSchool(app, organization, { name: 'South Campus' });
    const northAdmin = await campusAdmin(app, north);
    const southAdmin = await campusAdmin(app, south);
    northYearId = (
      await createCalendar(northAdmin, north, calendarBody(2026), true)
    ).id;
    northSection = await activeSection(
      northAdmin,
      north,
      northYearId,
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
    admin = await campusAdmin(app, north);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('restricted cohorts', () => {
    it('a watchlist is always restricted, and not found without "read restricted cohort"', async () => {
      const watch = await newCohort({ type: 'watchlist' }).expect(201);
      expect(watch.body).toMatchObject({
        type: 'watchlist',
        isRestricted: true,
      });
      // The campus admin made it, yet does not hold "read restricted cohort".
      await admin.as(north).get(`/api/v1/cohorts/${watch.body.id}`).expect(404);
      await admin
        .as(north)
        .get(`/api/v1/cohorts/${watch.body.id}/members`)
        .expect(404);
      const child = await learner();
      await join(watch.body.id, child.id).expect(404);
      const list = await admin.as(north).get('/api/v1/cohorts').expect(200);
      expect(list.body.map((c: { id: string }) => c.id)).not.toContain(
        watch.body.id,
      );

      const reader = await personWith(app, north, [
        'read cohort',
        'read restricted cohort',
        'update cohort',
      ]);
      await reader
        .as(north)
        .get(`/api/v1/cohorts/${watch.body.id}`)
        .expect(200);
      const seen = await reader.as(north).get('/api/v1/cohorts').expect(200);
      expect(seen.body.map((c: { id: string }) => c.id)).toContain(
        watch.body.id,
      );
      const open = await reader
        .as(north)
        .patch(`/api/v1/cohorts/${watch.body.id}`)
        .send({ isRestricted: false })
        .expect(422);
      expect(refusal(open)).toBe('A watchlist is always restricted.');
    });

    it('only a reader of restricted cohorts sets or clears the flag', async () => {
      await newCohort({ isRestricted: true }).expect(403);
      const plain = await newCohort().expect(201);
      await admin
        .as(north)
        .patch(`/api/v1/cohorts/${plain.body.id}`)
        .send({ isRestricted: true })
        .expect(403);

      const reader = await personWith(app, north, [
        'read cohort',
        'read restricted cohort',
        'create cohort',
        'update cohort',
      ]);
      const hidden = await newCohort({ isRestricted: true }, reader).expect(
        201,
      );
      expect(hidden.body.isRestricted).toBe(true);
      await admin
        .as(north)
        .get(`/api/v1/cohorts/${hidden.body.id}`)
        .expect(404);
      await reader
        .as(north)
        .patch(`/api/v1/cohorts/${hidden.body.id}`)
        .send({ isRestricted: false })
        .expect(200);
      await admin
        .as(north)
        .get(`/api/v1/cohorts/${hidden.body.id}`)
        .expect(200);

      const plainReader = await personWith(app, north, ['read cohort']);
      await plainReader
        .as(north)
        .get(`/api/v1/cohorts/${plain.body.id}`)
        .expect(200);
      const nobody = await person(app, { memberOf: [north] });
      await nobody
        .as(north)
        .get(`/api/v1/cohorts/${plain.body.id}`)
        .expect(403);
    });

    it('names are unique here ignoring case, and the school year defaults to the working one', async () => {
      const first = await newCohort({ name: 'Year 2030 leavers' }).expect(201);
      expect(first.body.academicYearId).toBe(northYearId);
      const taken = await newCohort({ name: 'year 2030 LEAVERS' }).expect(422);
      expect(refusal(taken)).toBe(
        'This school already has a group with that name.',
      );
      const none = await newCohort({ academicYearId: null }).expect(201);
      expect(none.body.academicYearId).toBeNull();
    });
  });

  describe('memberships', () => {
    it('only learners attending this campus join, never on a day ahead, never an inactive cohort', async () => {
      const cohort = (await newCohort().expect(201)).body;
      const child = await learner();
      const first = await join(cohort.id, child.id).expect(201);
      const again = await join(cohort.id, child.id).expect(201);
      expect(again.body.id).toBe(first.body.id);

      expect(
        refusal(
          await join(cohort.id, (await learner()).id, {
            joinedOn: '2026-11-11',
          }).expect(422),
        ),
      ).toBe('Nobody can join a group on a day that has not come yet.');
      const left = await learner();
      await changeStatus(admin, north, left.id, { status: 'withdrawn' }).expect(
        200,
      );
      expect(refusal(await join(cohort.id, left.id).expect(422))).toBe(
        'This learner no longer attends the school (Withdrawn).',
      );
      const southAdmin = await campusAdmin(app, south);
      const elsewhere = await admit(southAdmin, south, southSection.id);
      expect(refusal(await join(cohort.id, elsewhere.id).expect(422))).toBe(
        'A student can only join a group in their own school.',
      );

      const closed = (await newCohort({ isActive: false }).expect(201)).body;
      expect(refusal(await join(closed.id, child.id).expect(422))).toBe(
        `${closed.name} is closed. Open it again before anybody joins.`,
      );
    });

    it('leaving keeps the membership as history, leaving twice is refused, and joining again opens a new one', async () => {
      const cohort = (await newCohort().expect(201)).body;
      const child = await learner();
      const member = (
        await join(cohort.id, child.id, { joinedOn: '2026-11-05' }).expect(201)
      ).body;
      const leave = (body: object = {}) =>
        admin
          .as(north)
          .post(`/api/v1/cohorts/${cohort.id}/members/${member.id}/leave`)
          .send(body);

      // A day before joining moves to the joining day.
      const left = await leave({ leftOn: '2026-11-01' }).expect(200);
      expect(left.body.leftOn).toBe('2026-11-05');
      expect(refusal(await leave().expect(422))).toBe(
        'This person already left the group.',
      );

      const back = await join(cohort.id, child.id).expect(201);
      expect(back.body.id).not.toBe(member.id);
      expect(await memberships(child.id)).toEqual([
        {
          cohort_id: cohort.id,
          joined_on: '2026-11-05',
          left_on: '2026-11-05',
        },
        { cohort_id: cohort.id, joined_on: '2026-11-10', left_on: null },
      ]);
      const current = await admin
        .as(north)
        .get(`/api/v1/cohorts/${cohort.id}/members?currentOnly=true`)
        .expect(200);
      expect(current.body.map((m: { id: string }) => m.id)).toEqual([
        back.body.id,
      ]);
    });
  });

  describe('programmes', () => {
    it('answers 404 while the feature is off, and the data stays', async () => {
      const program = (await newProgram().expect(201)).body;
      await dataSource.query(
        `INSERT INTO feature_settings (school_id, feature, enabled) VALUES ($1, 'programmes', false)`,
        [north.id],
      );
      await admin.as(north).get('/api/v1/programs').expect(404);
      await admin.as(north).get(`/api/v1/programs/${program.id}`).expect(404);
      await dataSource.query(
        `DELETE FROM feature_settings WHERE school_id = $1 AND feature = 'programmes'`,
        [north.id],
      );
      await admin.as(north).get(`/api/v1/programs/${program.id}`).expect(200);
    });

    it('names are unique here, and a place needs an active enrollment and an open programme', async () => {
      const program = (await newProgram({ name: 'Chess Club' }).expect(201))
        .body;
      expect(
        refusal(await newProgram({ name: 'chess club' }).expect(422)),
      ).toBe('This school already has a programme with that name.');
      const child = await learner();
      const first = await place(program.id, child.id).expect(201);
      expect(first.body).toMatchObject({
        status: 'requested',
        startsOn: '2026-11-10',
      });
      expect((await place(program.id, child.id).expect(201)).body.id).toBe(
        first.body.id,
      );

      const away = await learner();
      await changeStatus(admin, north, away.id, { status: 'suspended' }).expect(
        200,
      );
      expect(refusal(await place(program.id, away.id).expect(422))).toBe(
        'A programme needs an active enrollment.',
      );
      const closed = (await newProgram({ isActive: false }).expect(201)).body;
      expect(refusal(await place(closed.id, child.id).expect(422))).toBe(
        'This programme is closed.',
      );
    });

    it('follows the participation transition table, and refuses a change somebody else made first', async () => {
      const program = (await newProgram().expect(201)).body;
      const child = await learner();
      const id = (await place(program.id, child.id).expect(201)).body.id;

      const active = await move(program.id, id, 'active', 'requested').expect(
        200,
      );
      expect(active.body).toMatchObject({ status: 'active', endsOn: null });
      // A second person still looking at "requested".
      expect(
        refusal(
          await move(program.id, id, 'withdrawn', 'requested').expect(422),
        ),
      ).toBe('Somebody else already moved this place to Taking part.');
      expect(
        refusal(await move(program.id, id, 'requested', 'active').expect(422)),
      ).toBe('A place cannot move from Taking part to Requested.');
      const out = await move(program.id, id, 'withdrawn', 'active').expect(200);
      expect(out.body.endsOn).toBe('2026-11-10');

      // While withdrawn the learner takes a new place; the old one cannot run again.
      const second = (await place(program.id, child.id).expect(201)).body;
      expect(second.id).not.toBe(id);
      expect(
        refusal(await move(program.id, id, 'active', 'withdrawn').expect(422)),
      ).toBe('The learner already holds another place in this programme.');
      await move(program.id, second.id, 'withdrawn', 'requested').expect(200);
      await move(program.id, id, 'active', 'withdrawn').expect(200);
      await move(program.id, id, 'completed', 'active').expect(200);
      expect(
        refusal(await move(program.id, id, 'active', 'completed').expect(422)),
      ).toBe('A place cannot move from Completed to Taking part.');
    });
  });

  describe('when an enrollment closes', () => {
    // A learner with an active place, a requested place and a cohort.
    async function busyLearner(): Promise<{
      child: Admitted;
      activeIn: string;
      requestedIn: string;
      cohortId: string;
    }> {
      const child = await learner();
      const activeIn = (await newProgram().expect(201)).body.id;
      const requestedIn = (await newProgram().expect(201)).body.id;
      const placeId = (await place(activeIn, child.id).expect(201)).body.id;
      await move(activeIn, placeId, 'active', 'requested').expect(200);
      await place(requestedIn, child.id).expect(201);
      const cohortId = (await newCohort().expect(201)).body.id;
      await join(cohortId, child.id).expect(201);
      return { child, activeIn, requestedIn, cohortId };
    }

    for (const status of ['withdrawn', 'transferred', 'archived'] as const) {
      it(`${status}: places are withdrawn and cohorts left`, async () => {
        const { child } = await busyLearner();
        await changeStatus(admin, north, child.id, { status }).expect(200);
        const label = status.charAt(0).toUpperCase() + status.slice(1);
        expect(
          (await places(child.id)).map(
            (p: { status: string; note: string }) => [p.status, p.note],
          ),
        ).toEqual([
          ['withdrawn', `Enrollment closed: ${label}`],
          ['withdrawn', `Enrollment closed: ${label}`],
        ]);
        expect((await memberships(child.id))[0].left_on).toBe('2026-11-10');
      });
    }

    it('graduated: an active place completes, a requested one is withdrawn, cohorts are kept', async () => {
      const { child } = await busyLearner();
      await changeStatus(admin, north, child.id, {
        status: 'graduated',
      }).expect(200);
      expect(
        (await places(child.id)).map((p: { status: string }) => p.status),
      ).toEqual(['completed', 'withdrawn']);
      expect((await memberships(child.id))[0].left_on).toBeNull();
    });
  });

  it('a move to another campus ends places and memberships at the old campus', async () => {
    const child = await learner();
    const program = (await newProgram().expect(201)).body;
    await place(program.id, child.id).expect(201);
    const cohort = (await newCohort().expect(201)).body;
    await join(cohort.id, child.id).expect(201);

    const organizer = await person(app, { memberOf: [north] });
    await makeOrganizationMember(app, organizer.user, organization);
    const moved = await organizer
      .as(north)
      .post(`/api/v1/students/${child.id}/campus-move`)
      .send({ academicCycleSectionId: southSection.id })
      .expect(200);
    expect(moved.body.moved).toBe(true);

    expect(await places(child.id)).toEqual([
      {
        program_id: program.id,
        status: 'withdrawn',
        note: 'Moved to South Campus',
      },
    ]);
    expect((await memberships(child.id))[0].left_on).toBe('2026-11-10');
  });
});
