import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import {
  type RosterMode,
  allowsRosterMode,
  isFrozen,
} from '../academic/academic.constants.js';
import { AcademicYear } from '../academic/entities/academic-year.entity.js';
import { InstructionalModels } from '../academic/instructional-models.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { findInSchool, newInSchool } from '../common/tenancy/school-scope.js';
import { EXCEPTION_SUBJECT } from './curriculum.constants.js';
import { AcademicLevel } from './entities/academic-level.entity.js';
import { InstructionalModelException } from './entities/instructional-model-exception.entity.js';
import { Subject } from './entities/subject.entity.js';

export const EXCEPTION_NOT_FOUND = 'Exception not found.';

export const ExceptionMessages = {
  reason: 'Say why this subject is taught differently.',
  notNeeded: 'The campus model already allows this, so no exception is needed.',
  closed: 'This cycle is closed.',
  revoked: 'This exception was already taken back.',
} as const;

export interface GrantInput {
  subjectId: string;
  rosterMode: RosterMode;
  academicLevelId?: string | null;
  reason: string;
}

// The subjects a campus lets out of its teaching model for one school year
// (reference GrantOfferingException, OfferingExceptions). The model itself
// does not move.
@Injectable()
export class OfferingExceptions {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly models: InstructionalModels,
    private readonly audit: AuditService,
  ) {}

  // A running exception for the subject and roster, naming this level or
  // no level (every level).
  allows(
    manager: EntityManager,
    year: AcademicYear,
    subjectId: string,
    levelId: string,
    mode: RosterMode,
  ): Promise<boolean> {
    return manager
      .createQueryBuilder(InstructionalModelException, 'exception')
      .where('exception.schoolId = :schoolId', { schoolId: year.schoolId })
      .andWhere('exception.academicYearId = :yearId', { yearId: year.id })
      .andWhere('exception.subjectId = :subjectId', { subjectId })
      .andWhere('exception.rosterMode = :mode', { mode })
      .andWhere('exception.revokedAt IS NULL')
      .andWhere(
        '(exception.academicLevelId IS NULL OR exception.academicLevelId = :levelId)',
        { levelId },
      )
      .getExists();
  }

  // The year's exceptions, newest first.
  async list(
    schoolId: string,
    yearId: string,
  ): Promise<InstructionalModelException[]> {
    const manager = this.dataSource.manager;
    await this.year(manager, schoolId, yearId);
    return manager.find(InstructionalModelException, {
      where: { schoolId, academicYearId: yearId },
      relations: { subject: true, academicLevel: true, grantedBy: true },
      withDeleted: true,
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  // Grants the exception; one already running for the same subject, roster
  // and level is returned instead (created: false).
  async grant(
    actorId: string,
    schoolId: string,
    yearId: string,
    input: GrantInput,
  ): Promise<{ exception: InstructionalModelException; created: boolean }> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const reason = input.reason.trim();
      if (!reason) {
        throw new RuleViolation(ExceptionMessages.reason, {
          reason: [ExceptionMessages.reason],
        });
      }
      const year = await this.year(manager, schoolId, yearId, true);
      const subject = await findInSchool(
        manager,
        Subject,
        { id: input.subjectId },
        { schoolId, notFound: 'Subject not found.' },
      );
      const level = input.academicLevelId
        ? await findInSchool(
            manager,
            AcademicLevel,
            { id: input.academicLevelId },
            { schoolId, notFound: 'Academic level not found.' },
          )
        : null;
      const model = await this.models.modelFor(manager, year);
      if (allowsRosterMode(model, input.rosterMode)) {
        throw new RuleViolation(ExceptionMessages.notNeeded);
      }
      if (isFrozen(year.status)) {
        throw new RuleViolation(ExceptionMessages.closed);
      }
      const existing = await manager.findOne(InstructionalModelException, {
        where: {
          academicYearId: year.id,
          subjectId: subject.id,
          rosterMode: input.rosterMode,
          academicLevelId: level ? level.id : IsNull(),
          revokedAt: IsNull(),
        },
      });
      if (existing) return { exception: existing, created: false };

      const exception = await manager.save(
        newInSchool(
          manager,
          InstructionalModelException,
          {
            academicYearId: year.id,
            subjectId: subject.id,
            academicLevelId: level?.id ?? null,
            rosterMode: input.rosterMode,
            reason,
            grantedById: actorId,
          },
          { schoolId },
        ),
      );
      await this.audit.record(manager, {
        action: AuditAction.OfferingExceptionGranted,
        subject: { type: EXCEPTION_SUBJECT, id: exception.id },
        context: {
          subject: subject.name,
          roster_mode: input.rosterMode,
          level: level?.name ?? null,
          reason,
        },
        schoolId,
      });
      return { exception, created: true };
    });
  }

  // Takes the exception back. Offerings made under it keep running.
  async revoke(
    actorId: string,
    schoolId: string,
    yearId: string,
    exceptionId: string,
  ): Promise<InstructionalModelException> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const exception = await findInSchool(
        manager,
        InstructionalModelException,
        { id: exceptionId, academicYearId: yearId },
        { schoolId, lock: true, notFound: EXCEPTION_NOT_FOUND },
      );
      if (exception.revokedAt) {
        throw new RuleViolation(ExceptionMessages.revoked);
      }
      exception.revokedAt = new Date();
      exception.revokedById = actorId;
      const saved = await manager.save(exception);
      await this.audit.record(manager, {
        action: AuditAction.OfferingExceptionRevoked,
        subject: { type: EXCEPTION_SUBJECT, id: exception.id },
        context: { subject_id: exception.subjectId },
        schoolId,
      });
      return saved;
    });
  }

  private year(
    manager: EntityManager,
    schoolId: string,
    yearId: string,
    lock = false,
  ): Promise<AcademicYear> {
    return findInSchool(
      manager,
      AcademicYear,
      { id: yearId },
      { schoolId, lock, notFound: 'Academic year not found.' },
    );
  }
}
