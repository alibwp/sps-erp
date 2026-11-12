import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { AcademicCycleSection } from '../curriculum/entities/academic-cycle-section.entity.js';
import { User } from '../identity/entities/user.entity.js';
import { EnrollmentPlacement } from './entities/enrollment-placement.entity.js';
import { EnrollmentStatusChange } from './entities/enrollment-status-change.entity.js';
import type { StudentRecord } from './entities/student-record.entity.js';
import type {
  EnrollmentStatusHistoryDto,
  PlacementHistoryDto,
  StudentDto,
} from './students.dto.js';

// Turns enrollments and their histories into what the API answers.
@Injectable()
export class StudentViews {
  constructor(private readonly dataSource: DataSource) {}

  async students(enrollments: StudentRecord[]): Promise<StudentDto[]> {
    if (!enrollments.length) return [];
    const manager = this.dataSource.manager;
    const people = new Map(
      (
        await manager.find(User, {
          where: { id: In(enrollments.map((row) => row.userId)) },
          withDeleted: true,
        })
      ).map((user) => [user.id, user]),
    );
    const sectionIds = enrollments
      .map((row) => row.academicCycleSectionId)
      .filter((id): id is string => id !== null);
    const sections = new Map(
      (sectionIds.length
        ? await manager.find(AcademicCycleSection, {
            where: { id: In(sectionIds) },
          })
        : []
      ).map((section) => [section.id, section]),
    );
    return enrollments.map((row) => {
      const person = people.get(row.userId)!;
      const section = row.academicCycleSectionId
        ? sections.get(row.academicCycleSectionId)
        : undefined;
      return {
        id: row.id,
        userId: row.userId,
        name: person.name,
        email: person.email,
        admissionNumber: row.admissionNumber,
        admissionDate: row.admissionDate,
        status: row.status,
        isPrimary: row.isPrimary,
        transferredFromId: row.transferredFromId,
        section: section
          ? {
              id: section.id,
              name: section.name,
              academicLevelId: section.academicLevelId,
              academicYearId: section.academicYearId,
            }
          : null,
        birthday: person.birthday,
        gender: person.gender,
        phone: person.phone,
        address: person.address,
        addressLine2: person.addressLine2,
        city: person.city,
        state: person.state,
        postalCode: person.postalCode,
        country: person.country,
        nationality: person.nationality,
        accountStatus: person.accountStatus,
        createdAt: row.createdAt,
      };
    });
  }

  async student(enrollment: StudentRecord): Promise<StudentDto> {
    return (await this.students([enrollment]))[0];
  }

  async placements(enrollmentId: string): Promise<PlacementHistoryDto[]> {
    const manager = this.dataSource.manager;
    const rows = await manager.find(EnrollmentPlacement, {
      where: { studentRecordId: enrollmentId },
      relations: { academicCycleSection: true, changedBy: true },
      withDeleted: true,
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.id,
      academicYearId: row.academicYearId,
      academicPeriodId: row.academicPeriodId,
      section: {
        id: row.academicCycleSection.id,
        name: row.academicCycleSection.name,
        academicLevelId: row.academicCycleSection.academicLevelId,
      },
      effectiveOn: row.effectiveOn,
      changedBy: row.changedBy
        ? { id: row.changedBy.id, name: row.changedBy.name }
        : null,
      reason: row.reason,
      createdAt: row.createdAt,
    }));
  }

  async statuses(enrollmentId: string): Promise<EnrollmentStatusHistoryDto[]> {
    const rows = await this.dataSource.manager.find(EnrollmentStatusChange, {
      where: { studentRecordId: enrollmentId },
      relations: { changedBy: true },
      withDeleted: true,
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => ({
      id: row.id,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      effectiveOn: row.effectiveOn,
      changedBy: row.changedBy
        ? { id: row.changedBy.id, name: row.changedBy.name }
        : null,
      reason: row.reason,
      createdAt: row.createdAt,
    }));
  }
}
