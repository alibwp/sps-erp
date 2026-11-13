import { Injectable } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { Forbidden } from '../access/access.constants.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { currentRequest } from '../common/request-context/request-context.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { findInSchool } from '../common/tenancy/school-scope.js';
import {
  type AcademicStatus,
  canMoveTo,
  isFrozen,
  requiresReasonToReach,
} from './academic.constants.js';
import {
  ClosureReadiness,
  type ClosureFinding,
} from './closure-readiness.service.js';
import {
  AcademicPeriod,
  displayName,
} from './entities/academic-period.entity.js';
import {
  AcademicPeriodStatusChange,
  type PeriodKind,
} from './entities/academic-period-status-change.entity.js';
import { AcademicYear } from './entities/academic-year.entity.js';

export type CalendarSubject =
  | { kind: 'academic_year'; row: AcademicYear }
  | { kind: 'academic_period'; row: AcademicPeriod };

export interface ChangeOptions {
  actorId?: string | null;
  reason?: string | null;
  checklist?: ClosureFinding[] | null;
}

export const LifecycleMessages = {
  cannotMove: (from: AcademicStatus, to: AcademicStatus) =>
    `An academic period cannot move from ${from} to ${to}.`,
  reasonNeeded: 'Say why this period is being reopened.',
  yearClosed: 'Reopen the academic year before you reopen this period.',
  parentClosed: (parent: string) =>
    `Reopen ${parent} before you reopen this period.`,
  notReady: (summaries: string) =>
    `This period is not ready to close. ${summaries}`,
} as const;

// The campus permissions each target status needs (reference
// AcademicYearPolicy/AcademicPeriodPolicy close and reopen; the other moves
// are edits of the year or period).
export function permissionsFor(
  kind: PeriodKind,
  from: AcademicStatus,
  to: AcademicStatus,
): string[] {
  if (to === 'closing' || to === 'closed' || to === 'archived') {
    return ['close academic period'];
  }
  if (to === 'open' && (from === 'closing' || from === 'closed')) {
    return ['reopen academic period'];
  }
  return [
    kind === 'academic_year'
      ? 'update academic year'
      : 'update academic period',
  ];
}

// Moves years and periods between states (reference
// ChangeAcademicPeriodStatus). Every move writes a history row and an audit
// event; closing or archiving takes the periods inside along in the same
// transaction.
@Injectable()
export class AcademicLifecycle {
  constructor(
    private readonly transactions: TransactionService,
    private readonly readiness: ClosureReadiness,
    private readonly audit: AuditService,
  ) {}

  // The API's status change: checks the permission the move needs, runs
  // the readiness check on a close, and locks the year and its periods.
  async transition(input: {
    kind: PeriodKind;
    id: string;
    schoolId: string;
    to: AcademicStatus;
    reason: string | null;
    force: boolean;
    actorId: string;
    permissions: ReadonlySet<string>;
  }): Promise<CalendarSubject> {
    return this.transactions.run(async (tx) => {
      const subject = await this.lockSubject(
        tx.manager,
        input.kind,
        input.id,
        input.schoolId,
      );
      const needed = permissionsFor(input.kind, subject.row.status, input.to);
      if (!needed.some((permission) => input.permissions.has(permission))) {
        throw new Forbidden();
      }
      const options = { actorId: input.actorId, reason: input.reason };
      if (input.to === 'closed' && subject.row.status !== 'closed') {
        await this.close(tx.manager, subject, {
          ...options,
          force: input.force,
        });
      } else {
        await this.change(tx.manager, subject, input.to, options);
      }
      return subject;
    });
  }

  // Locks the year, then every period of it, so a cascade never waits on a
  // row another change holds in the other order. Another campus's year or
  // period is 404.
  async lockSubject(
    manager: EntityManager,
    kind: PeriodKind,
    id: string,
    schoolId: string,
  ): Promise<CalendarSubject> {
    if (kind === 'academic_year') {
      const year = await findInSchool(
        manager,
        AcademicYear,
        { id },
        { schoolId, lock: true, notFound: 'Academic year not found.' },
      );
      await this.lockPeriodsOf(manager, year.id);
      return { kind, row: year };
    }
    const period = await findInSchool(
      manager,
      AcademicPeriod,
      { id },
      { schoolId, notFound: 'Academic period not found.' },
    );
    await manager.findOne(AcademicYear, {
      where: { id: period.academicYearId },
      lock: { mode: 'pessimistic_write' },
    });
    await this.lockPeriodsOf(manager, period.academicYearId);
    const locked = await manager.findOneOrFail(AcademicPeriod, {
      where: { id },
    });
    return { kind, row: locked };
  }

