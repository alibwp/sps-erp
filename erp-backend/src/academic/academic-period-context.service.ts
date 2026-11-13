import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { Forbidden } from '../access/access.constants.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { ApiException, RuleViolation } from '../common/errors/api-exception.js';
import { findInSchool } from '../common/tenancy/school-scope.js';
import type { School } from '../organizations/entities/school.entity.js';
import {
  AcademicPeriod,
  displayName,
} from './entities/academic-period.entity.js';
import { AcademicYear } from './entities/academic-year.entity.js';
import { UserAcademicPeriodPreference } from './entities/user-academic-period-preference.entity.js';

export type PeriodSource =
  'header' | 'preference' | 'calendar' | 'campus_default';

// The working year and period of one request at one campus.
export interface WorkingPeriod {
  academicYear: AcademicYear | null;
  academicPeriod: AcademicPeriod | null;
  source: PeriodSource | null;
  // Set when two top-level periods of the working year cover campus today:
  // no period can be worked out until their dates are fixed.
  error: string | null;
}

export const PERIOD_NOT_FOUND = 'Academic period not found.';

export const ContextMessages = {
  overlapping: (names: string) =>
    `The calendar has overlapping reporting periods: ${names}. Fix their dates before continuing.`,
  required:
    'No academic period is set for this request. Set a working academic period first.',
  draftYear:
    'Publish the school calendar before making it the working calendar.',
  noPeriods: 'This school calendar has no reporting periods.',
  notInYear: 'That academic period is not in your working academic year.',
  notTopLevel: 'Choose a top-level reporting period as your working period.',
} as const;

// 409: no working period could be worked out for a route that needs one.
export class AcademicPeriodRequired extends ApiException {
  constructor() {
    super(
      HttpStatus.CONFLICT,
      'academic_period_required',
      ContextMessages.required,
    );
  }
}

// 409: two top-level periods cover campus today, naming both.
export class AcademicPeriodsOverlap extends ApiException {
  constructor(message: string) {
    super(HttpStatus.CONFLICT, 'academic_periods_overlap', message);
  }
}

