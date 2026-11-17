import { Injectable } from '@nestjs/common';
import { type EntityManager, In } from 'typeorm';
import { Clock } from '../common/clock/clock.js';
import { AcademicLevels } from '../curriculum/academic-levels.service.js';
import { CourseOffering } from '../curriculum/entities/course-offering.entity.js';
import { OfferingRoster } from '../curriculum/offering-roster.service.js';
import { School } from '../organizations/entities/school.entity.js';
import type { NoticeAudienceSpec } from './notices.constants.js';

const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);

// Who a notice reaches (reference NoticeAudience). With no learner or
// named target: the campus's staff and every learner attending it. With
// targets: the attending learners of the chosen levels, sections,
// offerings or enrollments, plus the named people who belong to the
// campus. Then the optional role filter, and the chosen learners'
// guardians when asked for. A learner who left is never included, and
// nobody is reached through another campus.
@Injectable()
export class NoticeAudience {
  constructor(
    private readonly levels: AcademicLevels,
    private readonly roster: OfferingRoster,
    private readonly clock: Clock,
  ) {}

  async resolve(
    manager: EntityManager,
    schoolId: string,
    audience: NoticeAudienceSpec,
  ): Promise<string[]> {
    const attending = await this.attending(manager, schoolId);
    const named = audience.userIds ?? [];
    const scoped = audience.scope !== 'school';
    const hasLearnerTarget = scoped || Boolean(audience.studentIds?.length);

    let learners: string[];
    let people: string[];
    if (hasLearnerTarget || named.length) {
      learners = await this.targetedLearners(manager, schoolId, audience);
      const belonging = new Set([
        ...(await this.members(manager, schoolId)),
        ...attending,
      ]);
      people = [...learners, ...named.filter((id) => belonging.has(id))];
    } else {
      learners = attending;
      people = [...(await this.staff(manager, schoolId)), ...attending];
    }
    if (audience.includeGuardians) {
      people.push(...(await this.guardians(manager, learners)));
    }
    let reached = [...new Set(people)];
    if (audience.roles?.length) {
      reached = await this.holdingRoles(
        manager,
        schoolId,
        reached,
        audience.roles,
      );
    }
    return reached;
  }

  // People with an open (active or suspended) enrollment here.
  private async attending(
    manager: EntityManager,
    schoolId: string,
  ): Promise<string[]> {
    return ids(
      (await manager.query(
        `SELECT DISTINCT user_id AS id FROM student_records
          WHERE school_id = $1 AND status IN ('active', 'suspended')`,
        [schoolId],
      )) as Array<{ id: string }>,
    );
  }

  // Active members, without learners who left (anyone with an enrollment
  // who neither attends here nor works here).
  private async members(
    manager: EntityManager,
    schoolId: string,
  ): Promise<string[]> {
    return ids(
      (await manager.query(
        `SELECT m.user_id AS id FROM school_memberships m
          WHERE m.school_id = $1 AND m.status = 'active'
            AND NOT (
              EXISTS (SELECT 1 FROM student_records sr WHERE sr.user_id = m.user_id)
              AND NOT EXISTS (SELECT 1 FROM student_records sr
                               WHERE sr.user_id = m.user_id AND sr.school_id = $1
                                 AND sr.status IN ('active', 'suspended'))
              AND NOT EXISTS (${STAFF_HERE} AND a.user_id = m.user_id)
            )`,
        [schoolId],
      )) as Array<{ id: string }>,
    );
  }

  // Active members holding a staff role here, or with an employment record
  // here that has not ended.
  private async staff(
    manager: EntityManager,
    schoolId: string,
  ): Promise<string[]> {
    return ids(
      (await manager.query(
        `SELECT m.user_id AS id FROM school_memberships m
          WHERE m.school_id = $1 AND m.status = 'active'
            AND (EXISTS (${STAFF_HERE} AND a.user_id = m.user_id)
                 OR EXISTS (SELECT 1 FROM staff_profiles p
                             WHERE p.user_id = m.user_id AND p.school_id = $1
                               AND p.status <> 'left'))`,
        [schoolId],
      )) as Array<{ id: string }>,
    );
  }

  // The attending learners of the chosen levels (and the levels below
  // them), sections, offerings and enrollments, all of this campus.
  private async targetedLearners(
    manager: EntityManager,
    schoolId: string,
    audience: NoticeAudienceSpec,
  ): Promise<string[]> {
    const levelIds =
      audience.scope === 'class' ? (audience.academicLevelIds ?? []) : [];
    const sectionIds =
      audience.scope === 'section' ? (audience.sectionIds ?? []) : [];
    const offeringIds =
      audience.scope === 'offering' ? (audience.courseOfferingIds ?? []) : [];

    const levelScope: string[] = [];
    for (const levelId of levelIds) {
      levelScope.push(
        ...(await this.levels.teachingScopeIds(manager, levelId)),
      );
    }
    const enrollmentIds = [...(audience.studentIds ?? [])];
    if (offeringIds.length) {
      const school = await manager.findOneOrFail(School, {
        where: { id: schoolId },
      });
      const today = this.clock.schoolToday(school.timezone);
      const offerings = await manager.find(CourseOffering, {
        where: { id: In(offeringIds), schoolId },
      });
      for (const offering of offerings) {
        const learners = await this.roster.learnersOn(manager, offering, today);
        enrollmentIds.push(
          ...learners.map((learner) => learner.studentRecordId),
        );
      }
    }
    if (!levelScope.length && !sectionIds.length && !enrollmentIds.length) {
      return [];
    }
    return ids(
      (await manager.query(
        `SELECT DISTINCT sr.user_id AS id
           FROM student_records sr
           LEFT JOIN academic_cycle_sections s ON s.id = sr.academic_cycle_section_id
          WHERE sr.school_id = $1 AND sr.status IN ('active', 'suspended')
            AND (s.academic_level_id = ANY($2::uuid[])
                 OR sr.academic_cycle_section_id = ANY($3::uuid[])
                 OR sr.id = ANY($4::uuid[]))`,
        [schoolId, levelScope, sectionIds, enrollmentIds],
      )) as Array<{ id: string }>,
    );
  }

  private async guardians(
    manager: EntityManager,
    learnerIds: string[],
  ): Promise<string[]> {
    if (!learnerIds.length) return [];
    return ids(
      (await manager.query(
        `SELECT DISTINCT record.user_id AS id
           FROM parent_record_user link
           JOIN parent_records record ON record.id = link.parent_record_id
          WHERE link.user_id = ANY($1::uuid[])`,
        [learnerIds],
      )) as Array<{ id: string }>,
    );
  }

  // Of the people reached, those holding one of the roles here (or a
  // global one).
  private async holdingRoles(
    manager: EntityManager,
    schoolId: string,
    people: string[],
    roles: string[],
  ): Promise<string[]> {
    if (!people.length) return [];
    return ids(
      (await manager.query(
        `SELECT DISTINCT a.user_id AS id
           FROM model_has_roles a JOIN roles r ON r.id = a.role_id
          WHERE a.user_id = ANY($1::uuid[]) AND r.name = ANY($2::varchar[])
            AND (a.school_id = $3 OR a.school_id IS NULL)`,
        [people, roles, schoolId],
      )) as Array<{ id: string }>,
    );
  }
}

// A staff role held at the campus ($1); callers add the person.
const STAFF_HERE = `SELECT 1 FROM model_has_roles a JOIN roles r ON r.id = a.role_id
                     WHERE a.school_id = $1 AND r.name NOT IN ('student', 'parent')`;
