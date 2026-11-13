import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, Not } from 'typeorm';
import { isFrozen } from '../academic/academic.constants.js';
import { AcademicPeriod } from '../academic/entities/academic-period.entity.js';
import { AcademicYear } from '../academic/entities/academic-year.entity.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { findInSchool, newInSchool } from '../common/tenancy/school-scope.js';
import { OFFERING_SUBJECT, usesHomeSections } from './curriculum.constants.js';
import { CourseOfferings } from './course-offerings.service.js';
import { AcademicCycleSection } from './entities/academic-cycle-section.entity.js';
import { CourseOfferingSection } from './entities/course-offering-section.entity.js';
import { CourseOffering } from './entities/course-offering.entity.js';
import { OfferingClaims } from './offering-claims.js';

export const OfferingRollForwardMessages = {
  sameYear: 'Choose a different academic year to receive the course offerings.',
  targetClosed:
    'Reopen the target academic year before copying course offerings.',
  noPeriod: 'The matching reporting period does not exist in the new year.',
  noSections: 'Create the matching sections in the new year first.',
} as const;

type PlanItem =
  | {
      status: 'copy';
      offering: CourseOffering;
      period: AcademicPeriod;
      sectionIds: string[];
    }
  | { status: 'skip'; offering: CourseOffering; period: AcademicPeriod }
  | { status: 'problem'; offering: CourseOffering; reason: string };

export interface OfferingRollForwardPreview {
  copies: Array<{
    offering: CourseOffering;
    period: AcademicPeriod;
    sectionCount: number;
  }>;
  skips: CourseOffering[];
  problems: Array<{ offering: CourseOffering; reason: string }>;
}