// Works out the working period (reference AcademicPeriodContext): the
// period named by X-Academic-Period-Id, then the person's saved choice,
// then the period covering campus today, then the campus default. Two
// top-level periods covering today stop it, whatever was chosen.
@Injectable()
export class AcademicPeriodContext {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly clock: Clock,
  ) {}

  async resolve(
    userId: string,
    school: School,
    headerPeriodId?: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<WorkingPeriod> {
    let year: AcademicYear | null = null;
    let named: AcademicPeriod | null = null;

    if (headerPeriodId) {
      // Only a top-level period of a published year of this campus.
      named = await manager.findOne(AcademicPeriod, {
        where: { id: headerPeriodId, schoolId: school.id, parentId: IsNull() },
      });
      year = named
        ? await manager.findOne(AcademicYear, {
            where: { id: named.academicYearId },
          })
        : null;
      if (!named || !year || year.status === 'draft') {
        throw new NotFoundException(PERIOD_NOT_FOUND);
      }
    } else {
      const latest = await manager.findOne(UserAcademicPeriodPreference, {
        where: { userId, schoolId: school.id },
        order: { updatedAt: 'DESC' },
      });
      year = latest
        ? await manager.findOne(AcademicYear, {
            where: { id: latest.academicYearId },
          })
        : null;
      if (!year && school.academicYearId) {
        year = await manager.findOne(AcademicYear, {
          where: { id: school.academicYearId, schoolId: school.id },
        });
      }
    }
    if (!year) {
      return {
        academicYear: null,
        academicPeriod: null,
        source: null,
        error: null,
      };
    }

    const today = this.clock.schoolToday(school.timezone);
    const covering = await manager
      .createQueryBuilder(AcademicPeriod, 'period')
      .where('period.academicYearId = :yearId', { yearId: year.id })
      .andWhere('period.parentId IS NULL')
      .andWhere('period.startsOn <= :today AND period.endsOn >= :today', {
        today,
      })
      .orderBy('period.position')
      .addOrderBy('period.startsOn')
      .getMany();
    if (covering.length > 1) {
      return {
        academicYear: year,
        academicPeriod: null,
        source: null,
        error: ContextMessages.overlapping(
          covering.map(displayName).join(', '),
        ),
      };
    }

    if (named) return this.found(year, named, 'header');
    const preference = await manager.findOne(UserAcademicPeriodPreference, {
      where: { userId, schoolId: school.id, academicYearId: year.id },
    });
    if (preference) {
      const period = await manager.findOne(AcademicPeriod, {
        where: { id: preference.academicPeriodId, academicYearId: year.id },
      });
      if (period) return this.found(year, period, 'preference');
    }
    if (covering.length === 1) return this.found(year, covering[0], 'calendar');
    if (school.academicPeriodId) {
      const period = await manager.findOne(AcademicPeriod, {
        where: { id: school.academicPeriodId, academicYearId: year.id },
      });
      if (period) return this.found(year, period, 'campus_default');
    }
    return {
      academicYear: year,
      academicPeriod: null,
      source: null,
      error: null,
    };
  }

  // Saves the person's working year and/or period at a campus (reference
  // AcademicYearService::setAcademicYear and
  // AcademicPeriodService::setAcademicPeriod).
  async setWorking(
    userId: string,
    school: School,
    permissions: ReadonlySet<string>,
    input: { academicYearId?: string; academicPeriodId?: string },
  ): Promise<WorkingPeriod> {
    await this.transactions.run(async (tx) => {
      const manager = tx.manager;
      let yearId: string | null = null;

      if (input.academicYearId) {
        if (!permissions.has('set academic year')) throw new Forbidden();
        const year = await findInSchool(
          manager,
          AcademicYear,
          { id: input.academicYearId },
          { schoolId: school.id, notFound: 'Academic year not found.' },
        );
        if (year.status === 'draft') {
          throw new RuleViolation(ContextMessages.draftYear);
        }
        const first = await manager.findOne(AcademicPeriod, {
          where: { academicYearId: year.id, parentId: IsNull() },
          order: { position: 'ASC', startsOn: 'ASC', createdAt: 'ASC' },
        });
        if (!first) throw new RuleViolation(ContextMessages.noPeriods);
        // An earlier choice for this year is kept; the year becomes the
        // most recent one.
        await manager.query(
          `INSERT INTO user_academic_period_preferences (user_id, school_id, academic_year_id, academic_period_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ON CONSTRAINT user_academic_period_preferences_unique
           DO UPDATE SET updated_at = clock_timestamp()`,
          [userId, school.id, year.id, first.id],
        );
        yearId = year.id;
      }

      if (input.academicPeriodId) {
        if (!permissions.has('set academic period')) throw new Forbidden();
        const period = await findInSchool(
          manager,
          AcademicPeriod,
          { id: input.academicPeriodId },
          { schoolId: school.id, notFound: PERIOD_NOT_FOUND },
        );
        const current = await this.resolve(userId, school, undefined, manager);
        const workingYearId = yearId ?? current.academicYear?.id ?? null;
        if (period.academicYearId !== workingYearId) {
          throw new RuleViolation(ContextMessages.notInYear);
        }
        if (current.error) throw new RuleViolation(current.error);
        if (period.parentId)
          throw new RuleViolation(ContextMessages.notTopLevel);
        await manager.query(
          `INSERT INTO user_academic_period_preferences (user_id, school_id, academic_year_id, academic_period_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ON CONSTRAINT user_academic_period_preferences_unique
           DO UPDATE SET academic_period_id = EXCLUDED.academic_period_id, updated_at = clock_timestamp()`,
          [userId, school.id, period.academicYearId, period.id],
        );
      }
    });
    return this.resolve(userId, school);
  }

  private found(
    year: AcademicYear,
    period: AcademicPeriod,
    source: PeriodSource,
  ): WorkingPeriod {
    return { academicYear: year, academicPeriod: period, source, error: null };
  }
}
