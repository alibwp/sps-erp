import { Injectable } from '@nestjs/common';
import { EntityManager, In, Not } from 'typeorm';
import type { RosterMode } from '../academic/academic.constants.js';
import { Forbidden } from '../access/access.constants.js';
import { AcademicLevels } from './academic-levels.service.js';
import { AcademicCycleSection } from './entities/academic-cycle-section.entity.js';
import { CourseOfferingSection } from './entities/course-offering-section.entity.js';
import { CourseOfferingStudentRecord } from './entities/course-offering-student-record.entity.js';
import { CourseOffering } from './entities/course-offering.entity.js';
import { TeachingAssignment } from './entities/teaching-assignment.entity.js';

export interface RosterLearner {
  studentRecordId: string;
  userId: string;
  name: string;
  admissionNumber: string;
  // Their section on the day asked about.
  academicCycleSectionId: string;
}

export interface RosterViewer {
  userId: string;
  permissions: ReadonlySet<string>;
}

// Who an offering teaches: the home sections its roster is read from, the
// levels whose learners it reaches, and its named learners.
export interface RosterScope {
  courseOfferingId: string;
  rosterMode: RosterMode;
  academicLevelIds: string[];
  sections: AcademicCycleSection[];
  studentRecordIds: string[];
  // The viewer teaches part of the offering and sees only those sections.
  limitedToSections: boolean;
}

// The one place that answers which learners an offering includes
// (reference CourseOfferingRoster). Gradebooks, attendance, notices,
// timetables and ranking read it; nothing else works the roster out.
@Injectable()
export class OfferingRoster {
  constructor(private readonly levels: AcademicLevels) {}

  async scope(
    manager: EntityManager,
    offering: CourseOffering,
    viewer?: RosterViewer,
  ): Promise<RosterScope> {
    const mode = offering.rosterMode;
    let academicLevelIds = [offering.academicLevelId];
    let sections: AcademicCycleSection[] = [];

    if (mode === 'home_section' || mode === 'combined_home_sections') {
      const links = await manager.find(CourseOfferingSection, {
        where: { courseOfferingId: offering.id },
      });
      sections = links.length
        ? await manager.find(AcademicCycleSection, {
            where: { id: In(links.map((link) => link.academicCycleSectionId)) },
            order: { position: 'ASC', name: 'ASC' },
          })
        : [];
    } else {
      academicLevelIds = await this.levels.teachingScopeIds(
        manager,
        offering.academicLevelId,
      );
    }
    if (mode === 'academic_level') {
      sections = await manager.find(AcademicCycleSection, {
        where: {
          academicYearId: offering.academicYearId,
          academicLevelId: In(academicLevelIds),
          status: Not('archived' as const),
        },
        order: { position: 'ASC', name: 'ASC' },
      });
    }

    const limit = viewer
      ? await this.markedSectionIds(manager, offering, viewer)
      : null;
    return {
      courseOfferingId: offering.id,
      rosterMode: mode,
      academicLevelIds,
      sections: limit
        ? sections.filter((section) => limit.includes(section.id))
        : sections,
      studentRecordIds:
        mode === 'individual_roster'
          ? (
              await manager.find(CourseOfferingStudentRecord, {
                where: { courseOfferingId: offering.id },
              })
            ).map((row) => row.studentRecordId)
          : [],
      limitedToSections: limit !== null,
    };
  }

  // The enrolled learners the offering includes on a day: each learner's
  // placement and state are those in effect that day (of the history rows
  // effective on or before it, the one made last), so a learner who moved
  // section on the 10th is in the old section's roster for the 9th and the
  // new one's for the 11th, and a change dated back still agrees with
  // where the learner sits today. A teacher of part of the offering gets
  // their sections only.
  async learnersOn(
    manager: EntityManager,
    offering: CourseOffering,
    day: string,
    viewer?: RosterViewer,
  ): Promise<RosterLearner[]> {
    const scope = await this.scope(manager, offering, viewer);
    let condition: string;
    let ids: string[];
    if (scope.rosterMode === 'individual_roster') {
      ids = scope.studentRecordIds;
      condition = 'enrollment.id = ANY($2::uuid[])';
    } else {
      // Home and combined rosters read their sections; a whole level reads
      // the sections of its levels that year. A limited viewer's sections
      // are already narrowed in the scope.
      ids = scope.sections.map((section) => section.id);
      condition = 'placement.academic_cycle_section_id = ANY($2::uuid[])';
    }
    if (!ids.length) return [];
    const rows = (await manager.query(
      `SELECT enrollment.id AS student_record_id, enrollment.user_id,
              person.name, enrollment.admission_number,
              placement.academic_cycle_section_id
         FROM student_records enrollment
         JOIN users person ON person.id = enrollment.user_id
         JOIN LATERAL (
           SELECT p.academic_cycle_section_id FROM enrollment_placements p
            WHERE p.student_record_id = enrollment.id AND p.effective_on <= $1
            ORDER BY p.created_at DESC
            LIMIT 1
         ) placement ON true
         LEFT JOIN LATERAL (
           SELECT c.to_status FROM enrollment_status_changes c
            WHERE c.student_record_id = enrollment.id AND c.effective_on <= $1
            ORDER BY c.created_at DESC
            LIMIT 1
         ) state ON true
        WHERE COALESCE(state.to_status, 'active') IN ('active', 'suspended')
          AND ${condition}
        ORDER BY enrollment.admission_number`,
      [day, ids],
    )) as Array<{
      student_record_id: string;
      user_id: string;
      name: string;
      admission_number: string;
      academic_cycle_section_id: string;
    }>;
    return rows.map((row) => ({
      studentRecordId: row.student_record_id,
      userId: row.user_id,
      name: row.name,
      admissionNumber: row.admission_number,
      academicCycleSectionId: row.academic_cycle_section_id,
    }));
  }

  // "read subject" reads any offering; "read gradebook" reads the offerings
  // the person teaches or taught (CourseOfferingPolicy::viewGradebook).
  async assertCanView(
    manager: EntityManager,
    offering: CourseOffering,
    viewer: RosterViewer,
  ): Promise<void> {
    if (
      viewer.permissions.has('read subject') ||
      viewer.permissions.has('update subject')
    ) {
      return;
    }
    const teaches = await manager.exists(TeachingAssignment, {
      where: { courseOfferingId: offering.id, userId: viewer.userId },
    });
    if (!teaches) throw new Forbidden();
  }

  // The sections a teacher of part of a section-based offering works with
  // (GradebookMarkSheet::markedSectionIds, extended to combined and
  // one-section rosters). Null: the whole roster, for anyone holding
  // "update subject", a teacher of the whole offering, or a reader with no
  // assignment.
  async markedSectionIds(
    manager: EntityManager,
    offering: CourseOffering,
    viewer: RosterViewer,
  ): Promise<string[] | null> {
    if (
      offering.rosterMode === 'individual_roster' ||
      viewer.permissions.has('update subject')
    ) {
      return null;
    }
    const assignments = await manager.find(TeachingAssignment, {
      where: { courseOfferingId: offering.id, userId: viewer.userId },
    });
    if (
      !assignments.length ||
      assignments.some((row) => row.academicCycleSectionId === null)
    ) {
      return null;
    }
    return [...new Set(assignments.map((row) => row.academicCycleSectionId!))];
  }
}
