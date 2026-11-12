import { Injectable } from '@nestjs/common';
import { EntityManager, In, IsNull, Not } from 'typeorm';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { findInSchool, newInSchool } from '../common/tenancy/school-scope.js';
import { School } from '../organizations/entities/school.entity.js';
import {
  type AcademicStatus,
  type PeriodType,
  PERIOD_SUBJECT,
  SUB_PERIOD_TYPES,
  TOP_LEVEL_PERIOD_TYPES,
  YEAR_SUBJECT,
  isFrozen,
  isOperational,
} from './academic.constants.js';
import {
  AcademicLifecycle,
  type CalendarSubject,
} from './academic-lifecycle.service.js';
import {
  AcademicPeriod,
  displayName,
} from './entities/academic-period.entity.js';
import { AcademicPeriodStatusChange } from './entities/academic-period-status-change.entity.js';
import { AcademicYear, yearName } from './entities/academic-year.entity.js';

export interface CalendarPeriodInput {
  id?: string;
  name: string;
  type: PeriodType;
  startsOn: string;
  endsOn: string;
}

export interface CalendarInput {
  startsOn: string;
  endsOn: string;
  periods: CalendarPeriodInput[];
}

export interface PeriodInput {
  name: string;
  label?: string | null;
  type: PeriodType;
  startsOn: string;
  endsOn: string;
  parentId?: string | null;
  position?: number;
}

export const CalendarMessages = {
  endsBeforeStart: 'A school calendar cannot end before it starts.',
  notDraft:
    'Publish a calendar only after its dates are final. Published calendars are changed from their detail page.',
  noPeriods: 'Add at least one reporting period to the school calendar.',
  topLevelType:
    'A school calendar can only use terms, semesters, trimesters, quarters, or custom reporting periods.',
  subPeriodType:
    'A period inside another can only be an exam window, a holiday, or a reporting period.',
  periodEndsBeforeStart: (name: string) =>
    `${name} cannot end before it starts.`,
  outsideCalendar: (name: string) =>
    `${name} must sit inside the school calendar dates.`,
  overlaps: (name: string, other: string) => `${name} overlaps ${other}.`,
  yearOverlaps: (name: string) => `This calendar overlaps ${name}.`,
  notInCalendar:
    'That reporting period does not belong to this school calendar.',
  publishOnlyDraft: 'Only a draft calendar can be published.',
  publishNeedsDates:
    'Give the school calendar a start and end date before publishing it.',
  publishNeedsPeriods:
    'Add at least one reporting period before publishing the school calendar.',
  periodNeedsDates: (name: string) =>
    `${name} needs dates before this calendar can be published.`,
  keepsDates:
    'A closed period keeps its dates. Reopen it before you change them.',
  datesEndBeforeStart: 'A period cannot end before it starts.',
  datesReason: 'Say why the dates of a period already in use are changing.',
  runInside: (start: string, end: string) =>
    `This period must run inside ${start} to ${end}.`,
  childOutside: (name: string) => `${name} would fall outside the new dates.`,
  yearClosed: 'Reopen the academic year before you add a period to it.',
  parentClosed: (name: string) =>
    `Reopen ${name} before you add a period to it.`,
  parentNotTopLevel: 'A period can only sit inside a top-level period.',
  deleteYear:
    'Only a draft calendar that was never published can be deleted. Archive it instead.',
  deletePeriod:
    'Only a draft period that never changed status can be deleted. Archive it instead.',
} as const;

// The status a published period takes from its dates against the campus's
// today (reference PublishAcademicCalendar::statusFor).
export function statusForDates(
  startsOn: string,
  endsOn: string,
  today: string,
): AcademicStatus {
  if (endsOn < today) return 'closed';
  return startsOn > today ? 'scheduled' : 'open';
}

interface Span {
  name: string;
  startsOn: string;
  endsOn: string;
}

// The first pair of spans that share a day, when one does.
function firstOverlap(spans: Span[]): [Span, Span] | null {
  const sorted = [...spans].sort((a, b) =>
    a.startsOn.localeCompare(b.startsOn),
  );
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startsOn <= sorted[i - 1].endsOn) {
      return [sorted[i], sorted[i - 1]];
    }
  }
  return null;
}

// A later stage whose records point at years or periods says why one may
// not be removed (Stage 4: sections, course offerings). `year` is set when
// the whole calendar goes; `periods` lists every period removed with it.
export type CalendarRemovalGuard = (
  manager: EntityManager,
  removal: { year: AcademicYear | null; periods: AcademicPeriod[] },
) => Promise<string | null>;

