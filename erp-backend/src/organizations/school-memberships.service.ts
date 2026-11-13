import { Injectable } from '@nestjs/common';
import { EntityManager, Not } from 'typeorm';
import { RoleAuthority } from '../access/role-authority.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { SchoolMembership } from './entities/school-membership.entity.js';

export const MEMBERSHIP_SUBJECT = 'school_membership';

// Campus access for a person (reference GrantSchoolMembership,
// EndSchoolMembership). Calls run inside the caller's transaction.
// Work a later stage ends with the membership, inside the same transaction
// (Stage 4: teaching assignments and class-teacher duties).
export type MembershipEndHook = (
  manager: EntityManager,
  userId: string,
  schoolId: string,
) => Promise<void>;

@Injectable()
export class SchoolMemberships {
  private readonly endHooks: MembershipEndHook[] = [];

  constructor(
    private readonly authority: RoleAuthority,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  // Grants or reactivates access, so it is safe to repeat. A person's first
  // campus becomes their primary one; `primary` makes this one primary.
  async grant(
    manager: EntityManager,
    userId: string,
    schoolId: string,
    options: { primary?: boolean } = {},
  ): Promise<SchoolMembership> {
    const existing = await manager.findOne(SchoolMembership, {
      where: { userId, schoolId },
      lock: { mode: 'pessimistic_write' },
    });
    const wasActive = existing?.status === 'active';
    const membership =
      existing ?? manager.create(SchoolMembership, { userId, schoolId });
    membership.status = 'active';
    membership.endedAt = null;
    membership.joinedAt ??= this.clock.now();

    const isFirstMembership = !(await manager.exists(SchoolMembership, {
      where: { userId, schoolId: Not(schoolId) },
    }));
    if ((options.primary || isFirstMembership) && !membership.isPrimary) {
      // One primary campus per person: clear the old one first.
      await manager.update(
        SchoolMembership,
        { userId, isPrimary: true },
        { isPrimary: false },
      );
      membership.isPrimary = true;
    }
    const saved = await manager.save(membership);

    if (!wasActive) {
      await this.audit.record(manager, {
        action: AuditAction.SchoolMembershipGranted,
        subject: { type: MEMBERSHIP_SUBJECT, id: saved.id },
        context: {
          user_id: userId,
          school_id: schoolId,
          primary: saved.isPrimary,
          reactivated: existing !== null,
        },
        schoolId,
      });
    }
    return saved;
  }

  registerEndHook(hook: MembershipEndHook): void {
    this.endHooks.push(hook);
  }

  // Ends access to the campus; the person, their roles and their records
  // stay. Refused when nobody left at the campus could manage roles.
  // Returns null when there was no membership.
  async end(
    manager: EntityManager,
    userId: string,
    schoolId: string,
  ): Promise<SchoolMembership | null> {
    return this.authority.mustKeepARoleManager(manager, schoolId, async () => {
      const membership = await manager.findOne(SchoolMembership, {
        where: { userId, schoolId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!membership || membership.status === 'ended') return membership;

      membership.status = 'ended';
      membership.endedAt = this.clock.now();
      membership.isPrimary = false;
      const saved = await manager.save(membership);
      await this.promoteAnotherPrimary(manager, userId);
      for (const hook of this.endHooks) await hook(manager, userId, schoolId);

      await this.audit.record(manager, {
        action: AuditAction.SchoolMembershipEnded,
        subject: { type: MEMBERSHIP_SUBJECT, id: saved.id },
        context: { user_id: userId, school_id: schoolId },
        schoolId,
      });
      return saved;
    });
  }

  // The person keeps a campus to open by default when they have another.
  private async promoteAnotherPrimary(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const hasPrimary = await manager.exists(SchoolMembership, {
      where: { userId, status: 'active', isPrimary: true },
    });
    if (hasPrimary) return;
    const next = await manager.findOne(SchoolMembership, {
      where: { userId, status: 'active' },
      order: { createdAt: 'ASC' },
    });
    if (next)
      await manager.update(SchoolMembership, next.id, { isPrimary: true });
  }
}
