import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { User } from '../identity/entities/user.entity.js';
import type {
  AssignmentDto,
  ExceptionDto,
  LevelDto,
  OfferingDto,
  SectionBriefDto,
  SectionDto,
  SubjectDto,
} from './curriculum.dto.js';
import { AcademicCycleSection } from './entities/academic-cycle-section.entity.js';
import type { AcademicLevel } from './entities/academic-level.entity.js';
import { CourseOfferingSection } from './entities/course-offering-section.entity.js';
import { CourseOfferingStudentRecord } from './entities/course-offering-student-record.entity.js';
import type { CourseOffering } from './entities/course-offering.entity.js';
import type { InstructionalModelException } from './entities/instructional-model-exception.entity.js';
import { Subject } from './entities/subject.entity.js';
import type { TeachingAssignment } from './entities/teaching-assignment.entity.js';

// Turns curriculum records into what the API answers, loading the names
// they show in one query per kind.
@Injectable()
export class CurriculumViews {
  constructor(private readonly dataSource: DataSource) {}

  level(level: AcademicLevel): LevelDto {
    return {
      id: level.id,
      parentId: level.parentId,
      isGroup: level.isGroup,
      name: level.name,
      code: level.code,
      position: level.position,
      status: level.status,
      createdAt: level.createdAt,
      updatedAt: level.updatedAt,
    };
  }

  subject(subject: Subject): SubjectDto {
    return {
      id: subject.id,
      name: subject.name,
      shortName: subject.shortName,
      createdAt: subject.createdAt,
      updatedAt: subject.updatedAt,
    };
  }

  sectionBrief(section: AcademicCycleSection): SectionBriefDto {
    return {
      id: section.id,
      name: section.name,
      academicLevelId: section.academicLevelId,
    };
  }

  async sections(sections: AcademicCycleSection[]): Promise<SectionDto[]> {
    const teachers = await this.people(
      sections.map((section) => section.homeroomTeacherId),
    );
    return sections.map((section) => ({
      id: section.id,
      academicYearId: section.academicYearId,
      academicLevelId: section.academicLevelId,
      homeroomTeacher: section.homeroomTeacherId
        ? (teachers.get(section.homeroomTeacherId) ?? null)
        : null,
      name: section.name,
      label: section.label,
      stream: section.stream,
      shift: section.shift,
      language: section.language,
      room: section.room,
      capacity: section.capacity,
      position: section.position,
      status: section.status,
      createdAt: section.createdAt,
      updatedAt: section.updatedAt,
    }));
  }

  async section(section: AcademicCycleSection): Promise<SectionDto> {
    return (await this.sections([section]))[0];
  }

  async offerings(offerings: CourseOffering[]): Promise<OfferingDto[]> {
    if (!offerings.length) return [];
    const manager = this.dataSource.manager;
    const ids = offerings.map((offering) => offering.id);
    const links = await manager.find(CourseOfferingSection, {
      where: { courseOfferingId: In(ids) },
    });
    const named = await manager.find(CourseOfferingStudentRecord, {
      where: { courseOfferingId: In(ids) },
    });
    const subjects = new Map(
      (
        await manager.find(Subject, {
          where: {
            id: In([...new Set(offerings.map((row) => row.subjectId))]),
          },
          withDeleted: true,
        })
      ).map((subject) => [subject.id, subject]),
    );
    return offerings.map((offering) => {
      const subject = subjects.get(offering.subjectId)!;
      return {
        id: offering.id,
        academicYearId: offering.academicYearId,
        academicPeriodId: offering.academicPeriodId,
        subject: {
          id: subject.id,
          name: subject.name,
          shortName: subject.shortName,
        },
        academicLevelId: offering.academicLevelId,
        name: offering.name,
        rosterMode: offering.rosterMode,
        status: offering.status,
        plannedPeriodsPerWeek: offering.plannedPeriodsPerWeek,
        capacity: offering.capacity,
        academicCycleSectionIds: links
          .filter((link) => link.courseOfferingId === offering.id)
          .map((link) => link.academicCycleSectionId),
        studentRecordIds: named
          .filter((row) => row.courseOfferingId === offering.id)
          .map((row) => row.studentRecordId),
        createdAt: offering.createdAt,
        updatedAt: offering.updatedAt,
      };
    });
  }

  async offering(offering: CourseOffering): Promise<OfferingDto> {
    return (await this.offerings([offering]))[0];
  }

  async assignments(
    assignments: TeachingAssignment[],
    today: string,
  ): Promise<AssignmentDto[]> {
    const teachers = await this.people(assignments.map((row) => row.userId));
    const sectionIds = assignments
      .map((row) => row.academicCycleSectionId)
      .filter((id): id is string => id !== null);
    const sections = new Map(
      (sectionIds.length
        ? await this.dataSource.manager.find(AcademicCycleSection, {
            where: { id: In(sectionIds) },
          })
        : []
      ).map((section) => [section.id, section]),
    );
    return assignments.map((row) => {
      const section = row.academicCycleSectionId
        ? sections.get(row.academicCycleSectionId)
        : undefined;
      return {
        id: row.id,
        courseOfferingId: row.courseOfferingId,
        teacher: teachers.get(row.userId) ?? { id: row.userId, name: '' },
        role: row.role,
        section: section ? this.sectionBrief(section) : null,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        running:
          row.startsOn <= today && (row.endsOn === null || row.endsOn >= today),
        createdAt: row.createdAt,
      };
    });
  }

  async exceptions(
    exceptions: InstructionalModelException[],
  ): Promise<ExceptionDto[]> {
    const manager = this.dataSource.manager;
    const subjects = new Map(
      (exceptions.length
        ? await manager.find(Subject, {
            where: { id: In(exceptions.map((row) => row.subjectId)) },
            withDeleted: true,
          })
        : []
      ).map((subject) => [subject.id, subject]),
    );
    const granters = await this.people(
      exceptions.map((row) => row.grantedById),
    );
    return exceptions.map((row) => {
      const subject = subjects.get(row.subjectId)!;
      return {
        id: row.id,
        academicYearId: row.academicYearId,
        subject: {
          id: subject.id,
          name: subject.name,
          shortName: subject.shortName,
        },
        academicLevel: row.academicLevel
          ? { id: row.academicLevel.id, name: row.academicLevel.name }
          : null,
        rosterMode: row.rosterMode,
        reason: row.reason,
        grantedBy: row.grantedById
          ? (granters.get(row.grantedById) ?? null)
          : null,
        revokedAt: row.revokedAt,
        revokedById: row.revokedById,
        running: row.revokedAt === null,
        createdAt: row.createdAt,
      };
    });
  }

  private async people(
    ids: Array<string | null>,
  ): Promise<Map<string, { id: string; name: string }>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (!wanted.length) return new Map();
    const users = await this.dataSource.manager.find(User, {
      where: { id: In(wanted) },
      withDeleted: true,
    });
    return new Map(
      users.map((user) => [user.id, { id: user.id, name: user.name }]),
    );
  }
}
