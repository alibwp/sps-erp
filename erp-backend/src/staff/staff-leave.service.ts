import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager, In } from 'typeorm';
import { Forbidden } from '../access/access.constants.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import {
  RuleViolation,
  ValidationFailed,
} from '../common/errors/api-exception.js';
import {
  type Paginated,
  type PaginationQueryDto,
  paginate,
} from '../common/pagination/pagination.js';
import { findInSchool } from '../common/tenancy/school-scope.js';
import { shortDay } from '../enrollments/learners.js';
import { School } from '../organizations/entities/school.entity.js';
import { StaffLeaveRequest } from './entities/staff-leave-request.entity.js';
import { StaffLeaveStatusChange } from './entities/staff-leave-status-change.entity.js';
import { StaffProfile } from './entities/staff-profile.entity.js';
import {
  HOLDING_LEAVE,
  type LeaveStatus,
  type LeaveType,
  STAFF_LEAVE_SUBJECT,
  canMoveLeave,
  leaveLabel,
} from './staff.constants.js';

export const LEAVE_NOT_FOUND = 'Leave request not found.';
export const STAFF_PROFILE_NOT_FOUND = 'Staff record not found.';

export const LeaveMessages = {
  endsBeforeStart: 'Leave cannot end before it starts.',
  left: 'This person no longer works here.',
  clash: 'These days are already asked for.',
  cannotMove: (from: LeaveStatus, to: LeaveStatus) =>
    `Leave cannot move from ${leaveLabel(from)} to ${leaveLabel(to)}.`,
  personLeft: (day: string) => `The person left on ${shortDay(day)}.`,
} as const;

// Asked before leave is approved; answers why not, or null. Stage 8
// registers: the person still covers lessons in those days.
export type LeaveApprovalCheck = (
  manager: EntityManager,
  request: StaffLeaveRequest,
  context: { userId: string; from: string; to: string },
) => Promise<string | null>;

export interface LeaveActor {
  id: string;
  permissions: ReadonlySet<string>;
}

export const APPROVE_STAFF_LEAVE = 'approve staff leave';

// Staff leave (reference ManageStaffLeave). Requested, then approved,
// declined or cancelled; approved, then taken or cancelled; declined can be
// asked for again. Nobody decides their own leave.
@Injectable()
export class StaffLeave {
  private readonly approvalChecks: LeaveApprovalCheck[] = [];

  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  registerApprovalCheck(check: LeaveApprovalCheck): void {
    this.approvalChecks.push(check);
  }

  list(
    schoolId: string,
    query: PaginationQueryDto & {
      status?: LeaveStatus;
      type?: LeaveType;
      staffProfileId?: string;
    },
  ): Promise<Paginated<StaffLeaveRequest>> {
    const qb = this.dataSource.manager
      .createQueryBuilder(StaffLeaveRequest, 'leave')
      .innerJoinAndSelect('leave.staffProfile', 'profile')
      .innerJoinAndSelect('profile.user', 'person')
      .leftJoinAndSelect('leave.decidedBy', 'decider')
      .leftJoinAndSelect('leave.requestedBy', 'requester')
      .withDeleted()
      .where('leave.schoolId = :schoolId', { schoolId });
    if (query.status) {
      qb.andWhere('leave.status = :status', { status: query.status });
    }
    if (query.type) qb.andWhere('leave.type = :type', { type: query.type });
    if (query.staffProfileId) {
      qb.andWhere('leave.staffProfileId = :profileId', {
        profileId: query.staffProfileId,
      });
    }
    return paginate(
      qb,
      query,
      { startsOn: 'leave.startsOn', createdAt: 'leave.createdAt' },
      [{ column: 'leave.startsOn', direction: 'DESC' }],
    );
  }

  // One request with its people; the person it is for may always read it.
  async find(
    schoolId: string,
    id: string,
    viewer: LeaveActor,
  ): Promise<StaffLeaveRequest> {
    const manager = this.dataSource.manager;
    await findInSchool(
      manager,
      StaffLeaveRequest,
      { id },
      { schoolId, notFound: LEAVE_NOT_FOUND },
    );
    const request = await manager.findOneOrFail(StaffLeaveRequest, {
      where: { id },
      relations: {
        staffProfile: { user: true },
        requestedBy: true,
        decidedBy: true,
      },
      withDeleted: true,
    });
    if (
      !viewer.permissions.has('read staff leave') &&
      request.staffProfile.userId !== viewer.id
    ) {
      throw new Forbidden();
    }
    return request;
  }

  history(id: string): Promise<StaffLeaveStatusChange[]> {
    return this.dataSource.manager.find(StaffLeaveStatusChange, {
      where: { staffLeaveRequestId: id },
      relations: { changedBy: true },
      withDeleted: true,
      order: { createdAt: 'ASC' },
    });
  }

