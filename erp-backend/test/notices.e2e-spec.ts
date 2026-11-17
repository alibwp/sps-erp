import { getQueueToken } from '@nestjs/bullmq';
import type { INestApplication } from '@nestjs/common';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
import { User } from '../src/identity/entities/user.entity.js';
import { PasswordHasher } from '../src/identity/password-hasher.js';
import { MAIL_TRANSPORT } from '../src/mail/mail.transport.js';
import { NoticeEmails } from '../src/notices/notice-emails.service.js';
import { NoticePublisher } from '../src/notices/notice-publisher.service.js';
import { SEND_NOTICE_EMAILS_JOB } from '../src/notices/notices.constants.js';
import type { Organization } from '../src/organizations/entities/organization.entity.js';
import type { School } from '../src/organizations/entities/school.entity.js';
import { QUEUES } from '../src/queue/queue.module.js';
import { StorageService } from '../src/storage/storage.service.js';
import {
  calendarBody,
  createCalendar,
  period,
  personWith,
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
  makeSubject,
  teacherOf,
} from './support/curriculum.js';
import {
  type Admitted,
  activeSection,
  admit,
  changeStatus,
} from './support/enrollments.js';
import { PASSWORD, bearer, signIn } from './support/identity.js';
import { createTestApp, waitFor } from './support/test-app.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n', 'latin1');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

