import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { GuardianLink } from './entities/guardian-link.entity.js';
import { ParentRecord } from './entities/parent-record.entity.js';
import { StudentRecord } from './entities/student-record.entity.js';

export const GuardianMessages = {
  notHere: 'This learner does not attend this school.',
} as const;

// What else ends with a guardian link, inside the same transaction. Stage
// 13 registers: the guardian's open portal requests for that learner are
// cancelled.
export type GuardianUnlinkHook = (
  manager: EntityManager,
  link: { guardianId: string; learnerId: string; actorId: string | null },
) => Promise<void>;

// Guardians and the learners they look after (reference
// ChangeGuardianLink, ParentRecord). A link needs a learner with an
// enrollment at this campus, in any state, so a guardian stays linked to a
// graduate. Linking twice or unlinking a missing link changes nothing.
@Injectable()
export class GuardianLinks {
  private readonly unlinkHooks: GuardianUnlinkHook[] = [];

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
  ) {}

  registerUnlinkHook(hook: GuardianUnlinkHook): void {
    this.unlinkHooks.push(hook);
  }

  // The person's one guardian record, made when missing, held until the
  // transaction ends.
  async parentRecordIn(
    manager: EntityManager,
    userId: string,
  ): Promise<ParentRecord> {
    await manager.query(
      `INSERT INTO parent_records (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    return manager.findOneOrFail(ParentRecord, {
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  // The guardian's learners who have an enrollment at this campus.
  async children(
    schoolId: string,
    guardianId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<StudentRecord[]> {
    return manager
      .createQueryBuilder(StudentRecord, 'enrollment')
      .where('enrollment.schoolId = :schoolId', { schoolId })
      .andWhere(`enrollment.userId IN (${LINKED_LEARNERS})`, { guardianId })
      .orderBy('enrollment.createdAt', 'ASC')
      .getMany();
  }

  async link(
    actorId: string | null,
    schoolId: string,
    guardianId: string,
    studentId: string,
  ): Promise<void> {
    await this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const record = await this.parentRecordIn(manager, guardianId);
      const learner = await this.learnerHere(manager, schoolId, studentId);
      const linked = await manager.exists(GuardianLink, {
        where: { parentRecordId: record.id, userId: learner.userId },
      });
      if (linked) return;
      await manager.insert(GuardianLink, {
        parentRecordId: record.id,
        userId: learner.userId,
      });
      await this.audit.record(manager, {
        action: AuditAction.GuardianLinkChanged,
        subject: { type: 'user', id: guardianId },
        context: { learner_id: learner.userId, linked: true },
        schoolId,
        ...(actorId === null ? { actorId } : {}),
      });
    });
  }

  async unlink(
    actorId: string,
    schoolId: string,
    guardianId: string,
    studentId: string,
  ): Promise<void> {
    await this.transactions.run(async (tx) => {
      const learner = await this.learnerHere(tx.manager, schoolId, studentId);
      await this.unlinkIn(
        tx.manager,
        actorId,
        schoolId,
        guardianId,
        learner.userId,
      );
    });
  }

  // Inside the caller's transaction (removing a parent unlinks their
  // learners here first).
  async unlinkIn(
    manager: EntityManager,
    actorId: string | null,
    schoolId: string,
    guardianId: string,
    learnerId: string,
  ): Promise<void> {
    const record = await this.parentRecordIn(manager, guardianId);
    const removed = await manager.delete(GuardianLink, {
      parentRecordId: record.id,
      userId: learnerId,
    });
    if (!removed.affected) return;
    await this.audit.record(manager, {
      action: AuditAction.GuardianLinkChanged,
      subject: { type: 'user', id: guardianId },
      context: { learner_id: learnerId, linked: false },
      schoolId,
    });
    for (const hook of this.unlinkHooks) {
      await hook(manager, { guardianId, learnerId, actorId });
    }
  }

  // Every learner of this campus the guardian is linked to.
  async unlinkEveryoneHereIn(
    manager: EntityManager,
    actorId: string,
    schoolId: string,
    guardianId: string,
  ): Promise<void> {
    const learners = await this.children(schoolId, guardianId, manager);
    const ids = [...new Set(learners.map((learner) => learner.userId))];
    for (const learnerId of ids) {
      await this.unlinkIn(manager, actorId, schoolId, guardianId, learnerId);
    }
  }

  // A person who reads learners only as their guardian
  // (User::readsLearnersOnlyAsGuardian): the parent role at this campus,
  // and no role here or above it other than parent and student. A teacher
  // who is also a parent keeps the reach of their staff role.
  async readsOnlyAsGuardian(
    userId: string,
    schoolId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<boolean> {
    const [row] = (await manager.query(
      `SELECT coalesce(bool_or(r.name = 'parent' AND a.school_id = $2), false) AS parent,
              coalesce(bool_and(r.name IN ('parent', 'student')), true) AS portal_only
         FROM model_has_roles a JOIN roles r ON r.id = a.role_id
        WHERE a.user_id = $1 AND (a.school_id = $2 OR a.school_id IS NULL)`,
      [userId, schoolId],
    )) as Array<{ parent: boolean; portal_only: boolean }>;
    return row.parent && row.portal_only;
  }

  async isLinked(
    guardianId: string,
    learnerId: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<boolean> {
    const [row] = (await manager.query(
      `SELECT EXISTS (
         SELECT 1 FROM parent_record_user link
           JOIN parent_records record ON record.id = link.parent_record_id
          WHERE record.user_id = $1 AND link.user_id = $2) AS linked`,
      [guardianId, learnerId],
    )) as Array<{ linked: boolean }>;
    return row.linked;
  }

  private async learnerHere(
    manager: EntityManager,
    schoolId: string,
    studentId: string,
  ): Promise<StudentRecord> {
    const learner = await manager.findOne(StudentRecord, {
      where: { id: studentId, schoolId },
    });
    if (!learner) throw new RuleViolation(GuardianMessages.notHere);
    return learner;
  }
}

// The learners a guardian (:guardianId) is linked to, as a subquery.
export const LINKED_LEARNERS = `SELECT link.user_id FROM parent_record_user link
  JOIN parent_records record ON record.id = link.parent_record_id
  WHERE record.user_id = :guardianId`;