  async close(
    manager: EntityManager,
    subject: CalendarSubject,
    options: ChangeOptions & { force?: boolean },
  ): Promise<void> {
    const checklist =
      subject.kind === 'academic_year'
        ? await this.readiness.forYear(manager, subject.row)
        : await this.readiness.forPeriod(manager, subject.row);
    const blocking = checklist.filter((finding) => finding.blocking);
    if (blocking.length && !options.force) {
      throw new RuleViolation(
        LifecycleMessages.notReady(
          blocking.map((finding) => finding.summary).join(' '),
        ),
      );
    }
    await this.change(manager, subject, 'closed', { ...options, checklist });
  }

  // Moves one year or period, writes its history row and audit event, and
  // takes its children along to a frozen state. A repeated move to the
  // current state changes nothing.
  async change(
    manager: EntityManager,
    subject: CalendarSubject,
    to: AcademicStatus,
    options: ChangeOptions = {},
  ): Promise<void> {
    const from = subject.row.status;
    if (from === to) return;
    await this.refuseImpossibleMove(manager, subject, from, to, options.reason);

    subject.row.status = to;
    await manager.save(subject.row);
    const reason = options.reason?.trim() || null;
    await manager.insert(AcademicPeriodStatusChange, {
      periodType: subject.kind,
      periodId: subject.row.id,
      fromStatus: from,
      toStatus: to,
      // The signed-in person unless the caller names someone (null: a job).
      changedById:
        options.actorId !== undefined
          ? options.actorId
          : (currentRequest()?.userId ?? null),
      reason,
      checklist: options.checklist ?? null,
    });
    await this.audit.record(manager, {
      action: AuditAction.AcademicPeriodStatusChanged,
      subject: { type: subject.kind, id: subject.row.id },
      context: {
        from,
        to,
        reason,
        checklist: options.checklist ?? null,
      },
      schoolId: subject.row.schoolId,
      ...(options.actorId !== undefined ? { actorId: options.actorId } : {}),
    });

    if (isFrozen(to)) {
      for (const child of await this.childrenOf(manager, subject)) {
        if (child.status === to || !canMoveTo(child.status, to)) continue;
        await this.change(
          manager,
          { kind: 'academic_period', row: child },
          to,
          { actorId: options.actorId, reason: options.reason },
        );
      }
    }
  }

  private async refuseImpossibleMove(
    manager: EntityManager,
    subject: CalendarSubject,
    from: AcademicStatus,
    to: AcademicStatus,
    reason: string | null | undefined,
  ): Promise<void> {
    if (!canMoveTo(from, to)) {
      throw new RuleViolation(LifecycleMessages.cannotMove(from, to));
    }
    if (requiresReasonToReach(from, to) && !reason?.trim()) {
      throw new RuleViolation(LifecycleMessages.reasonNeeded, {
        reason: [LifecycleMessages.reasonNeeded],
      });
    }
    if (subject.kind !== 'academic_period' || isFrozen(to)) return;

    const year = await manager.findOneOrFail(AcademicYear, {
      where: { id: subject.row.academicYearId },
    });
    if (isFrozen(year.status)) {
      throw new RuleViolation(LifecycleMessages.yearClosed);
    }
    if (subject.row.parentId) {
      const parent = await manager.findOneOrFail(AcademicPeriod, {
        where: { id: subject.row.parentId },
      });
      if (isFrozen(parent.status)) {
        throw new RuleViolation(
          LifecycleMessages.parentClosed(displayName(parent)),
        );
      }
    }
  }

  private childrenOf(
    manager: EntityManager,
    subject: CalendarSubject,
  ): Promise<AcademicPeriod[]> {
    return manager.find(AcademicPeriod, {
      where:
        subject.kind === 'academic_year'
          ? { academicYearId: subject.row.id, parentId: IsNull() }
          : { parentId: subject.row.id },
      order: { position: 'ASC', startsOn: 'ASC', createdAt: 'ASC' },
    });
  }

  private async lockPeriodsOf(
    manager: EntityManager,
    yearId: string,
  ): Promise<void> {
    await manager.find(AcademicPeriod, {
      where: { academicYearId: yearId },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
  }
}