// Years and periods of a campus (reference SaveAcademicCalendar,
// PublishAcademicCalendar, ChangeAcademicPeriodDates, AcademicPeriodService).
@Injectable()
export class AcademicCalendar {
  private readonly removalGuards: CalendarRemovalGuard[] = [];

  constructor(
    private readonly transactions: TransactionService,
    private readonly lifecycle: AcademicLifecycle,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  // Creates a draft year with its top-level periods, or rewrites a draft
  // year. Periods left out of the list are removed (with their
  // sub-periods); sub-periods of the periods kept must still fit.
  async save(
    schoolId: string,
    input: CalendarInput,
    yearId?: string,
  ): Promise<AcademicYear> {
    if (input.endsOn < input.startsOn) {
      throw new RuleViolation(CalendarMessages.endsBeforeStart);
    }
    const periods = this.preparePeriods(input);

    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      // Holding the campus keeps two saves from creating overlapping years.
      await this.lockSchool(manager, schoolId);
      let year: AcademicYear | null = null;
      if (yearId) {
        year = await findInSchool(
          manager,
          AcademicYear,
          { id: yearId },
          { schoolId, lock: true, notFound: 'Academic year not found.' },
        );
        if (year.status !== 'draft') {
          throw new RuleViolation(CalendarMessages.notDraft);
        }
      }
      await this.refuseYearOverlap(
        manager,
        schoolId,
        input.startsOn,
        input.endsOn,
        year?.id,
      );

      const isNew = year === null;
      year ??= newInSchool(manager, AcademicYear, {}, { schoolId });
      Object.assign(year, {
        startYear: Number(input.startsOn.slice(0, 4)),
        stopYear: Number(input.endsOn.slice(0, 4)),
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        status: 'draft',
      });
      year = await manager.save(year);

      const existing = isNew
        ? []
        : await manager.find(AcademicPeriod, {
            where: { academicYearId: year.id, parentId: IsNull() },
          });
      const kept = new Set(periods.map((period) => period.id).filter(Boolean));
      for (const period of periods) {
        if (period.id && !existing.some((row) => row.id === period.id)) {
          throw new RuleViolation(CalendarMessages.notInCalendar);
        }
      }

      for (const [index, input] of periods.entries()) {
        const row =
          (input.id && existing.find((period) => period.id === input.id)) ||
          newInSchool(manager, AcademicPeriod, {}, { schoolId });
        Object.assign(row, {
          academicYearId: year.id,
          parentId: null,
          name: input.name,
          type: input.type,
          position: index + 1,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          status: row.status ?? 'draft',
        });
        await manager.save(row);
      }
      const removed = existing.filter((row) => !kept.has(row.id));
      if (removed.length) {
        await this.refuseRemoval(manager, {
          year: null,
          periods: [
            ...removed,
            ...(await manager.find(AcademicPeriod, {
              where: { parentId: In(removed.map((row) => row.id)) },
            })),
          ],
        });
        await manager.delete(AcademicPeriod, {
          id: In(removed.map((row) => row.id)),
        });
      }
      await this.mustContainChildren(manager, year.id);

      await this.audit.record(manager, {
        action: AuditAction.AcademicCalendarSaved,
        subject: { type: YEAR_SUBJECT, id: year.id },
        context: {
          created: isNew,
          starts_on: input.startsOn,
          ends_on: input.endsOn,
          period_count: periods.length,
        },
        schoolId,
      });
      return year;
    });
  }

  // Publishes a draft year: each year and period takes its status from its
  // dates against campus today, and the campus opens in this year by
  // default from now on (reference PublishAcademicYear).
  async publish(schoolId: string, yearId: string): Promise<AcademicYear> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const school = await this.lockSchool(manager, schoolId);
      const subject = (await this.lifecycle.lockSubject(
        manager,
        'academic_year',
        yearId,
        schoolId,
      )) as Extract<CalendarSubject, { kind: 'academic_year' }>;
      const year = subject.row;
      if (year.status !== 'draft') {
        throw new RuleViolation(CalendarMessages.publishOnlyDraft);
      }
      if (!year.startsOn || !year.endsOn) {
        throw new RuleViolation(CalendarMessages.publishNeedsDates);
      }
      const topLevel = await this.topLevelPeriods(manager, year.id);
      if (!topLevel.length) {
        throw new RuleViolation(CalendarMessages.publishNeedsPeriods);
      }

      const today = this.clock.schoolToday(school.timezone);
      await this.lifecycle.change(
        manager,
        subject,
        statusForDates(year.startsOn, year.endsOn, today),
      );
      for (const period of topLevel) {
        await this.publishPeriod(manager, period, today);
      }

      await this.audit.record(manager, {
        action: AuditAction.AcademicCalendarPublished,
        subject: { type: YEAR_SUBJECT, id: year.id },
        context: {
          starts_on: year.startsOn,
          ends_on: year.endsOn,
          period_count: await manager.count(AcademicPeriod, {
            where: { academicYearId: year.id },
          }),
        },
        schoolId,
      });

      // The first top-level period in calendar order becomes the default.
      school.academicYearId = year.id;
      school.academicPeriodId = topLevel[0].id;
      await manager.save(school);
      return year;
    });
  }

  // Changes the dates of a year or a period (reference
  // ChangeAcademicPeriodDates). A closed one keeps its dates; one in use
  // needs a reason. The new dates must still hold the periods inside and
  // must not overlap a sibling or another year.
  async changeDates(input: {
    kind: CalendarSubject['kind'];
    id: string;
    schoolId: string;
    startsOn: string;
    endsOn: string;
    reason: string | null;
  }): Promise<CalendarSubject> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      await this.lockSchool(manager, input.schoolId);
      const subject = await this.lifecycle.lockSubject(
        manager,
        input.kind,
        input.id,
        input.schoolId,
      );
      const row = subject.row;
      if (isFrozen(row.status)) {
        throw new RuleViolation(CalendarMessages.keepsDates);
      }
      if (input.endsOn < input.startsOn) {
        throw new RuleViolation(CalendarMessages.datesEndBeforeStart);
      }
      const reason = input.reason?.trim() || null;
      if (isOperational(row.status) && !reason) {
        throw new RuleViolation(CalendarMessages.datesReason, {
          reason: [CalendarMessages.datesReason],
        });
      }

      if (subject.kind === 'academic_period') {
        const period = subject.row;
        const container = period.parentId
          ? await manager.findOneOrFail(AcademicPeriod, {
              where: { id: period.parentId },
            })
          : await manager.findOneOrFail(AcademicYear, {
              where: { id: period.academicYearId },
            });
        if (
          container.startsOn &&
          container.endsOn &&
          (input.startsOn < container.startsOn ||
            input.endsOn > container.endsOn)
        ) {
          throw new RuleViolation(
            CalendarMessages.runInside(container.startsOn, container.endsOn),
          );
        }
        await this.refuseSiblingOverlap(manager, {
          yearId: period.academicYearId,
          parentId: period.parentId,
          ignoreId: period.id,
          name: displayName(period),
          startsOn: input.startsOn,
          endsOn: input.endsOn,
        });
      } else {
        await this.refuseYearOverlap(
          manager,
          input.schoolId,
          input.startsOn,
          input.endsOn,
          row.id,
        );
      }

      const before = { starts_on: row.startsOn, ends_on: row.endsOn };
      const after = { starts_on: input.startsOn, ends_on: input.endsOn };
      if (
        before.starts_on === after.starts_on &&
        before.ends_on === after.ends_on
      ) {
        return subject;
      }
      row.startsOn = input.startsOn;
      row.endsOn = input.endsOn;
      if (subject.kind === 'academic_year') {
        subject.row.startYear = Number(input.startsOn.slice(0, 4));
        subject.row.stopYear = Number(input.endsOn.slice(0, 4));
      }
      await manager.save(row);
      await this.mustContainChildren(
        manager,
        subject.kind === 'academic_year' ? row.id : subject.row.academicYearId,
      );
      await this.audit.record(manager, {
        action: AuditAction.AcademicPeriodDatesChanged,
        subject: { type: subject.kind, id: row.id },
        context: { from: before, to: after, reason },
        schoolId: input.schoolId,
      });
      return subject;
    });
  }

  // Adds a period to a year: a top-level period (term, semester, ...) or,
  // with parentId, an exam window, holiday or reporting period inside one.
  // In a published year it takes its status from its dates, as publishing
  // would.
  async createPeriod(
    schoolId: string,
    yearId: string,
    input: PeriodInput,
  ): Promise<AcademicPeriod> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const school = await this.lockSchool(manager, schoolId);
      const { row: year } = (await this.lifecycle.lockSubject(
        manager,
        'academic_year',
        yearId,
        schoolId,
      )) as Extract<CalendarSubject, { kind: 'academic_year' }>;
      if (isFrozen(year.status)) {
        throw new RuleViolation(CalendarMessages.yearClosed);
      }

      let parent: AcademicPeriod | null = null;
      if (input.parentId) {
        parent = await manager.findOne(AcademicPeriod, {
          where: { id: input.parentId, academicYearId: year.id, schoolId },
        });
        if (!parent) {
          throw new RuleViolation(CalendarMessages.notInCalendar);
        }
        if (parent.parentId) {
          throw new RuleViolation(CalendarMessages.parentNotTopLevel);
        }
        if (isFrozen(parent.status)) {
          throw new RuleViolation(
            CalendarMessages.parentClosed(displayName(parent)),
          );
        }
      }
      this.mustBeAllowedType(input.type, parent !== null);
      const name = input.label?.trim() || input.name;
      if (input.endsOn < input.startsOn) {
        throw new RuleViolation(CalendarMessages.periodEndsBeforeStart(name));
      }
      const container = parent ?? year;
      if (
        container.startsOn &&
        container.endsOn &&
        (input.startsOn < container.startsOn || input.endsOn > container.endsOn)
      ) {
        throw new RuleViolation(
          CalendarMessages.runInside(container.startsOn, container.endsOn),
        );
      }
      await this.refuseSiblingOverlap(manager, {
        yearId: year.id,
        parentId: parent?.id ?? null,
        name,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
      });

      const position =
        input.position ??
        (await this.nextPosition(manager, year.id, parent?.id ?? null));
      const period = await manager.save(
        newInSchool(
          manager,
          AcademicPeriod,
          {
            academicYearId: year.id,
            parentId: parent?.id ?? null,
            name: input.name,
            label: input.label ?? null,
            type: input.type,
            position,
            startsOn: input.startsOn,
            endsOn: input.endsOn,
            status: 'draft',
          },
          { schoolId },
        ),
      );
      await this.audit.record(manager, {
        action: AuditAction.AcademicCalendarSaved,
        subject: { type: PERIOD_SUBJECT, id: period.id },
        context: {
          academic_year_id: year.id,
          period_created: input.name,
          parent_id: parent?.id ?? null,
        },
        schoolId,
      });

      if (year.status !== 'draft') {
        const today = this.clock.schoolToday(school.timezone);
        await this.lifecycle.change(
          manager,
          { kind: 'academic_period', row: period },
          statusForDates(input.startsOn, input.endsOn, today),
        );
      }
      return period;
    });
  }

  // Renames a period, changes its label, type or position. Dates change
  // through changeDates.
  async updatePeriod(
    schoolId: string,
    periodId: string,
    changes: Partial<
      Pick<AcademicPeriod, 'name' | 'label' | 'type' | 'position'>
    >,
  ): Promise<AcademicPeriod> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const period = await findInSchool(
        manager,
        AcademicPeriod,
        { id: periodId },
        { schoolId, lock: true, notFound: 'Academic period not found.' },
      );
      if (changes.type !== undefined) {
        this.mustBeAllowedType(changes.type, period.parentId !== null);
      }
      const changed: string[] = [];
      for (const field of ['name', 'label', 'type', 'position'] as const) {
        const value = changes[field];
        if (value !== undefined && value !== period[field]) {
          (period as unknown as Record<string, unknown>)[field] = value;
          changed.push(field);
        }
      }
      if (!changed.length) return period;
      const saved = await manager.save(period);
      await this.audit.record(manager, {
        action: AuditAction.AcademicCalendarSaved,
        subject: { type: PERIOD_SUBJECT, id: period.id },
        context: { academic_year_id: period.academicYearId, changed },
        schoolId,
      });
      return saved;
    });
  }

  // Only a draft that never changed status can go, with what is inside it.
  // Anything published is archived instead.
  async deletePeriod(schoolId: string, periodId: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const { row: period } = (await this.lifecycle.lockSubject(
        manager,
        'academic_period',
        periodId,
        schoolId,
      )) as Extract<CalendarSubject, { kind: 'academic_period' }>;
      const children = await manager.find(AcademicPeriod, {
        where: { parentId: period.id },
      });
      const all = [period, ...children];
      if (
        all.some((row) => row.status !== 'draft') ||
        (await this.hasHistory(
          manager,
          all.map((row) => row.id),
        ))
      ) {
        throw new RuleViolation(CalendarMessages.deletePeriod);
      }
      await this.refuseRemoval(manager, { year: null, periods: all });
      await manager.delete(AcademicPeriod, { id: period.id });
      await this.audit.record(manager, {
        action: AuditAction.AcademicCalendarSaved,
        subject: { type: PERIOD_SUBJECT, id: period.id },
        context: {
          academic_year_id: period.academicYearId,
          period_deleted: period.name,
        },
        schoolId,
      });
    });
  }

  async deleteYear(schoolId: string, yearId: string): Promise<void> {
    await this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const { row: year } = (await this.lifecycle.lockSubject(
        manager,
        'academic_year',
        yearId,
        schoolId,
      )) as Extract<CalendarSubject, { kind: 'academic_year' }>;
      const periods = await manager.find(AcademicPeriod, {
        where: { academicYearId: year.id },
      });
      if (
        year.status !== 'draft' ||
        periods.some((row) => row.status !== 'draft') ||
        (await this.hasHistory(manager, [
          year.id,
          ...periods.map((row) => row.id),
        ]))
      ) {
        throw new RuleViolation(CalendarMessages.deleteYear);
      }
      await this.refuseRemoval(manager, { year, periods });
      await manager.delete(AcademicYear, { id: year.id });
      await this.audit.record(manager, {
        action: AuditAction.AcademicCalendarSaved,
        subject: { type: YEAR_SUBJECT, id: year.id },
        context: { deleted: true, name: yearName(year) },
        schoolId,
      });
    });
  }

  registerRemovalGuard(guard: CalendarRemovalGuard): void {
    this.removalGuards.push(guard);
  }

  private async refuseRemoval(
    manager: EntityManager,
    removal: { year: AcademicYear | null; periods: AcademicPeriod[] },
  ): Promise<void> {
    for (const guard of this.removalGuards) {
      const refusal = await guard(manager, removal);
      if (refusal) throw new RuleViolation(refusal);
    }
  }

  topLevelPeriods(
    manager: EntityManager,
    yearId: string,
  ): Promise<AcademicPeriod[]> {
    return manager.find(AcademicPeriod, {
      where: { academicYearId: yearId, parentId: IsNull() },
      order: { position: 'ASC', startsOn: 'ASC', createdAt: 'ASC' },
    });
  }

  async lockSchool(manager: EntityManager, schoolId: string): Promise<School> {
    return manager.findOneOrFail(School, {
      where: { id: schoolId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  // Refuses dates that share a day with another year of the campus.
  async refuseYearOverlap(
    manager: EntityManager,
    schoolId: string,
    startsOn: string,
    endsOn: string,
    ignoreId?: string,
  ): Promise<void> {
    const clash = await manager
      .createQueryBuilder(AcademicYear, 'year')
      .where('year.schoolId = :schoolId', { schoolId })
      .andWhere('year.startsOn IS NOT NULL AND year.endsOn IS NOT NULL')
      .andWhere('year.startsOn <= :endsOn AND year.endsOn >= :startsOn', {
        startsOn,
        endsOn,
      })
      .andWhere(ignoreId ? 'year.id <> :ignoreId' : '1 = 1', { ignoreId })
      .getOne();
    if (clash) {
      throw new RuleViolation(CalendarMessages.yearOverlaps(yearName(clash)));
    }
  }

  private async publishPeriod(
    manager: EntityManager,
    period: AcademicPeriod,
    today: string,
  ): Promise<void> {
    if (!period.startsOn || !period.endsOn) {
      throw new RuleViolation(
        CalendarMessages.periodNeedsDates(displayName(period)),
      );
    }
    const status = statusForDates(period.startsOn, period.endsOn, today);
    await this.lifecycle.change(
      manager,
      { kind: 'academic_period', row: period },
      status,
    );
    if (isFrozen(status)) return;
    const children = await manager.find(AcademicPeriod, {
      where: { parentId: period.id },
      order: { position: 'ASC', startsOn: 'ASC' },
    });
    for (const child of children) {
      await this.publishPeriod(manager, child, today);
    }
  }

  private preparePeriods(input: CalendarInput): CalendarPeriodInput[] {
    if (!input.periods.length) {
      throw new RuleViolation(CalendarMessages.noPeriods);
    }
    for (const period of input.periods) {
      if (!TOP_LEVEL_PERIOD_TYPES.includes(period.type)) {
        throw new RuleViolation(CalendarMessages.topLevelType);
      }
      if (period.endsOn < period.startsOn) {
        throw new RuleViolation(
          CalendarMessages.periodEndsBeforeStart(period.name),
        );
      }
      if (period.startsOn < input.startsOn || period.endsOn > input.endsOn) {
        throw new RuleViolation(CalendarMessages.outsideCalendar(period.name));
      }
    }
    const sorted = [...input.periods].sort((a, b) =>
      a.startsOn.localeCompare(b.startsOn),
    );
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startsOn <= sorted[i - 1].endsOn) {
        throw new RuleViolation(
          CalendarMessages.overlaps(sorted[i].name, sorted[i - 1].name),
        );
      }
    }
    return sorted;
  }

  private mustBeAllowedType(type: PeriodType, isChild: boolean): void {
    if (isChild && !SUB_PERIOD_TYPES.includes(type)) {
      throw new RuleViolation(CalendarMessages.subPeriodType);
    }
    if (!isChild && !TOP_LEVEL_PERIOD_TYPES.includes(type)) {
      throw new RuleViolation(CalendarMessages.topLevelType);
    }
  }

  private async refuseSiblingOverlap(
    manager: EntityManager,
    span: Span & { yearId: string; parentId: string | null; ignoreId?: string },
  ): Promise<void> {
    const siblings = await manager.find(AcademicPeriod, {
      where: {
        academicYearId: span.yearId,
        parentId: span.parentId ?? IsNull(),
        ...(span.ignoreId ? { id: Not(span.ignoreId) } : {}),
      },
    });
    const dated: Span[] = siblings
      .filter((row) => row.startsOn && row.endsOn)
      .map((row) => ({
        name: displayName(row),
        startsOn: row.startsOn!,
        endsOn: row.endsOn!,
      }));
    const clash = dated.find(
      (other) => other.startsOn <= span.endsOn && other.endsOn >= span.startsOn,
    );
    if (clash) {
      throw new RuleViolation(CalendarMessages.overlaps(span.name, clash.name));
    }
  }

  // Every period of the year still fits inside the year, and every
  // sub-period inside its parent.
  private async mustContainChildren(
    manager: EntityManager,
    yearId: string,
  ): Promise<void> {
    const year = await manager.findOneOrFail(AcademicYear, {
      where: { id: yearId },
    });
    const periods = await manager.find(AcademicPeriod, {
      where: { academicYearId: yearId },
    });
    const byId = new Map(periods.map((period) => [period.id, period]));
    for (const period of periods) {
      const container = period.parentId ? byId.get(period.parentId) : year;
      if (
        !container?.startsOn ||
        !container.endsOn ||
        !period.startsOn ||
        !period.endsOn
      ) {
        continue;
      }
      if (
        period.startsOn < container.startsOn ||
        period.endsOn > container.endsOn
      ) {
        throw new RuleViolation(
          CalendarMessages.childOutside(displayName(period)),
        );
      }
    }
    const overlap = firstOverlap(
      periods
        .filter(
          (period) =>
            period.parentId === null && period.startsOn && period.endsOn,
        )
        .map((period) => ({
          name: displayName(period),
          startsOn: period.startsOn!,
          endsOn: period.endsOn!,
        })),
    );
    if (overlap) {
      throw new RuleViolation(
        CalendarMessages.overlaps(overlap[0].name, overlap[1].name),
      );
    }
  }

  private async nextPosition(
    manager: EntityManager,
    yearId: string,
    parentId: string | null,
  ): Promise<number> {
    const row = await manager
      .createQueryBuilder(AcademicPeriod, 'period')
      .select('COALESCE(MAX(period.position), 0)', 'max')
      .where('period.academicYearId = :yearId', { yearId })
      .andWhere(
        parentId ? 'period.parentId = :parentId' : 'period.parentId IS NULL',
        {
          parentId,
        },
      )
      .getRawOne<{ max: number }>();
    return Number(row?.max ?? 0) + 1;
  }

  private async hasHistory(
    manager: EntityManager,
    ids: string[],
  ): Promise<boolean> {
    return manager.exists(AcademicPeriodStatusChange, {
      where: { periodId: In(ids) },
    });
  }
}
