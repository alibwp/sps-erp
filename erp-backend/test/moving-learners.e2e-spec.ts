import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock, FixedClock } from '../src/common/clock/clock.js';
import { CampusMoves } from '../src/enrollments/campus-moves.service.js';
import { Transfers } from '../src/enrollments/transfers.service.js';
import { MailService } from '../src/mail/mail.service.js';
import type { Organization } from '../src/organizations/entities/organization.entity.js';
import type { School } from '../src/organizations/entities/school.entity.js';
import { calendarBody, createCalendar } from './support/academic.js';
import {
  type Person,
  auditEvents,
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
  place,
} from './support/enrollments.js';
import { fakeMail } from './support/identity.js';
import { createTestApp } from './support/test-app.js';

const NOW = new Date('2026-11-10T12:00:00Z');

describe('Moving learners (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const clock = new FixedClock(NOW);
  const mail = fakeMail();
  let organization: Organization;
  // Two campuses of one organization, and a school of another.
  let north: School;
  let south: School;
  let elsewhere: School;
  let northAdmin: Person;
  let southAdmin: Person;
  let elsewhereAdmin: Person;
  let northLevel: { id: string };
  let southSection: { id: string; name: string };
  let elsewhereSection: { id: string; name: string };
  let northYearId: string;

  const refusal = (res: { body: { error: { message: string } } }) =>
    res.body.error.message;

  const section = (fields: Record<string, unknown> = {}) =>
    activeSection(northAdmin, north, northYearId, northLevel.id, fields);

  const enrollment = async (id: string) =>
    (
      await dataSource.query(
        'SELECT school_id, status, academic_cycle_section_id, admission_number, is_primary, transferred_from_id FROM student_records WHERE id = $1',
        [id],
      )
    )[0];

  const placements = (id: string) =>
    dataSource.query(
      `SELECT academic_cycle_section_id AS section, reason
         FROM enrollment_placements WHERE student_record_id = $1
        ORDER BY created_at, id`,
      [id],
    );

  // The move handler the test in progress wants run, if any.
  let active: Parameters<CampusMoves['registerMoveHandler']>[0] | null = null;

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        { provide: Clock, useValue: clock },
        { provide: MailService, useValue: mail.service },
      ],
    });
    dataSource = app.get(DataSource);
    app
      .get(CampusMoves)
      .registerMoveHandler((manager, moved, context) =>
        active ? active(manager, moved, context) : Promise.resolve(),
      );
    organization = await createOrganization(app);
    north = await createSchool(app, organization, { name: 'North Campus' });
    south = await createSchool(app, organization, { name: 'South Campus' });
    elsewhere = await createSchool(app, await createOrganization(app), {
      name: 'Hilltop School',
    });
    northAdmin = await campusAdmin(app, north);
    southAdmin = await campusAdmin(app, south);
    elsewhereAdmin = await campusAdmin(app, elsewhere);

    northYearId = (
      await createCalendar(northAdmin, north, calendarBody(2026), true)
    ).id;
    northLevel = await makeLevel(northAdmin, north, { name: 'Basic 4' });

    const southYear = await createCalendar(
      southAdmin,
      south,
      calendarBody(2026),
      true,
    );
    const southLevel = await makeLevel(southAdmin, south, { name: 'Basic 4' });
    southSection = await activeSection(
      southAdmin,
      south,
      southYear.id,
      southLevel.id,
      {
        name: 'South A',
      },
    );

    const elsewhereYear = await createCalendar(
      elsewhereAdmin,
      elsewhere,
      calendarBody(2026),
      true,
    );
    const elsewhereLevel = await makeLevel(elsewhereAdmin, elsewhere, {
      name: 'Year 4',
    });
    elsewhereSection = await activeSection(
      elsewhereAdmin,
      elsewhere,
      elsewhereYear.id,
      elsewhereLevel.id,
      { name: 'Hilltop A' },
    );
  });

  // Requests are limited per person (60 a minute), so each test works as
  // fresh admins of the same campuses.
  beforeEach(async () => {
    northAdmin = await campusAdmin(app, north);
    southAdmin = await campusAdmin(app, south);
  });

  afterEach(() => clock.set(NOW));

  afterAll(async () => {
    await app.close();
  });

  describe('promotion', () => {
    it('promotion then reset returns every untouched learner to the source section', async () => {
      const source = await section({ name: 'P source' });
      const destination = await section({ name: 'P destination' });
      const other = await section({ name: 'P other' });
      const stays = await admit(northAdmin, north, source.id);
      const leaves = await admit(northAdmin, north, source.id);
      const movesOn = await admit(northAdmin, north, source.id);
      const notChosen = await admit(northAdmin, north, source.id);

      const promoted = await northAdmin
        .as(north)
        .post('/api/v1/promotions')
        .send({
          sourceAcademicCycleSectionId: source.id,
          destinationAcademicCycleSectionId: destination.id,
          studentIds: [stays.id, leaves.id, movesOn.id],
        })
        .expect(201);
      expect(promoted.body).toMatchObject({
        academicYearId: northYearId,
        source: { id: source.id, name: 'P source' },
        destination: { id: destination.id, name: 'P destination' },
      });
      expect(promoted.body.studentIds).toHaveLength(3);
      expect((await enrollment(stays.id)).academic_cycle_section_id).toBe(
        destination.id,
      );
      expect((await enrollment(notChosen.id)).academic_cycle_section_id).toBe(
        source.id,
      );

      // A second click finds the learners gone and writes nothing.
      const again = await northAdmin
        .as(north)
        .post('/api/v1/promotions')
        .send({
          sourceAcademicCycleSectionId: source.id,
          destinationAcademicCycleSectionId: destination.id,
          studentIds: [stays.id, leaves.id, movesOn.id],
        })
        .expect(422);
      expect(refusal(again)).toBe(
        'None of the chosen learners are still in this section. They may have been moved already.',
      );

      // Meanwhile one leaves the campus and one moves to another section.
      await changeStatus(northAdmin, north, leaves.id, {
        status: 'withdrawn',
      }).expect(200);
      await place(northAdmin, north, movesOn.id, {
        academicCycleSectionId: other.id,
      }).expect(200);

      await northAdmin
        .as(north)
        .post(`/api/v1/promotions/${promoted.body.id}/reset`)
        .expect(204);

      expect((await enrollment(stays.id)).academic_cycle_section_id).toBe(
        source.id,
      );
      expect(await enrollment(leaves.id)).toMatchObject({
        status: 'withdrawn',
        academic_cycle_section_id: destination.id,
      });
      expect((await enrollment(movesOn.id)).academic_cycle_section_id).toBe(
        other.id,
      );
      expect(await placements(stays.id)).toEqual([
        { section: source.id, reason: 'Admission' },
        { section: destination.id, reason: 'Promotion' },
        { section: source.id, reason: 'Promotion reset' },
      ]);
      await northAdmin
        .as(north)
        .get(`/api/v1/promotions/${promoted.body.id}`)
        .expect(404);
    });

    it('refuses the same section as destination', async () => {
      const source = await section({ name: 'P same' });
      const learner = await admit(northAdmin, north, source.id);
      const res = await northAdmin
        .as(north)
        .post('/api/v1/promotions')
        .send({
          sourceAcademicCycleSectionId: source.id,
          destinationAcademicCycleSectionId: source.id,
          studentIds: [learner.id],
        })
        .expect(422);
      expect(refusal(res)).toBe(
        'Choose a destination other than the current section.',
      );
    });
  });

  describe('graduation', () => {
    it('graduates the chosen active learners, skipping anyone who left', async () => {
      const room = await section({ name: 'G room' });
      const graduate = await admit(northAdmin, north, room.id);
      const left = await admit(northAdmin, north, room.id);
      await changeStatus(northAdmin, north, left.id, {
        status: 'withdrawn',
      }).expect(200);

      const res = await northAdmin
        .as(north)
        .post('/api/v1/graduations')
        .send({
          academicCycleSectionId: room.id,
          studentIds: [graduate.id, left.id],
        })
        .expect(200);
      expect(res.body).toEqual({ graduated: 1 });
      expect((await enrollment(graduate.id)).status).toBe('graduated');
      expect((await enrollment(left.id)).status).toBe('withdrawn');

      const again = await northAdmin
        .as(north)
        .post('/api/v1/graduations')
        .send({ academicCycleSectionId: room.id, studentIds: [graduate.id] })
        .expect(422);
      expect(refusal(again)).toBe(
        'None of the chosen learners are still active in this section. They may have graduated already.',
      );

      const list = await northAdmin
        .as(north)
        .get('/api/v1/graduations')
        .expect(200);
      expect(list.body.data.map((s: { id: string }) => s.id)).toContain(
        graduate.id,
      );
    });

    it('resetting returns a graduate to active, with the re-admission checks', async () => {
      const room = await section({ name: 'G small', capacity: 1 });
      const graduate = await admit(northAdmin, north, room.id);
      await northAdmin
        .as(north)
        .post('/api/v1/graduations')
        .send({ academicCycleSectionId: room.id, studentIds: [graduate.id] })
        .expect(200);
      // Their seat went to somebody else.
      const newcomer = await admit(northAdmin, north, room.id);

      const full = await northAdmin
        .as(north)
        .post(`/api/v1/graduations/${graduate.id}/reset`)
        .send({})
        .expect(422);
      expect(refusal(full)).toBe(
        'Their section is full at 1 learners. Free a seat or raise its size first.',
      );

      await changeStatus(northAdmin, north, newcomer.id, {
        status: 'withdrawn',
      }).expect(200);
      const reset = await northAdmin
        .as(north)
        .post(`/api/v1/graduations/${graduate.id}/reset`)
        .send({ reason: 'Graduated by mistake' })
        .expect(200);
      expect(reset.body.status).toBe('active');
    });
  });

  describe('admission waitlist', () => {
    // A full section of capacity 1 and three campus members waiting.
    async function fullSection(name: string) {
      const room = await section({ name, capacity: 1 });
      const seated = await admit(northAdmin, north, room.id);
      return { room, seated };
    }
    const candidate = () => person(app, { memberOf: [north] });
    const join = (sectionId: string, userId: string, priority?: number) =>
      northAdmin
        .as(north)
        .post('/api/v1/admission-waitlist')
        .send({ academicCycleSectionId: sectionId, userId, priority });
    const offer = (sectionId: string) =>
      northAdmin
        .as(north)
        .post('/api/v1/admission-waitlist/offers')
        .send({ academicCycleSectionId: sectionId })
        .expect(200);

    it('waitlist order and seat counting: an open offer counts as a taken seat', async () => {
      const { room, seated } = await fullSection('W order');
      const first = await candidate();
      const urgent = await candidate();
      const second = await candidate();
      const a = await join(room.id, first.user.id).expect(201);
      const b = await join(room.id, urgent.user.id, 5).expect(201);
      const c = await join(room.id, second.user.id).expect(201);
      // Joining again returns the open entry as it is, with 200.
      const repeat = await join(room.id, first.user.id).expect(200);
      expect(repeat.body.id).toBe(a.body.id);

      const queue = await northAdmin
        .as(north)
        .get(`/api/v1/admission-waitlist?academicCycleSectionId=${room.id}`)
        .expect(200);
      expect(queue.body.map((e: { id: string }) => e.id)).toEqual([
        b.body.id,
        a.body.id,
        c.body.id,
      ]);
      // The section is full, so nobody is next yet.
      expect(queue.body.every((e: { next: boolean }) => !e.next)).toBe(true);
      expect((await offer(room.id)).body).toEqual({
        entry: null,
        message:
          'There is no open place or pending candidate for this section.',
      });

      // A seat frees up: the highest priority is offered it.
      await changeStatus(northAdmin, north, seated.id, {
        status: 'withdrawn',
      }).expect(200);
      const offered = await offer(room.id);
      expect(offered.body.entry).toMatchObject({
        id: b.body.id,
        status: 'offered',
      });

      // The offer holds the seat: nobody else may take it.
      const sections = await northAdmin
        .as(north)
        .get('/api/v1/admission-waitlist/sections')
        .expect(200);
      expect(sections.body).toContainEqual(
        expect.objectContaining({ id: room.id, capacity: 1, seatsTaken: 1 }),
      );
      const full = await northAdmin
        .as(north)
        .post('/api/v1/students')
        .send({
          name: 'Late Comer',
          email: `late.${Date.now()}@school.test`,
          academicCycleSectionId: room.id,
        })
        .expect(422);
      expect(refusal(full)).toBe(
        'The section is full at 1 seats, counting open waitlist offers. Add the candidate to its admission waitlist instead.',
      );
      expect((await offer(room.id)).body.entry).toBeNull();

      // Accepting places the learner.
      const accepted = await northAdmin
        .as(north)
        .post(`/api/v1/admission-waitlist/${b.body.id}/accept`)
        .expect(200);
      expect(accepted.body).toMatchObject({
        userId: urgent.user.id,
        status: 'active',
      });
      const placed = await dataSource.query(
        'SELECT status FROM admission_waitlist_entries WHERE id = $1',
        [b.body.id],
      );
      expect(placed).toEqual([{ status: 'placed' }]);
      expect(
        await auditEvents(app, 'admission_waitlist.placed', b.body.id),
      ).toHaveLength(1);
    });

    it('a decided entry cannot be decided again, and only an offer can be accepted', async () => {
      const { room } = await fullSection('W decide');
      const someone = await candidate();
      const entry = await join(room.id, someone.user.id).expect(201);

      const notOffered = await northAdmin
        .as(north)
        .post(`/api/v1/admission-waitlist/${entry.body.id}/accept`)
        .expect(422);
      expect(refusal(notOffered)).toBe(
        'Only an offered admission place can be accepted.',
      );
      await northAdmin
        .as(north)
        .post(`/api/v1/admission-waitlist/${entry.body.id}/decline`)
        .send({ reason: 'Moved away' })
        .expect(200);
      const twice = await northAdmin
        .as(north)
        .post(`/api/v1/admission-waitlist/${entry.body.id}/decline`)
        .send({})
        .expect(422);
      expect(refusal(twice)).toBe(
        'This admission waitlist entry has already been decided.',
      );
    });

    it('joining needs a full section with a capacity and a member who is neither enrolled nor staff', async () => {
      const open = await section({ name: 'W open', capacity: 5 });
      const unlimited = await section({ name: 'W unlimited' });
      const { room, seated } = await fullSection('W join');
      const someone = await candidate();
      const outsider = await person(app);

      expect(refusal(await join(open.id, someone.user.id).expect(422))).toBe(
        'This section still has a place. Enrol the candidate instead of waitlisting them.',
      );
      expect(
        refusal(await join(unlimited.id, someone.user.id).expect(422)),
      ).toBe(
        'This section has no capacity limit, so it does not need an admission waitlist.',
      );
      expect(refusal(await join(room.id, outsider.user.id).expect(422))).toBe(
        'This candidate does not belong to the school.',
      );
      expect(refusal(await join(room.id, seated.userId).expect(422))).toBe(
        'This candidate is already enrolled in the school.',
      );
      expect(refusal(await join(room.id, northAdmin.user.id).expect(422))).toBe(
        `${northAdmin.user.name} works as staff. A member of staff cannot be admitted as a learner.`,
      );
    });

    it('a learner placed here is withdrawn from the waitlist', async () => {
      const { room } = await fullSection('W withdraw');
      const other = await section({ name: 'W elsewhere' });
      const someone = await candidate();
      const entry = await join(room.id, someone.user.id).expect(201);

      await admit(northAdmin, north, other.id, {
        name: someone.user.name,
        email: someone.user.email,
      });

      expect(
        await dataSource.query(
          'SELECT status, decision_reason FROM admission_waitlist_entries WHERE id = $1',
          [entry.body.id],
        ),
      ).toEqual([
        {
          status: 'withdrawn',
          decision_reason: 'Enrolled in this school while waiting.',
        },
      ]);
    });

    it('open entries keep a section from being archived', async () => {
      const { room, seated } = await fullSection('W archive');
      const someone = await candidate();
      await join(room.id, someone.user.id).expect(201);
      await changeStatus(northAdmin, north, seated.id, {
        status: 'withdrawn',
      }).expect(200);
      const res = await northAdmin
        .as(north)
        .post(`/api/v1/academic-cycle-sections/${room.id}/status`)
        .send({ status: 'archived' })
        .expect(422);
      expect(refusal(res)).toBe(
        "Decide the 1 open entries of this section's admission queue before archiving it.",
      );
    });
  });

  describe('campus moves', () => {
    const moveOrAsk = (asWho: Person, learner: Admitted, body: object = {}) =>
      asWho
        .as(north)
        .post(`/api/v1/students/${learner.id}/campus-move`)
        .send({ academicCycleSectionId: southSection.id, ...body });

    it('a requested move waits for the destination’s approval, and approval moves the learner atomically', async () => {
      const room = await section({ name: 'M request' });
      const learner = await admit(northAdmin, north, room.id);

      const asked = await moveOrAsk(northAdmin, learner, {
        reason: 'Family moved south',
      }).expect(200);
      expect(asked.body).toMatchObject({
        moved: false,
        student: null,
        request: {
          studentId: learner.id,
          status: 'requested',
          from: { id: north.id },
          to: { id: south.id },
          reason: 'Family moved south',
        },
      });
      // Still at the asking campus.
      expect((await enrollment(learner.id)).school_id).toBe(north.id);
      const queue = await southAdmin
        .as(south)
        .get('/api/v1/campus-moves')
        .expect(200);
      expect(queue.body.incoming.map((r: { id: string }) => r.id)).toContain(
        asked.body.request.id,
      );

      // The asking campus cannot decide for the receiving one.
      await northAdmin
        .as(north)
        .post(`/api/v1/campus-moves/${asked.body.request.id}/approve`)
        .send({})
        .expect(403);

      const approved = await southAdmin
        .as(south)
        .post(`/api/v1/campus-moves/${asked.body.request.id}/approve`)
        .send({ note: 'Welcome' })
        .expect(200);
      expect(approved.body).toMatchObject({
        status: 'approved',
        decisionNote: 'Welcome',
      });
      expect(await enrollment(learner.id)).toMatchObject({
        school_id: south.id,
        status: 'active',
        academic_cycle_section_id: southSection.id,
        admission_number: learner.admissionNumber,
      });
      await southAdmin
        .as(south)
        .get(`/api/v1/students/${learner.id}`)
        .expect(200);
      const memberships = await dataSource.query(
        "SELECT school_id FROM school_memberships WHERE user_id = $1 AND status = 'active' ORDER BY school_id",
        [learner.userId],
      );
      expect(
        memberships.map((m: { school_id: string }) => m.school_id).sort(),
      ).toEqual([north.id, south.id].sort());

      // A decided request is final.
      const twice = await southAdmin
        .as(south)
        .post(`/api/v1/campus-moves/${asked.body.request.id}/reject`)
        .send({})
        .expect(422);
      expect(refusal(twice)).toBe(
        'A campus move request cannot move from approved to rejected.',
      );
    });

    it('a second open request is refused', async () => {
      const room = await section({ name: 'M twice' });
      const learner = await admit(northAdmin, north, room.id);
      await moveOrAsk(northAdmin, learner).expect(200);
      const second = await moveOrAsk(northAdmin, learner).expect(422);
      expect(refusal(second)).toBe(
        'This student already has a campus move waiting for a decision.',
      );
    });

    it('the move authority tiers: organization authority moves now, a requester asks, anyone else is refused', async () => {
      const room = await section({ name: 'M tiers' });
      const mover = await admit(northAdmin, north, room.id);
      const teacher = await person(app, {
        memberOf: [north],
        roles: [['teacher', north]],
      });
      const refused = await moveOrAsk(teacher, mover).expect(403);
      expect(refusal(refused)).toBe(
        'You cannot move a student to another campus.',
      );

      const organizer = await person(app, { memberOf: [north] });
      await makeOrganizationMember(app, organizer.user, organization);
      const moved = await moveOrAsk(organizer, mover).expect(200);
      expect(moved.body).toMatchObject({
        moved: true,
        request: null,
        student: { id: mover.id },
      });
      expect((await enrollment(mover.id)).school_id).toBe(south.id);
      expect(
        await auditEvents(app, 'enrollment.campus_changed', mover.id),
      ).toHaveLength(1);

      // A delegation without the permission only asks, like a campus would.
      const narrow = await person(app, {
        memberOf: [north],
        roles: [['admin', north]],
      });
      await makeOrganizationMember(app, narrow.user, organization, [
        'read organization',
      ]);
      const learner = await admit(northAdmin, north, room.id);
      expect((await moveOrAsk(narrow, learner).expect(200)).body.moved).toBe(
        false,
      );
    });

    it('keeps the admission number, and refuses one the destination already uses', async () => {
      const room = await section({ name: 'M number' });
      const learner = await admit(northAdmin, north, room.id, {
        admissionNumber: 'DUP/26/000001',
      });
      await admit(southAdmin, south, southSection.id, {
        admissionNumber: 'dup/26/000001',
      });
      const res = await moveOrAsk(northAdmin, learner).expect(422);
      expect(refusal(res)).toBe(
        'South Campus already has a learner with admission number DUP/26/000001. Change one of the numbers first.',
      );
    });

    it('a section outside the organization’s other campuses is refused', async () => {
      const room = await section({ name: 'M sibling' });
      const learner = await admit(northAdmin, north, room.id);
      const res = await moveOrAsk(northAdmin, learner, {
        academicCycleSectionId: elsewhereSection.id,
      }).expect(400);
      expect(res.body.error.fields.academicCycleSectionId).toEqual([
        'That section does not belong to a campus of this organization.',
      ]);
    });

    it('closing the enrollment takes back its open request', async () => {
      const room = await section({ name: 'M close' });
      const learner = await admit(northAdmin, north, room.id);
      const asked = await moveOrAsk(northAdmin, learner).expect(200);
      await changeStatus(northAdmin, north, learner.id, {
        status: 'withdrawn',
      }).expect(200);
      expect(
        await dataSource.query(
          'SELECT status, decision_note FROM campus_move_requests WHERE id = $1',
          [asked.body.request.id],
        ),
      ).toEqual([
        { status: 'cancelled', decision_note: 'Enrollment closed: Withdrawn' },
      ]);
    });

    it('runs the registered move handlers inside the move', async () => {
      const room = await section({ name: 'M handlers' });
      const learner = await admit(northAdmin, north, room.id);
      const organizer = await person(app, { memberOf: [north] });
      await makeOrganizationMember(app, organizer.user, organization);
      const seen: Array<Record<string, unknown>> = [];
      let fail = false;
      active = async (manager, moved, context) => {
        // The same transaction: the move is visible before it commits.
        const [row] = await manager.query(
          'SELECT school_id FROM student_records WHERE id = $1',
          [moved.id],
        );
        seen.push({
          enrollment: moved.id,
          schoolIdInside: row.school_id,
          source: context.source.id,
          destination: context.destination.id,
          effectiveOn: context.effectiveOn,
          actorId: context.actorId,
        });
        if (fail) throw new Error('Boarding could not be released');
      };

      // A failing handler undoes the whole move.
      fail = true;
      await moveOrAsk(organizer, learner).expect(500);
      expect((await enrollment(learner.id)).school_id).toBe(north.id);

      fail = false;
      await moveOrAsk(organizer, learner, { effectiveOn: '2026-11-09' }).expect(
        200,
      );
      expect(seen.at(-1)).toEqual({
        enrollment: learner.id,
        schoolIdInside: south.id,
        source: north.id,
        destination: south.id,
        effectiveOn: '2026-11-09',
        actorId: organizer.user.id,
      });
      active = null;
    });

    it('the asking campus can take back its request', async () => {
      const room = await section({ name: 'M cancel' });
      const learner = await admit(northAdmin, north, room.id);
      const asked = await moveOrAsk(northAdmin, learner).expect(200);
      const cancelled = await northAdmin
        .as(north)
        .post(`/api/v1/campus-moves/${asked.body.request.id}/cancel`)
        .send({ note: 'Changed their mind' })
        .expect(200);
      expect(cancelled.body.status).toBe('cancelled');
      expect((await enrollment(learner.id)).school_id).toBe(north.id);
    });
  });

  describe('transfer', () => {
    it('a transfer between campuses of one organization is refused', async () => {
      const room = await section({ name: 'T sibling' });
      const learner = await admit(northAdmin, north, room.id);
      await expect(
        app.get(Transfers).transfer({
          enrollmentId: learner.id,
          destinationSchoolId: south.id,
        }),
      ).rejects.toThrow(
        'Both schools are campuses of one organization. Move the enrollment between campuses instead.',
      );
      expect((await enrollment(learner.id)).status).toBe('active');
    });

    it('closes the old enrollment as transferred and opens the linked one, and the old one can be archived', async () => {
      const room = await section({ name: 'T small', capacity: 1 });
      const learner = await admit(northAdmin, north, room.id);

      const successor = await app.get(Transfers).transfer({
        enrollmentId: learner.id,
        destinationSchoolId: elsewhere.id,
        sectionId: elsewhereSection.id,
        reason: 'Family relocated',
      });

      expect(await enrollment(learner.id)).toMatchObject({
        status: 'transferred',
        is_primary: false,
      });
      expect(await enrollment(successor.id)).toMatchObject({
        school_id: elsewhere.id,
        status: 'active',
        is_primary: true,
        transferred_from_id: learner.id,
        academic_cycle_section_id: elsewhereSection.id,
      });
      expect(successor.admissionNumber).not.toBe(learner.admissionNumber);
      await elsewhereAdmin
        .as(elsewhere)
        .get(`/api/v1/students/${successor.id}`)
        .expect(200);

      // A retry finds the enrollment the first one opened.
      const retry = await app.get(Transfers).transfer({
        enrollmentId: learner.id,
        destinationSchoolId: elsewhere.id,
      });
      expect(retry.id).toBe(successor.id);

      // The old section fills up; archiving the transferred enrollment
      // needs no seat.
      await admit(northAdmin, north, room.id);
      const archived = await changeStatus(northAdmin, north, learner.id, {
        status: 'archived',
      }).expect(200);
      expect(archived.body.status).toBe('archived');
    });
  });

  it('a person outside the campus’s move tiers cannot see its requests', async () => {
    const member = await person(app, { memberOf: [north] });
    await member.as(north).get('/api/v1/campus-moves').expect(403);
  });
});