describe('Notices (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let publisher: NoticePublisher;
  const clock = new FixedClock(NOW);
  const failing = 'mailbox.full@school.test';
  const mailed: Array<{ to: string; subject: string; text: string }> = [];
  const sendMail = vi.fn(
    async (message: { to: string; subject: string; text: string }) => {
      if (message.to === failing) throw new Error('Mailbox unavailable');
      mailed.push(message);
      return { messageId: String(mailed.length) };
    },
  );
  const tallies: Array<{
    noticeId: string;
    tally: { sent: number; failed: number; skipped: number };
  }> = [];
  let organization: Organization;
  let north: School;
  let south: School;
  let admin: Person;
  let yearId: string;
  let levelId: string;
  let sectionA: { id: string };
  let sectionB: { id: string };
  let southSection: { id: string };
  let teacher: Person;
  let a1: Admitted;
  let a2: Admitted;
  let b1: Admitted;
  let leaver: Admitted;
  let southLearner: Admitted;
  let guardianId: string;
  let offeringId: string;
  let counter = 0;

  const refusal = (res: { body: { error: { message: string } } }) =>
    res.body.error.message;
  const fields = (res: { body: { error: { fields?: object } } }) =>
    res.body.error.fields;
  const title = (prefix = 'Notice') => {
    counter += 1;
    return `${prefix} ${counter}`;
  };

  const draft = (body: Record<string, unknown> = {}, as = admin) =>
    as
      .as(north)
      .post('/api/v1/notices')
      .send({
        title: title(),
        content: 'School closes early on Friday.',
        startDate: '2026-11-10',
        stopDate: '2026-12-31',
        audience: { scope: 'school' },
        ...body,
      });
  const publish = (id: string, as = admin) =>
    as.as(north).post(`/api/v1/notices/${id}/publish`);
  const published = async (body: Record<string, unknown> = {}) => {
    const created = await draft(body).expect(201);
    await publish(created.body.id).expect(200);
    return created.body.id as string;
  };
  const reached = async (noticeId: string) =>
    (
      (await dataSource.query(
        'SELECT user_id FROM notice_recipients WHERE notice_id = $1',
        [noticeId],
      )) as Array<{ user_id: string }>
    )
      .map((row) => row.user_id)
      .sort();
  const statusOf = async (noticeId: string) =>
    (
      await dataSource.query(
        'SELECT status, scheduled_for FROM notices WHERE id = $1',
        [noticeId],
      )
    )[0] as { status: string; scheduled_for: Date | null };

  // Signs in as an admitted learner (or anyone made by an admission).
  const signedInAs = async (userId: string): Promise<Person> => {
    const hash = await app.get(PasswordHasher).hash(PASSWORD);
    await dataSource.query(
      `UPDATE users SET password_hash = $2, account_status = 'active',
              email_verified_at = now(), password_change_required_at = NULL
        WHERE id = $1`,
      [userId, hash],
    );
    const user = await dataSource.manager.findOneByOrFail(User, { id: userId });
    const { accessToken, client } = await signIn(app, user.email);
    return {
      user,
      token: accessToken,
      client,
      as: (school) => {
        const schoolId = typeof school === 'string' ? school : school?.id;
        const wrap = <T extends { set(name: string, value: string): T }>(
          test: T,
        ) => {
          test.set('Authorization', bearer(accessToken));
          if (schoolId) test.set('X-School-Id', schoolId);
          return test;
        };
        return {
          get: (path) => wrap(client.get(path)),
          post: (path) => wrap(client.post(path)),
          put: (path) => wrap(client.put(path)),
          patch: (path) => wrap(client.patch(path)),
          delete: (path) => wrap(client.delete(path)),
        };
      },
    };
  };

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: MAIL_TRANSPORT, useValue: { sendMail } },
      ],
    });
    dataSource = app.get(DataSource);
    publisher = app.get(NoticePublisher);
    // The notices worker calls this service; keep each job's tally.
    const emails = app.get(NoticeEmails);
    const send = emails.send.bind(emails);
    vi.spyOn(emails, 'send').mockImplementation(async (noticeId: string) => {
      const tally = await send(noticeId);
      tallies.push({ noticeId, tally });
      return tally;
    });

    organization = await createOrganization(app);
    north = await createSchool(app, organization, { name: 'North Campus' });
    south = await createSchool(app, organization, { name: 'South Campus' });
    const northAdmin = await campusAdmin(app, north);
    const southAdmin = await campusAdmin(app, south);
    const year = await createCalendar(
      northAdmin,
      north,
      calendarBody(2026),
      true,
    );
    yearId = year.id;
    levelId = (await makeLevel(northAdmin, north)).id;
    sectionA = await activeSection(northAdmin, north, yearId, levelId);
    sectionB = await activeSection(northAdmin, north, yearId, levelId);
    a1 = await admit(northAdmin, north, sectionA.id);
    a2 = await admit(northAdmin, north, sectionA.id);
    b1 = await admit(northAdmin, north, sectionB.id);
    leaver = await admit(northAdmin, north, sectionA.id);
    await changeStatus(northAdmin, north, leaver.id, {
      status: 'withdrawn',
    }).expect(200);
    teacher = await teacherOf(app, north);

    const parent = await northAdmin
      .as(north)
      .post('/api/v1/parents')
      .send({
        name: 'Guardian of A1',
        email: `guardian.${Date.now()}@school.test`,
      })
      .expect(201);
    guardianId = parent.body.id;
    await northAdmin
      .as(north)
      .post(`/api/v1/parents/${guardianId}/children`)
      .send({ studentId: a1.id })
      .expect(200);

    const subject = await makeSubject(northAdmin, north);
    [{ id: offeringId }] = await makeOfferings(northAdmin, north, {
      subjectId: subject.id,
      academicYearId: yearId,
      academicPeriodId: period(year, 'First term').id,
      academicLevelId: levelId,
      rosterMode: 'home_section',
      academicCycleSectionIds: [sectionB.id],
    });

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
    southLearner = await admit(southAdmin, south, southSection.id);
  });

  // Requests are limited per person (60 a minute).
  beforeEach(async () => {
    admin = await campusAdmin(app, north);
  });

  afterEach(() => {
    clock.set(NOW);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('audience', () => {
    it('the whole campus: its staff and attending learners, nobody who left, no families, nobody elsewhere', async () => {
      const id = await published();
      const people = await reached(id);
      for (const expected of [
        admin.user.id,
        teacher.user.id,
        a1.userId,
        a2.userId,
        b1.userId,
      ]) {
        expect(people).toContain(expected);
      }
      for (const excluded of [leaver.userId, southLearner.userId, guardianId]) {
        expect(people).not.toContain(excluded);
      }
      const [event] = await auditEvents(app, 'notice.published', id);
      expect(event.context).toEqual({
        recipients: people.length,
        send_email: false,
      });
    });

    it('a section reaches its attending learners; guardians only when asked for', async () => {
      const learnersOnly = await published({
        audience: { scope: 'section', sectionIds: [sectionA.id] },
      });
      expect(await reached(learnersOnly)).toEqual(
        [a1.userId, a2.userId].sort(),
      );
      const withFamilies = await published({
        audience: {
          scope: 'section',
          sectionIds: [sectionA.id],
          includeGuardians: true,
        },
      });
      expect(await reached(withFamilies)).toEqual(
        [a1.userId, a2.userId, guardianId].sort(),
      );
    });

    it('a class reaches every section of the level; an offering its roster', async () => {
      const level = await published({
        audience: { scope: 'class', academicLevelIds: [levelId] },
      });
      expect(await reached(level)).toEqual(
        [a1.userId, a2.userId, b1.userId].sort(),
      );
      const offering = await published({
        audience: { scope: 'offering', courseOfferingIds: [offeringId] },
      });
      expect(await reached(offering)).toEqual([b1.userId]);
    });

    it('named people and enrollments count only when they belong here and attend', async () => {
      const outsider = await person(app, { memberOf: [south] });
      const id = await published({
        audience: {
          scope: 'school',
          studentIds: [a2.id, leaver.id],
          userIds: [teacher.user.id, outsider.user.id],
        },
      });
      expect(await reached(id)).toEqual([a2.userId, teacher.user.id].sort());
    });

    it('the role filter keeps only the people holding one of the roles', async () => {
      const id = await published({
        audience: { scope: 'school', roles: ['teacher'] },
      });
      expect(await reached(id)).toEqual([teacher.user.id]);
    });

    it("another campus's sections, levels, offerings and enrollments are refused", async () => {
      expect(
        fields(
          await draft({
            audience: { scope: 'section', sectionIds: [southSection.id] },
          }).expect(400),
        ),
      ).toEqual({
        'audience.sectionIds': ['The selected section is invalid.'],
      });
      expect(
        fields(
          await draft({
            audience: { scope: 'school', studentIds: [southLearner.id] },
          }).expect(400),
        ),
      ).toEqual({
        'audience.studentIds': ['The selected student is invalid.'],
      });
      expect(
        fields(await draft({ audience: { scope: 'section' } }).expect(400)),
      ).toEqual({ 'audience.sectionIds': ['Choose at least one section.'] });
      expect(
        fields(await draft({ audience: { scope: 'class' } }).expect(400)),
      ).toEqual({
        'audience.academicLevelIds': ['Choose at least one class or level.'],
      });
    });
  });

  describe('life cycle', () => {
    it('a draft is cleaned, changed while draft, published once, and then only revised or archived', async () => {
      const created = await draft({
        content:
          '<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:x">there</a></p>',
      }).expect(201);
      expect(created.body).toMatchObject({
        status: 'draft',
        revision: 1,
        content: '<p>Hi <a>there</a></p>',
        publishedAt: null,
      });
      const id = created.body.id;
      await admin
        .as(north)
        .patch(`/api/v1/notices/${id}`)
        .send({ content: 'Line one\nLine two' })
        .expect(200);
      expect(
        fields(
          await admin
            .as(north)
            .patch(`/api/v1/notices/${id}`)
            .send({ content: '<p> </p>' })
            .expect(400),
        ),
      ).toEqual({ content: ['Write the message.'] });
      expect(
        fields(
          await admin
            .as(north)
            .patch(`/api/v1/notices/${id}`)
            .send({ stopDate: '2026-11-01' })
            .expect(400),
        ),
      ).toEqual({
        stopDate: ['The until field must be a date after or equal to from.'],
      });

      const first = await publish(id).expect(200);
      expect(first.body).toMatchObject({
        status: 'published',
        content: '<p>Line one<br />Line two</p>',
      });
      const count = (await reached(id)).length;
      await publish(id).expect(200);
      expect((await reached(id)).length).toBe(count);
      expect(await auditEvents(app, 'notice.published', id)).toHaveLength(1);

      expect(
        refusal(
          await admin
            .as(north)
            .patch(`/api/v1/notices/${id}`)
            .send({ title: 'Too late' })
            .expect(422),
        ),
      ).toBe('Only a draft or scheduled notice can be changed.');
      expect(
        refusal(
          await admin.as(north).delete(`/api/v1/notices/${id}`).expect(422),
        ),
      ).toBe('Only a draft that was never published can be deleted.');

      const archived = await admin
        .as(north)
        .post(`/api/v1/notices/${id}/archive`)
        .expect(200);
      expect(archived.body.status).toBe('archived');
      await admin.as(north).post(`/api/v1/notices/${id}/archive`).expect(200);
      expect(refusal(await publish(id).expect(422))).toBe(
        'This notice cannot be published from its current state.',
      );
    });

    it('a revision is a new draft that supersedes its original when published; a stale one is refused', async () => {
      const original = await published({ title: 'Trip letter' });
      await admin
        .as(north)
        .post(`/api/v1/notices/${original}/revise`)
        .send({})
        .expect(201);
      const revised = await admin
        .as(north)
        .post(`/api/v1/notices/${original}/revise`)
        .send({ title: 'Trip letter (updated)' })
        .expect(201);
      expect(revised.body).toMatchObject({
        status: 'draft',
        revision: 2,
        revisionOfId: original,
        title: 'Trip letter (updated)',
      });
      const [audit] = await auditEvents(app, 'notice.revised', revised.body.id);
      expect(audit.context).toEqual({ revision: 2, revision_of_id: original });

      const stale = (
        await dataSource.query(
          `SELECT id FROM notices WHERE revision_of_id = $1 AND id <> $2`,
          [original, revised.body.id],
        )
      )[0].id as string;
      await publish(revised.body.id).expect(200);
      expect((await statusOf(original)).status).toBe('superseded');
      expect(refusal(await publish(stale).expect(422))).toBe(
        'This notice revision has already been superseded.',
      );
      expect(
        refusal(
          await admin
            .as(north)
            .post(`/api/v1/notices/${original}/revise`)
            .send({})
            .expect(422),
        ),
      ).toBe('Only a published notice can be revised.');
      expect(
        refusal(
          await admin
            .as(north)
            .post(`/api/v1/notices/${original}/archive`)
            .expect(422),
        ),
      ).toBe('This notice cannot be archived from its current state.');
    });

    it('only a draft that was never published is deleted', async () => {
      const created = await draft().expect(201);
      await admin
        .as(north)
        .delete(`/api/v1/notices/${created.body.id}`)
        .expect(204);
      await admin
        .as(north)
        .get(`/api/v1/notices/${created.body.id}`)
        .expect(404);

      const shelved = await draft().expect(201);
      await admin
        .as(north)
        .post(`/api/v1/notices/${shelved.body.id}/archive`)
        .expect(200);
      expect(
        refusal(
          await admin
            .as(north)
            .delete(`/api/v1/notices/${shelved.body.id}`)
            .expect(422),
        ),
      ).toBe('Only a draft that was never published can be deleted.');

      const reader = await personWith(app, north, ['read notice']);
      await reader
        .as(north)
        .delete(`/api/v1/notices/${shelved.body.id}`)
        .expect(403);
    });

    it('drafts are for managers; others read published notices; families only theirs', async () => {
      const reader = await personWith(app, north, ['read notice']);
      const writer = await personWith(app, north, [
        'read notice',
        'create notice',
      ]);
      const hidden = await draft().expect(201);
      const forA = await published({
        audience: { scope: 'section', sectionIds: [sectionA.id] },
      });
      const forB = await published({
        audience: { scope: 'section', sectionIds: [sectionB.id] },
      });

      await reader
        .as(north)
        .get(`/api/v1/notices/${hidden.body.id}`)
        .expect(403);
      const seen = await reader.as(north).get('/api/v1/notices').expect(200);
      const ids = seen.body.map((n: { id: string }) => n.id);
      expect(ids).toEqual(expect.arrayContaining([forA, forB]));
      expect(ids).not.toContain(hidden.body.id);
      expect(
        seen.body.every(
          (n: { status: string; audience: unknown }) =>
            n.status === 'published' && n.audience === null,
        ),
      ).toBe(true);

      const own = await draft({}, writer).expect(201);
      await publish(own.body.id, writer).expect(403);

      const learner = await signedInAs(a1.userId);
      const mine = await learner.as(north).get('/api/v1/notices').expect(200);
      const mineIds = mine.body.map((n: { id: string }) => n.id);
      expect(mineIds).toContain(forA);
      expect(mineIds).not.toContain(forB);
      await learner.as(north).get(`/api/v1/notices/${forB}`).expect(403);
      await learner.as(north).get(`/api/v1/notices/${forA}`).expect(200);

      const southAdmin = await campusAdmin(app, south);
      await southAdmin.as(south).get(`/api/v1/notices/${forA}`).expect(404);
    });
  });

  describe('scheduling and the 15-minute job', () => {
    it('a draft is scheduled for later, can go back to draft, and is published when due', async () => {
      const created = await draft().expect(201);
      const id = created.body.id;
      expect(
        fields(
          await admin
            .as(north)
            .post(`/api/v1/notices/${id}/schedule`)
            .send({ scheduledFor: '2026-11-10T11:00:00Z' })
            .expect(400),
        ),
      ).toEqual({
        scheduledFor: ['The scheduled for field must be a date after now.'],
      });

      const when = '2026-11-10T14:00:00.000Z';
      const scheduled = await admin
        .as(north)
        .post(`/api/v1/notices/${id}/schedule`)
        .send({ scheduledFor: when })
        .expect(200);
      expect(scheduled.body).toMatchObject({
        status: 'scheduled',
        scheduledFor: when,
      });
      const [audit] = await auditEvents(app, 'notice.scheduled', id);
      expect(audit.context).toEqual({ scheduled_for: when });

      await admin
        .as(north)
        .post(`/api/v1/notices/${id}/unschedule`)
        .expect(200);
      expect(await statusOf(id)).toEqual({
        status: 'draft',
        scheduled_for: null,
      });
      await admin
        .as(north)
        .post(`/api/v1/notices/${id}/schedule`)
        .send({ scheduledFor: when })
        .expect(200);

      await publisher.processDue();
      expect((await statusOf(id)).status).toBe('scheduled');

      clock.set(new Date('2026-11-10T14:05:00Z'));
      await publisher.processDue();
      expect((await statusOf(id)).status).toBe('published');
      expect(await reached(id)).toContain(a1.userId);
      const [event] = await auditEvents(app, 'notice.published', id);
      expect(event.actorId).toBeNull();
    });

    it('a scheduled revision that can no longer be published goes back to draft', async () => {
      const original = await published();
      const one = await admin
        .as(north)
        .post(`/api/v1/notices/${original}/revise`)
        .send({})
        .expect(201);
      const two = await admin
        .as(north)
        .post(`/api/v1/notices/${original}/revise`)
        .send({})
        .expect(201);
      await admin
        .as(north)
        .post(`/api/v1/notices/${two.body.id}/schedule`)
        .send({ scheduledFor: '2026-11-10T13:00:00Z' })
        .expect(200);
      await publish(one.body.id).expect(200);

      clock.set(new Date('2026-11-10T13:30:00Z'));
      await publisher.processDue();
      expect(await statusOf(two.body.id)).toEqual({
        status: 'draft',
        scheduled_for: null,
      });
    });

    it('a notice expires once its stop date has passed in its own campus', async () => {
      const west = await createSchool(app, organization, {
        name: 'West Campus',
        timezone: 'Pacific/Honolulu',
      });
      const westAdmin = await campusAdmin(app, west);
      const westNotice = await westAdmin
        .as(west)
        .post('/api/v1/notices')
        .send({
          title: title('West'),
          content: 'Aloha',
          startDate: '2026-11-10',
          stopDate: '2026-11-12',
          audience: { scope: 'school' },
        })
        .expect(201);
      await westAdmin
        .as(west)
        .post(`/api/v1/notices/${westNotice.body.id}/publish`)
        .expect(200);
      const northNotice = await published({ stopDate: '2026-11-12' });

      await publisher.processDue();
      expect((await statusOf(northNotice)).status).toBe('published');

      // 05:00 UTC on the 13th is still the 12th in Honolulu.
      clock.set(new Date('2026-11-13T05:00:00Z'));
      await publisher.processDue();
      expect((await statusOf(northNotice)).status).toBe('expired');
      expect((await statusOf(westNotice.body.id)).status).toBe('published');
      expect(
        await auditEvents(app, 'notice.expired', northNotice),
      ).toHaveLength(1);

      clock.set(new Date('2026-11-13T10:30:00Z'));
      await publisher.processDue();
      expect((await statusOf(westNotice.body.id)).status).toBe('expired');

      const after = await admin
        .as(north)
        .post(`/api/v1/notices/${northNotice}/archive`)
        .expect(200);
      expect(after.body.status).toBe('archived');
    });
  });

  describe('email', () => {
    it('queued after publishing; switched off, demo and missing addresses are skipped or failed, others sent', async () => {
      const queue = app.get(getQueueToken(QUEUES.notices));
      const add = vi.spyOn(queue, 'add');
      const sectionC = await activeSection(admin, north, yearId, levelId);
      const sent = await admit(admin, north, sectionC.id);
      const quiet = await admit(admin, north, sectionC.id);
      const broken = await admit(admin, north, sectionC.id, { email: failing });
      const blank = await admit(admin, north, sectionC.id);
      const demo = await admit(admin, north, sectionC.id);
      await dataSource.query("UPDATE users SET email = '' WHERE id = $1", [
        blank.userId,
      ]);
      await dataSource.query(
        'UPDATE users SET demo_account = true WHERE id = $1',
        [demo.userId],
      );
      const quietLearner = await signedInAs(quiet.userId);
      expect(
        (
          await quietLearner
            .as(north)
            .get('/api/v1/notice-preferences')
            .expect(200)
        ).body,
      ).toEqual({ emailEnabled: true });
      await quietLearner
        .as(north)
        .put('/api/v1/notice-preferences')
        .send({ emailEnabled: false })
        .expect(200);

      const subject = title('Email');
      const id = await published({
        title: subject,
        content: '<p>Bring <strong>lunch</strong> &amp; water</p>',
        sendEmail: true,
        audience: { scope: 'section', sectionIds: [sectionC.id] },
      });
      expect(add).toHaveBeenCalledWith(
        SEND_NOTICE_EMAILS_JOB,
        { noticeId: id },
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 30_000 },
        }),
      );

      const { tally } = await waitFor(async () =>
        tallies.find((entry) => entry.noticeId === id),
      );
      expect(tally).toEqual({ sent: 1, failed: 2, skipped: 2 });
      expect(mailed.filter((m) => m.subject === subject)).toEqual([
        expect.objectContaining({
          to: sent.email,
          text: 'Bring lunch & water',
        }),
      ]);
      const states = await dataSource.query(
        `SELECT user_id, state, failure_reason FROM notice_recipients WHERE notice_id = $1`,
        [id],
      );
      const stateOf = (userId: string) =>
        states.find((row: { user_id: string }) => row.user_id === userId);
      expect(stateOf(sent.userId)).toMatchObject({
        state: 'delivered',
        failure_reason: null,
      });
      expect(stateOf(quiet.userId)).toMatchObject({ state: 'delivered' });
      expect(stateOf(demo.userId)).toMatchObject({ state: 'delivered' });
      expect(stateOf(broken.userId)).toMatchObject({
        state: 'failed',
        failure_reason: 'Mailbox unavailable',
      });
      expect(stateOf(blank.userId)).toMatchObject({
        state: 'failed',
        failure_reason: 'The person has no email address.',
      });

      // Switched off, they still see it.
      const listed = await quietLearner
        .as(north)
        .get('/api/v1/my-notices')
        .expect(200);
      expect(listed.body.map((n: { id: string }) => n.id)).toContain(id);

      const failures = await admin
        .as(north)
        .get(`/api/v1/notices/${id}/recipients`)
        .expect(200);
      expect(
        failures.body.filter((r: { state: string }) => r.state === 'failed'),
      ).toHaveLength(2);

      add.mockClear();
      await published({ sendEmail: false });
      expect(add).not.toHaveBeenCalled();
      add.mockRestore();
    });
  });

  describe('attachments', () => {
    const upload = (
      id: string,
      content: Buffer,
      filename: string,
      as = admin,
    ) =>
      as
        .as(north)
        .put(`/api/v1/notices/${id}/attachment`)
        .attach('attachment', content, {
          filename,
          contentType: 'application/octet-stream',
        });
    const download = (id: string, as: Person) =>
      as
        .as(north)
        .get(`/api/v1/notices/${id}/attachment`)
        .buffer(true)
        .parse((response, done) => {
          // Supertest keeps a download's bytes only with a parser.
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        });
    const keyOf = async (id: string) =>
      (
        await dataSource.query(
          'SELECT attachment_key FROM notices WHERE id = $1',
          [id],
        )
      )[0].attachment_key as string | null;

    it('accepts jpg, png, gif, pdf, doc or docx by content, at most 10 MB, only before publishing', async () => {
      const created = await draft().expect(201);
      const id = created.body.id;
      expect(
        fields(
          await upload(id, Buffer.from('MZ not a pdf'), 'letter.pdf').expect(
            400,
          ),
        ),
      ).toEqual({
        attachment: [
          'The attachment field must be a file of type: jpeg, png, jpg, gif, pdf, doc, docx.',
        ],
      });
      const big = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
      expect(fields(await upload(id, big, 'big.pdf').expect(400))).toEqual({
        attachment: [
          'The attachment field must not be greater than 10240 kilobytes.',
        ],
      });

      const res = await upload(id, PDF, '../../etc/Trip letter.pdf').expect(
        200,
      );
      expect(res.body.attachment).toEqual({
        name: 'Trip letter.pdf',
        mimeType: 'application/pdf',
        size: PDF.length,
      });
      const first = await keyOf(id);
      expect(first).toMatch(
        new RegExp(`^notices/${north.id}/${id}-[^/]+\\.pdf$`),
      );

      await upload(id, PNG, 'map.png').expect(200);
      expect(await app.get(StorageService).exists(first!)).toBe(false);

      await publish(id).expect(200);
      expect(refusal(await upload(id, PDF, 'late.pdf').expect(422))).toBe(
        'Only a draft or scheduled notice can be changed.',
      );
    });

    it('recipients and readers who can see the notice download it; nobody else', async () => {
      const created = await draft({
        audience: { scope: 'section', sectionIds: [sectionA.id] },
      }).expect(201);
      const id = created.body.id;
      await upload(id, PDF, 'trip.pdf').expect(200);

      const reader = await personWith(app, north, ['read notice']);
      await download(id, reader).expect(403);
      const manager = await download(id, admin).expect(200);
      expect(manager.body).toEqual(PDF);

      await publish(id).expect(200);
      const learner = await signedInAs(a1.userId);
      const got = await download(id, learner).expect(200);
      expect(got.headers['content-type']).toBe('application/pdf');
      expect(got.headers['content-disposition']).toContain('trip.pdf');
      expect(got.headers['x-content-type-options']).toBe('nosniff');
      expect(got.body).toEqual(PDF);
      await download(id, reader).expect(200);

      // Not a recipient and without "read notice".
      const otherLearner = await signedInAs(b1.userId);
      await download(id, otherLearner).expect(403);
      const nobody = await personWith(app, north, ['read calendar event']);
      await download(id, nobody).expect(403);
      const southAdmin = await campusAdmin(app, south);
      await southAdmin
        .as(south)
        .get(`/api/v1/notices/${id}/attachment`)
        .expect(404);
    });

    it('a revision shares the file until it replaces or removes it; the original keeps its file', async () => {
      const created = await draft().expect(201);
      const original = created.body.id;
      await upload(original, PDF, 'v1.pdf').expect(200);
      await publish(original).expect(200);
      const key = await keyOf(original);

      const revision = await admin
        .as(north)
        .post(`/api/v1/notices/${original}/revise`)
        .send({})
        .expect(201);
      expect(revision.body.attachment).toEqual({
        name: 'v1.pdf',
        mimeType: 'application/pdf',
        size: PDF.length,
      });
      expect(await keyOf(revision.body.id)).toBe(key);

      const removed = await admin
        .as(north)
        .delete(`/api/v1/notices/${revision.body.id}/attachment`)
        .expect(200);
      expect(removed.body.attachment).toBeNull();
      expect(await app.get(StorageService).exists(key!)).toBe(true);

      const second = await admin
        .as(north)
        .post(`/api/v1/notices/${original}/revise`)
        .send({})
        .expect(201);
      await admin
        .as(north)
        .delete(`/api/v1/notices/${second.body.id}`)
        .expect(204);
      expect(await app.get(StorageService).exists(key!)).toBe(true);
      expect((await download(original, admin).expect(200)).body).toEqual(PDF);
    });
  });

  describe('my notices', () => {
    it("lists started notices received here; read and dismiss are the reader's own", async () => {
      const now = await published({
        audience: { scope: 'section', sectionIds: [sectionA.id] },
      });
      const later = await published({
        startDate: '2026-11-20',
        audience: { scope: 'section', sectionIds: [sectionA.id] },
      });
      const elsewhere = await published({
        audience: { scope: 'section', sectionIds: [sectionB.id] },
      });
      const learner = await signedInAs(a2.userId);
      const list = async (query = '') =>
        (await learner.as(north).get(`/api/v1/my-notices${query}`).expect(200))
          .body as Array<{ id: string; state: string; readAt: string | null }>;

      const first = await list();
      const ids = first.map((n) => n.id);
      expect(ids).toContain(now);
      expect(ids).not.toContain(later);
      expect(ids).not.toContain(elsewhere);
      expect(first.find((n) => n.id === now)).toMatchObject({
        state: 'delivered',
        readAt: null,
        audience: null,
      });

      await learner
        .as(north)
        .post(`/api/v1/my-notices/${now}/read`)
        .expect(204);
      expect((await list()).find((n) => n.id === now)?.state).toBe('read');
      await learner
        .as(north)
        .post(`/api/v1/my-notices/${now}/dismiss`)
        .expect(204);
      expect((await list()).map((n) => n.id)).not.toContain(now);
      expect(
        (await list('?includeDismissed=true')).find((n) => n.id === now)?.state,
      ).toBe('dismissed');
      // Reading a dismissed notice brings it back (reference markRead).
      await learner
        .as(north)
        .post(`/api/v1/my-notices/${now}/read`)
        .expect(204);
      expect((await list()).find((n) => n.id === now)?.state).toBe('read');

      await learner
        .as(north)
        .post(`/api/v1/my-notices/${elsewhere}/read`)
        .expect(404);

      clock.set(new Date('2026-11-20T00:30:00Z'));
      expect((await list()).map((n) => n.id)).toContain(later);
    });
  });

  it('answers 404 for a notice of another campus on every route', async () => {
    const id = await published();
    const southAdmin = await campusAdmin(app, south);
    const as = southAdmin.as(south);
    const results: Response[] = [
      await as.patch(`/api/v1/notices/${id}`).send({ title: 'x' }),
      await as.post(`/api/v1/notices/${id}/publish`),
      await as.post(`/api/v1/notices/${id}/archive`),
      await as.post(`/api/v1/notices/${id}/revise`).send({}),
      await as.delete(`/api/v1/notices/${id}`),
      await as.get(`/api/v1/notices/${id}/recipients`),
    ];
    expect(results.map((res) => res.status)).toEqual([
      404, 404, 404, 404, 404, 404,
    ]);
  });
});
