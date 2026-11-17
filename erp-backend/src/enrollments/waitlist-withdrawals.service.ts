import { Injectable } from '@nestjs/common';
import { type EntityManager, In } from 'typeorm';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { AdmissionWaitlistEntry } from './entities/admission-waitlist-entry.entity.js';
import {
  OPEN_WAITLIST_STATUSES,
  WAITLIST_SUBJECT,
} from './moving.constants.js';

export const ENROLLED_WHILE_WAITING = 'Enrolled in this school while waiting.';

// A learner placed or taken back at a campus no longer waits for a seat
// there (reference DeclineWaitlistEntry::withdrawForEnrolled). Its own file,
// so placements and status changes can call it without depending on the
// waitlist, which depends on them.
@Injectable()
export class WaitlistWithdrawals {
  constructor(
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async withdrawForEnrolledIn(
    manager: EntityManager,
    enrollment: { schoolId: string; userId: string },
    actorId?: string | null,
  ): Promise<void> {
    const entries = await manager.find(AdmissionWaitlistEntry, {
      where: {
        schoolId: enrollment.schoolId,
        userId: enrollment.userId,
        status: In([...OPEN_WAITLIST_STATUSES]),
      },
      order: { position: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    for (const entry of entries) {
      await this.withdrawIn(manager, entry, ENROLLED_WHILE_WAITING, actorId);
    }
  }

  async withdrawIn(
    manager: EntityManager,
    entry: AdmissionWaitlistEntry,
    reason: string,
    actorId?: string | null,
  ): Promise<void> {
    entry.status = 'withdrawn';
    entry.decidedAt = this.clock.now();
    entry.decidedById = actorId ?? null;
    entry.decisionReason = reason;
    await manager.save(entry);
    await this.audit.record(manager, {
      action: AuditAction.AdmissionWaitlistDeclined,
      subject: { type: WAITLIST_SUBJECT, id: entry.id },
      context: { reason },
      schoolId: entry.schoolId,
      ...(actorId !== undefined ? { actorId } : {}),
    });
  }
}
