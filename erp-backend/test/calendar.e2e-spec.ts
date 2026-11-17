import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SchoolCalendar } from '../src/calendar/school-calendar.service.js';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
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
  person,
} from './support/campus.js';
import { makeLevel } from './support/curriculum.js';
import { activeSection } from './support/enrollments.js';
import { createTestApp } from './support/test-app.js';

const NOW = new Date('2026-11-10T12:00:00Z');

describe('Calendar events (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let calendar: SchoolCalendar;
  const clock = new FixedClock(NOW);
  let organization: Organization;
  // Five hours ahead of UTC, to show days and times are the campus's own.
  let north: School;
  let south: School;
  let admin: Person;
  let sectionA: { id: string };
  let sectionB: { id: string };
  let southSection: { id: string };

  const refusal = (res: { body: { error: { message: string } } }) =>
    res.body.error.message;
  const fields = (res: { body: { error: { fields?: object } } }) =>
    res.body.error.fields;
  const event = (body: Record<string, unknown> = {}, as = admin) =>
    as
      .as(north)
      .post('/api/v1/calendar-events')
      .send({
        title: 'Sports day',
        type: 'activity',
        startsAt: '2026-12-01',
        endsAt: '2026-12-01',
        ...body,
      });
  const publish = (id: string) =>
    admin.as(north).post(`/api/v1/calendar-events/${id}/publish`).expect(200);
  const closure = async (body: Record<string, unknown>) => {
    const created = await event({ type: 'holiday', ...body }).expect(201);
    await publish(created.body.id);
    return created.body.id as string;
  };

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: Clock, useValue: clock }],
    });
    dataSource = app.get(DataSource);
    calendar = app.get(SchoolCalendar);
    organization = await createOrganization(app);
    north = await createSchool(app, organization, {
      name: 'North Campus',
      timezone: 'Asia/Karachi',
    });
    south = await createSchool(app, organization, { name: 'South Campus' });
    const northAdmin = await campusAdmin(app, north);
    const southAdmin = await campusAdmin(app, south);
    const year = await createCalendar(
      northAdmin,
      north,
      calendarBody(2026),
      true,
    );
    const level = await makeLevel(northAdmin, north);
    sectionA = await activeSection(northAdmin, north, year.id, level.id);
    sectionB = await activeSection(northAdmin, north, year.id, level.id);
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

  it('every route answers 404 while the campus has events off', async () => {
    const quiet = await createSchool(app, organization);
    const quietAdmin = await campusAdmin(app, quiet);
    await dataSource.query(
      `INSERT INTO feature_settings (school_id, feature, enabled) VALUES ($1, 'events', false)`,
      [quiet.id],
    );
    await quietAdmin
      .as(quiet)
      .get('/api/v1/calendar-events?from=2026-11-01&to=2026-11-30')
      .expect(404);
    await quietAdmin
      .as(quiet)
      .post('/api/v1/calendar-events')
      .send({
        title: 'Closed',
        type: 'holiday',
        startsAt: '2026-11-20',
        endsAt: '2026-11-20',
      })
      .expect(404);
  });

  describe('events', () => {
    it('a new event is a draft; an all-day one covers whole days of the campus', async () => {
      const res = await event({
        startsAt: '2026-12-01',
        endsAt: '2026-12-02',
        location: '  Field  ',
      }).expect(201);
      expect(res.body).toMatchObject({
        isPublished: false,
        isAllDay: true,
        startsAt: '2026-12-01T00:00',
        endsAt: '2026-12-02T23:59',
        location: 'Field',
        sectionIds: [],
        userIds: [],
      });
      const [row] = await dataSource.query(
        'SELECT starts_at, ends_at FROM calendar_events WHERE id = $1',
        [res.body.id],
      );
      // Midnight in Karachi is 19:00 UTC the day before.
      expect(row.starts_at.toISOString()).toBe('2026-11-30T19:00:00.000Z');
      expect(row.ends_at.toISOString()).toBe('2026-12-02T18:59:59.000Z');
    });

    it('a timed event keeps the campus clock times', async () => {
      const res = await event({
        isAllDay: false,
        startsAt: '2026-12-03T09:30',
        endsAt: '2026-12-03T11:00',
      }).expect(201);
      expect(res.body).toMatchObject({
        startsAt: '2026-12-03T09:30',
        endsAt: '2026-12-03T11:00',
      });
      const [row] = await dataSource.query(
        'SELECT starts_at FROM calendar_events WHERE id = $1',
        [res.body.id],
      );
      expect(row.starts_at.toISOString()).toBe('2026-12-03T04:30:00.000Z');
    });

    it('cannot end before it starts or last more than a year', async () => {
      const early = await event({
        startsAt: '2026-12-05',
        endsAt: '2026-12-04',
      }).expect(400);
      expect(fields(early)).toEqual({
        endsAt: ['A day on the calendar cannot end before it starts.'],
      });
      const long = await event({
        startsAt: '2026-12-05',
        endsAt: '2027-12-06',
      }).expect(400);
      expect(fields(long)).toEqual({
        endsAt: [
          'A day on the calendar cannot last more than a year. Check the year.',
        ],
      });
      const timed = await event({
        isAllDay: false,
        startsAt: '2026-12-05T10:00',
        endsAt: '2026-12-05T09:00',
      }).expect(400);
      expect(fields(timed)).toEqual({
        endsAt: ['A day on the calendar cannot end before it starts.'],
      });
    });

    it('audiences are sections and members of this campus only', async () => {
      const outsider = await person(app, { memberOf: [south] });
      expect(
        fields(await event({ sectionIds: [southSection.id] }).expect(400)),
      ).toEqual({ sectionIds: ['The selected section is invalid.'] });
      expect(
        fields(await event({ userIds: [outsider.user.id] }).expect(400)),
      ).toEqual({ userIds: ['The selected person is invalid.'] });

      const teacher = await person(app, { memberOf: [north] });
      const res = await event({
        sectionIds: [sectionA.id, sectionA.id],
        userIds: [teacher.user.id],
      }).expect(201);
      expect(res.body.sectionIds).toEqual([sectionA.id]);
      expect(res.body.people).toEqual([
        { id: teacher.user.id, name: teacher.user.name },
      ]);

      // Only what is sent is replaced.
      const renamed = await admin
        .as(north)
        .patch(`/api/v1/calendar-events/${res.body.id}`)
        .send({ title: 'Renamed' })
        .expect(200);
      expect(renamed.body.sectionIds).toEqual([sectionA.id]);
      expect(renamed.body.userIds).toEqual([teacher.user.id]);
      const moved = await admin
        .as(north)
        .patch(`/api/v1/calendar-events/${res.body.id}`)
        .send({ sectionIds: [sectionB.id] })
        .expect(200);
      expect(moved.body.sectionIds).toEqual([sectionB.id]);
      expect(moved.body.userIds).toEqual([teacher.user.id]);
    });

    it('drafts are for "update calendar event" or their creator', async () => {
      const reader = await personWith(app, north, ['read calendar event']);
      const writer = await personWith(app, north, [
        'read calendar event',
        'create calendar event',
      ]);
      const own = await event({ title: 'My draft' }, writer).expect(201);
      const other = await event({ title: 'Admin draft' }).expect(201);

      await writer
        .as(north)
        .get(`/api/v1/calendar-events/${own.body.id}`)
        .expect(200);
      await writer
        .as(north)
        .get(`/api/v1/calendar-events/${other.body.id}`)
        .expect(403);
      await reader
        .as(north)
        .get(`/api/v1/calendar-events/${own.body.id}`)
        .expect(403);
      const listed = await reader
        .as(north)
        .get('/api/v1/calendar-events?from=2026-12-01&to=2026-12-01')
        .expect(200);
      expect(listed.body.map((e: { id: string }) => e.id)).not.toContain(
        own.body.id,
      );

      await publish(own.body.id);
      const after = await reader
        .as(north)
        .get('/api/v1/calendar-events?from=2026-12-01&to=2026-12-01')
        .expect(200);
      expect(after.body.map((e: { id: string }) => e.id)).toContain(
        own.body.id,
      );

      const drafts = await admin
        .as(north)
        .get(
          '/api/v1/calendar-events?from=2026-12-01&to=2026-12-01&draftsOnly=true',
        )
        .expect(200);
      expect(drafts.body.map((e: { id: string }) => e.id)).toContain(
        other.body.id,
      );
      expect(
        drafts.body.every((e: { isPublished: boolean }) => !e.isPublished),
      ).toBe(true);
    });

    it('a publisher without "update calendar event" can take an event back to draft', async () => {
      const publisher = await personWith(app, north, [
        'read calendar event',
        'publish calendar event',
      ]);
      const created = await event().expect(201);
      await publisher
        .as(north)
        .post(`/api/v1/calendar-events/${created.body.id}/publish`)
        .expect(200);
      const back = await publisher
        .as(north)
        .post(`/api/v1/calendar-events/${created.body.id}/unpublish`)
        .expect(200);
      expect(back.body.isPublished).toBe(false);
    });

    it('people who only hold the parent or student role read the calendar elsewhere', async () => {
      const learner = await person(app, {
        memberOf: [north],
        roles: [['student', north]],
      });
      await learner
        .as(north)
        .get('/api/v1/calendar-events?from=2026-12-01&to=2026-12-31')
        .expect(403);
      const parent = await person(app, {
        memberOf: [north],
        roles: [['parent', north]],
      });
      const published = await event().expect(201);
      await publish(published.body.id);
      await parent
        .as(north)
        .get(`/api/v1/calendar-events/${published.body.id}`)
        .expect(403);
    });

    it('events of another campus are not found, and delete removes the audiences', async () => {
      const southAdmin = await campusAdmin(app, south);
      const created = await event({ sectionIds: [sectionA.id] }).expect(201);
      await southAdmin
        .as(south)
        .get(`/api/v1/calendar-events/${created.body.id}`)
        .expect(404);
      expect(
        refusal(
          await southAdmin
            .as(south)
            .delete(`/api/v1/calendar-events/${created.body.id}`)
            .expect(404),
        ),
      ).toBe('Event not found.');
      await admin
        .as(north)
        .delete(`/api/v1/calendar-events/${created.body.id}`)
        .expect(204);
      expect(
        await dataSource.query(
          'SELECT count(*)::int AS n FROM calendar_event_audiences WHERE calendar_event_id = $1',
          [created.body.id],
        ),
      ).toEqual([{ n: 0 }]);
    });
  });

  describe('closures', () => {
    it('a published campus-wide holiday shuts every section, on each campus day it covers', async () => {
      const id = await closure({
        title: 'Winter break',
        startsAt: '2027-01-04',
        endsAt: '2027-01-06',
      });
      for (const day of ['2027-01-04', '2027-01-05', '2027-01-06']) {
        expect((await calendar.closureOn(north.id, sectionA.id, day))?.id).toBe(
          id,
        );
        expect((await calendar.closureOn(north.id, null, day))?.id).toBe(id);
      }
      expect(
        await calendar.closureOn(north.id, sectionA.id, '2027-01-03'),
      ).toBeNull();
      expect(
        await calendar.closureOn(north.id, sectionA.id, '2027-01-07'),
      ).toBeNull();
      expect(
        await calendar.closureOn(south.id, southSection.id, '2027-01-05'),
      ).toBeNull();
    });

    it('a closure aimed at a section shuts only that section', async () => {
      const id = await closure({
        type: 'closure',
        title: 'Lab repairs',
        startsAt: '2027-01-12',
        endsAt: '2027-01-12',
        sectionIds: [sectionA.id],
      });
      expect(
        (await calendar.closureOn(north.id, sectionA.id, '2027-01-12'))?.id,
      ).toBe(id);
      expect(
        await calendar.closureOn(north.id, sectionB.id, '2027-01-12'),
      ).toBeNull();
      expect(await calendar.closureOn(north.id, null, '2027-01-12')).toBeNull();
    });

    it('drafts, other types and events aimed only at people never close', async () => {
      await event({
        type: 'holiday',
        startsAt: '2027-01-19',
        endsAt: '2027-01-19',
      }).expect(201);
      await closure({
        type: 'activity',
        startsAt: '2027-01-19',
        endsAt: '2027-01-19',
      });
      const teacher = await person(app, { memberOf: [north] });
      await closure({
        startsAt: '2027-01-19',
        endsAt: '2027-01-19',
        userIds: [teacher.user.id],
      });
      expect(
        await calendar.closureOn(north.id, sectionA.id, '2027-01-19'),
      ).toBeNull();
      expect(await calendar.closureOn(north.id, null, '2027-01-19')).toBeNull();
    });

    it('a timed closure counts on the campus day it falls on', async () => {
      // 23:00 to 23:30 in Karachi is 18:00 UTC: still the 26th there.
      const id = await closure({
        type: 'closure',
        isAllDay: false,
        startsAt: '2027-01-26T23:00',
        endsAt: '2027-01-26T23:30',
      });
      expect((await calendar.closureOn(north.id, null, '2027-01-26'))?.id).toBe(
        id,
      );
      expect(await calendar.closureOn(north.id, null, '2027-01-27')).toBeNull();
    });

    it('stored closures still count with events switched off', async () => {
      const id = await closure({
        startsAt: '2027-02-02',
        endsAt: '2027-02-02',
      });
      await dataSource.query(
        `INSERT INTO feature_settings (school_id, feature, enabled) VALUES ($1, 'events', false)`,
        [north.id],
      );
      try {
        expect(
          (await calendar.closureOn(north.id, sectionB.id, '2027-02-02'))?.id,
        ).toBe(id);
      } finally {
        await dataSource.query(
          `DELETE FROM feature_settings WHERE school_id = $1 AND feature = 'events'`,
          [north.id],
        );
      }
    });
  });
});
