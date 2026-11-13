import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { addYears, formatDay } from '../common/clock/dates.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { findInSchool, newInSchool } from '../common/tenancy/school-scope.js';
import {
  INSTRUCTIONAL_MODEL_LABELS,
  YEAR_SUBJECT,
  isFrozen,
} from './academic.constants.js';
import {
  AcademicPeriod,
  displayName,
} from './entities/academic-period.entity.js';
import { AcademicYear } from './entities/academic-year.entity.js';
import { InstructionalModelSetting } from './entities/instructional-model-setting.entity.js';

export interface RollForwardItem {
  key: 'instructional_model' | 'academic_periods';
  title: string;
  description: string;
  details: string[];
  count: number;
  willCreate: boolean;
}

export interface RollForwardPreview {
  items: RollForwardItem[];
  createCount: number;
}

export interface RollForwardResult {
  instructionalModel: boolean;
  academicPeriods: number;
}

export const RollForwardMessages = {
  sameYear: 'Choose a different academic year to receive the setup.',
  closed: 'The target academic year is closed.',
  invalidStructure:
    'The previous school year has an invalid reporting-period structure.',
} as const;

// Copies a finished year's teaching model and period structure into the
// next year, with dates moved by whole years (reference
// RollForwardAcademicYearSetup). Only what the target does not have yet is
// copied.
@Injectable()
export class RollForward {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
  ) {}

  async preview(
    schoolId: string,
    targetId: string,
    sourceId: string,
  ): Promise<RollForwardPreview> {
    const manager = this.dataSource.manager;
    const { source, target } = await this.years(
      manager,
      schoolId,
      targetId,
      sourceId,
    );
    const sourceSetting = await this.setting(manager, source);
    const targetHasSetting = (await this.setting(manager, target)) !== null;
    const periods = await this.periods(manager, source);
    const targetHasPeriods = await manager.exists(AcademicPeriod, {
      where: { academicYearId: target.id },
    });
    const offset = target.startYear - source.startYear;

    const items: RollForwardItem[] = [
      {
        key: 'instructional_model',
        title: 'Teaching approach',
        description:
          'Use the same learner grouping approach in the new school year.',
        details: sourceSetting
          ? [INSTRUCTIONAL_MODEL_LABELS[sourceSetting.model]]
          : ['The previous year has no saved teaching approach.'],
        count: sourceSetting && !targetHasSetting ? 1 : 0,
        willCreate: sourceSetting !== null && !targetHasSetting,
      },
      {
        key: 'academic_periods',
        title: 'Reporting periods',
        description:
          'Copy the previous year’s period structure with dates moved to the new year.',
        details: periods.length
          ? periods.map((period) => this.detail(period, offset))
          : ['The previous year has no reporting periods.'],
        count: periods.length && !targetHasPeriods ? periods.length : 0,
        willCreate: periods.length > 0 && !targetHasPeriods,
      },
    ];
    return {
      items,
      createCount: items.reduce((sum, item) => sum + item.count, 0),
    };
  }

  async run(
    actorId: string,
    schoolId: string,
    targetId: string,
    sourceId: string,
  ): Promise<RollForwardResult> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const { source, target } = await this.years(
        manager,
        schoolId,
        targetId,
        sourceId,
        true,
      );
      let instructionalModel = false;
      let academicPeriods = 0;

      if (!(await this.setting(manager, target))) {
        const sourceSetting = await this.setting(manager, source);
        if (sourceSetting) {
          await manager.save(
            newInSchool(
              manager,
              InstructionalModelSetting,
              {
                academicYearId: target.id,
                model: sourceSetting.model,
                updatedById: actorId,
              },
              { schoolId },
            ),
          );
          instructionalModel = true;
        }
      }
      if (
        !(await manager.exists(AcademicPeriod, {
          where: { academicYearId: target.id },
        }))
      ) {
        academicPeriods = await this.copyPeriods(manager, source, target);
      }

      if (instructionalModel || academicPeriods > 0) {
        await this.audit.record(manager, {
          action: AuditAction.AcademicYearSetupRolledForward,
          subject: { type: YEAR_SUBJECT, id: target.id },
          context: {
            source_academic_year_id: source.id,
            target_academic_year_id: target.id,
            instructional_model_created: instructionalModel,
            academic_periods_created: academicPeriods,
          },
          schoolId,
        });
      }
      return { instructionalModel, academicPeriods };
    });
  }

  private async copyPeriods(
    manager: EntityManager,
    source: AcademicYear,
    target: AcademicYear,
  ): Promise<number> {
    const offset = target.startYear - source.startYear;
    const copies = new Map<string, string>();
    let remaining = await this.periods(manager, source);
    let created = 0;
    while (remaining.length) {
      const ready = remaining.filter(
        (period) => period.parentId === null || copies.has(period.parentId),
      );
      if (!ready.length)
        throw new RuleViolation(RollForwardMessages.invalidStructure);
      for (const period of ready) {
        const copy = await manager.save(
          newInSchool(
            manager,
            AcademicPeriod,
            {
              academicYearId: target.id,
              parentId: period.parentId ? copies.get(period.parentId)! : null,
              name: period.name,
              label: period.label,
              type: period.type,
              position: period.position,
              startsOn: period.startsOn
                ? addYears(period.startsOn, offset)
                : null,
              endsOn: period.endsOn ? addYears(period.endsOn, offset) : null,
              status: 'draft',
            },
            { schoolId: target.schoolId },
          ),
        );
        copies.set(period.id, copy.id);
        created++;
      }
      remaining = remaining.filter((period) => !copies.has(period.id));
    }
    return created;
  }

  // Top-level periods first, then in position order.
  private async periods(
    manager: EntityManager,
    year: AcademicYear,
  ): Promise<AcademicPeriod[]> {
    return manager
      .createQueryBuilder(AcademicPeriod, 'period')
      .where('period.academicYearId = :yearId', { yearId: year.id })
      .orderBy('period.parentId IS NOT NULL')
      .addOrderBy('period.position')
      .addOrderBy('period.startsOn')
      .getMany();
  }

  private setting(manager: EntityManager, year: AcademicYear) {
    return manager.findOne(InstructionalModelSetting, {
      where: { schoolId: year.schoolId, academicYearId: year.id },
    });
  }

  private detail(period: AcademicPeriod, offset: number): string {
    if (!period.startsOn || !period.endsOn) {
      return `${displayName(period)} (dates to review)`;
    }
    return `${displayName(period)} (${formatDay(addYears(period.startsOn, offset))} – ${formatDay(addYears(period.endsOn, offset))})`;
  }

  private async years(
    manager: EntityManager,
    schoolId: string,
    targetId: string,
    sourceId: string,
    lock = false,
  ): Promise<{ source: AcademicYear; target: AcademicYear }> {
    if (targetId === sourceId)
      throw new RuleViolation(RollForwardMessages.sameYear);
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
    if (isFrozen(target.status))
      throw new RuleViolation(RollForwardMessages.closed);
    return { source, target };
  }
}