// Copies a year's offerings into the next one (reference
// RollForwardCourseOfferings): periods match by name, type, position and
// parent, sections by level and name, and anything the target already
// teaches is skipped. The copies start as drafts; named learners are not
// copied.
@Injectable()
export class OfferingRollForward {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly offerings: CourseOfferings,
    private readonly audit: AuditService,
  ) {}

  async preview(
    schoolId: string,
    targetId: string,
    sourceId: string,
  ): Promise<OfferingRollForwardPreview> {
    const manager = this.dataSource.manager;
    const { source, target } = await this.years(
      manager,
      schoolId,
      targetId,
      sourceId,
    );
    const plan = await this.plan(manager, source, target);
    const preview: OfferingRollForwardPreview = {
      copies: [],
      skips: [],
      problems: [],
    };
    for (const item of plan) {
      if (item.status === 'copy') {
        preview.copies.push({
          offering: item.offering,
          period: item.period,
          sectionCount: item.sectionIds.length,
        });
      } else if (item.status === 'skip') {
        preview.skips.push(item.offering);
      } else {
        preview.problems.push({ offering: item.offering, reason: item.reason });
      }
    }
    return preview;
  }

  async run(
    schoolId: string,
    targetId: string,
    sourceId: string,
  ): Promise<CourseOffering[]> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const { source, target } = await this.years(
        manager,
        schoolId,
        targetId,
        sourceId,
        true,
      );
      const created: CourseOffering[] = [];
      for (const item of await this.plan(manager, source, target)) {
        if (item.status !== 'copy') continue;
        const { offering } = item;
        const copy = await manager.save(
          newInSchool(
            manager,
            CourseOffering,
            {
              academicYearId: target.id,
              academicPeriodId: item.period.id,
              subjectId: offering.subjectId,
              name: offering.name,
              academicLevelId: offering.academicLevelId,
              rosterMode: offering.rosterMode,
              plannedPeriodsPerWeek: offering.plannedPeriodsPerWeek,
              capacity: offering.capacity,
              status: 'draft',
            },
            { schoolId },
          ),
        );
        if (item.sectionIds.length) {
          await manager.insert(
            CourseOfferingSection,
            item.sectionIds.map((academicCycleSectionId) => ({
              courseOfferingId: copy.id,
              academicCycleSectionId,
            })),
          );
        }
        await this.audit.record(manager, {
          action: AuditAction.CourseOfferingCreated,
          subject: { type: OFFERING_SUBJECT, id: copy.id },
          context: {
            source_academic_year_id: source.id,
            target_academic_year_id: target.id,
            rolled_forward: true,
          },
          schoolId,
        });
        created.push(copy);
      }
      return created;
    });
  }

  private async plan(
    manager: EntityManager,
    source: AcademicYear,
    target: AcademicYear,
  ): Promise<PlanItem[]> {
    const periods = this.periodMap(
      await this.periodsOf(manager, source),
      await this.periodsOf(manager, target),
    );
    const targetSections = new Map(
      (
        await manager.find(AcademicCycleSection, {
          where: {
            academicYearId: target.id,
            status: Not('archived' as const),
          },
        })
      ).map((section) => [
        `${section.academicLevelId}:${section.name.toLowerCase()}`,
        section.id,
      ]),
    );
    // Every offering the target has counts, whatever its status, as in the
    // reference.
    const claims = await this.offerings.claimsOf(
      manager,
      target.id,
      null,
      false,
    );

    const offerings = await manager.find(CourseOffering, {
      where: { academicYearId: source.id },
      relations: { subject: true },
      withDeleted: true,
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const links = offerings.length
      ? await manager.find(CourseOfferingSection, {
          where: { courseOfferingId: In(offerings.map((row) => row.id)) },
          relations: { academicCycleSection: true },
        })
      : [];

    return offerings.map((offering): PlanItem => {
      const period = periods.get(offering.academicPeriodId);
      if (!period) {
        return {
          status: 'problem',
          offering,
          reason: OfferingRollForwardMessages.noPeriod,
        };
      }
      const own = links.filter((link) => link.courseOfferingId === offering.id);
      const sectionIds = usesHomeSections(offering.rosterMode)
        ? own
            .map((link) =>
              targetSections.get(
                `${link.academicCycleSection.academicLevelId}:${link.academicCycleSection.name.toLowerCase()}`,
              ),
            )
            .filter((id): id is string => id !== undefined)
        : [];
      if (
        usesHomeSections(offering.rosterMode) &&
        sectionIds.length !== own.length
      ) {
        return {
          status: 'problem',
          offering,
          reason: OfferingRollForwardMessages.noSections,
        };
      }
      const key = OfferingClaims.key(
        offering.subjectId,
        period.id,
        offering.academicLevelId,
      );
      if (claims.taken(key, offering.rosterMode, sectionIds)) {
        return { status: 'skip', offering, period };
      }
      if (offering.rosterMode !== 'individual_roster') {
        claims.add(key, offering.rosterMode, sectionIds);
      }
      return { status: 'copy', offering, period, sectionIds };
    });
  }

  // Top-level periods first, so a sub-period finds its parent's match.
  private periodsOf(
    manager: EntityManager,
    year: AcademicYear,
  ): Promise<AcademicPeriod[]> {
    return manager
      .createQueryBuilder(AcademicPeriod, 'period')
      .where('period.academicYearId = :yearId', { yearId: year.id })
      .orderBy('period.parentId IS NOT NULL')
      .addOrderBy('period.position')
      .getMany();
  }

  private periodMap(
    sourcePeriods: AcademicPeriod[],
    targetPeriods: AcademicPeriod[],
  ): Map<string, AcademicPeriod> {
    const map = new Map<string, AcademicPeriod>();
    for (const period of sourcePeriods) {
      const parentId =
        period.parentId === null
          ? null
          : (map.get(period.parentId)?.id ?? null);
      const match = targetPeriods.find(
        (candidate) =>
          candidate.name === period.name &&
          candidate.type === period.type &&
          candidate.position === period.position &&
          candidate.parentId === parentId,
      );
      if (match) map.set(period.id, match);
    }
    return map;
  }

  private async years(
    manager: EntityManager,
    schoolId: string,
    targetId: string,
    sourceId: string,
    lock = false,
  ): Promise<{ source: AcademicYear; target: AcademicYear }> {
    if (targetId === sourceId) {
      throw new RuleViolation(OfferingRollForwardMessages.sameYear);
    }
    const target = await findInSchool(
      manager,
      AcademicYear,
      { id: targetId },
      { schoolId, lock, notFound: 'Academic year not found.' },
    );
    const source = await findInSchool(
      manager,
      AcademicYear,
      { id: sourceId },
      { schoolId, notFound: 'Academic year not found.' },
    );
    if (isFrozen(target.status)) {
      throw new RuleViolation(OfferingRollForwardMessages.targetClosed);
    }
    return { source, target };
  }
}