  async request(
    actorId: string,
    schoolId: string,
    input: {
      staffProfileId: string;
      type: LeaveType;
      startsOn: string;
      endsOn: string;
      reason?: string | null;
    },
  ): Promise<StaffLeaveRequest> {
    if (input.endsOn < input.startsOn) {
      throw new ValidationFailed({ endsOn: [LeaveMessages.endsBeforeStart] });
    }
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      // Two requests for one person wait for each other here, so the
      // second sees the first when it looks for a clash.
      const profile = await findInSchool(
        manager,
        StaffProfile,
        { id: input.staffProfileId },
        { schoolId, lock: true, notFound: STAFF_PROFILE_NOT_FOUND },
      );
      if (profile.status === 'left') {
        throw new RuleViolation(LeaveMessages.left);
      }
      await this.refuseAClash(
        manager,
        profile.id,
        input.startsOn,
        input.endsOn,
      );
      const request = await manager.save(
        manager.create(StaffLeaveRequest, {
          schoolId,
          staffProfileId: profile.id,
          type: input.type,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
          reason: input.reason?.trim() || null,
          requestedById: actorId,
          status: 'requested',
        }),
      );
      await this.audit.record(manager, {
        action: AuditAction.StaffLeaveRequested,
        subject: { type: STAFF_LEAVE_SUBJECT, id: request.id },
        context: {
          type: input.type,
          days: daysBetween(input.startsOn, input.endsOn),
        },
        schoolId,
      });
      return request;
    });
  }

  // A change asked for through the leave routes, checked against who may
  // make it.
  async changeStatus(
    actor: LeaveActor,
    schoolId: string,
    id: string,
    status: LeaveStatus,
    reason: string | null,
  ): Promise<StaffLeaveRequest> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const request = await findInSchool(
        manager,
        StaffLeaveRequest,
        { id },
        { schoolId, lock: true, notFound: LEAVE_NOT_FOUND },
      );
      const profile = await manager.findOneOrFail(StaffProfile, {
        where: { id: request.staffProfileId },
      });
      this.mustBeAllowed(actor, profile, status);
      return this.changeIn(manager, request, profile, status, actor.id, reason);
    });
  }

  // Requested and approved leave ending after a leaver's last day is
  // cancelled (ManageStaffProfile::withdrawLeaveAfter).
  async cancelHeldAfterIn(
    manager: EntityManager,
    profile: StaffProfile,
    leftOn: string,
    actorId: string | null,
  ): Promise<void> {
    const held = await manager.find(StaffLeaveRequest, {
      where: {
        staffProfileId: profile.id,
        status: In(['requested', 'approved']),
      },
      lock: { mode: 'pessimistic_write' },
    });
    for (const request of held) {
      if (request.endsOn <= leftOn) continue;
      await this.changeIn(
        manager,
        request,
        profile,
        'cancelled',
        actorId,
        LeaveMessages.personLeft(leftOn),
      );
    }
  }

  private mustBeAllowed(
    actor: LeaveActor,
    profile: StaffProfile,
    status: LeaveStatus,
  ): void {
    const approver = actor.permissions.has(APPROVE_STAFF_LEAVE);
    const own = profile.userId === actor.id;
    const allowed =
      status === 'approved' || status === 'declined'
        ? approver && !own
        : status === 'taken'
          ? approver
          : approver || own;
    if (!allowed) throw new Forbidden();
  }

  private async changeIn(
    manager: EntityManager,
    request: StaffLeaveRequest,
    profile: StaffProfile,
    status: LeaveStatus,
    actorId: string | null,
    reason: string | null,
  ): Promise<StaffLeaveRequest> {
    const current = request.status;
    if (current === status) return request;
    if (!canMoveLeave(current, status)) {
      throw new RuleViolation(LeaveMessages.cannotMove(current, status));
    }
    if (current === 'declined' && status === 'requested') {
      await this.refuseAClash(
        manager,
        profile.id,
        request.startsOn,
        request.endsOn,
        request.id,
      );
    }
    if (status === 'approved') {
      const school = await manager.findOneOrFail(School, {
        where: { id: request.schoolId },
      });
      const today = this.clock.schoolToday(school.timezone);
      const from = request.startsOn > today ? request.startsOn : today;
      for (const check of this.approvalChecks) {
        const refusal = await check(manager, request, {
          userId: profile.userId,
          from,
          to: request.endsOn,
        });
        if (refusal) throw new RuleViolation(refusal);
      }
    }
    const note = reason?.trim() || null;
    request.status = status;
    if (status === 'approved' || status === 'declined') {
      request.decidedById = actorId;
      request.decidedAt = this.clock.now();
      request.decisionNote = note;
    }
    const saved = await manager.save(request);
    await manager.insert(StaffLeaveStatusChange, {
      staffLeaveRequestId: request.id,
      fromStatus: current,
      toStatus: status,
      reason: note,
      changedById: actorId,
    });
    await this.audit.record(manager, {
      action: AuditAction.StaffLeaveStatusChanged,
      subject: { type: STAFF_LEAVE_SUBJECT, id: request.id },
      context: { from: current, to: status, reason: note },
      schoolId: request.schoolId,
      ...(actorId === null ? { actorId } : {}),
    });
    return saved;
  }

  private async refuseAClash(
    manager: EntityManager,
    profileId: string,
    startsOn: string,
    endsOn: string,
    except?: string,
  ): Promise<void> {
    const overlapping = await manager
      .createQueryBuilder(StaffLeaveRequest, 'leave')
      .where('leave.staffProfileId = :profileId', { profileId })
      .andWhere('leave.status IN (:...holding)', {
        holding: [...HOLDING_LEAVE],
      })
      .andWhere('leave.startsOn <= :endsOn AND leave.endsOn >= :startsOn', {
        startsOn,
        endsOn,
      })
      .andWhere(except ? 'leave.id <> :except' : 'TRUE', { except })
      .getExists();
    if (overlapping) throw new RuleViolation(LeaveMessages.clash);
  }
}

export function daysBetween(startsOn: string, endsOn: string): number {
  return (Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000 + 1;
}
