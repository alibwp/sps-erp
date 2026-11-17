import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager, In, IsNull, Not } from 'typeorm';
import { isFrozen } from '../academic/academic.constants.js';
import { AcademicYear } from '../academic/entities/academic-year.entity.js';
import { RoleAssignments } from '../access/role-assignments.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Clock } from '../common/clock/clock.js';
import { TransactionService } from '../common/database/transaction.service.js';
import { RuleViolation } from '../common/errors/api-exception.js';
import { findInSchool, newInSchool } from '../common/tenancy/school-scope.js';
import { campusTerms } from '../curriculum/campus-terms.js';
import {
  CycleSections,
  SECTION_NOT_FOUND,
} from '../curriculum/cycle-sections.service.js';
import { AcademicCycleSection } from '../curriculum/entities/academic-cycle-section.entity.js';
import { User } from '../identity/entities/user.entity.js';
import { School } from '../organizations/entities/school.entity.js';
import { SchoolMembership } from '../organizations/entities/school-membership.entity.js';
import { EnrollmentPlacements } from './enrollment-placements.service.js';
import { EnrollmentStatuses } from './enrollment-statuses.service.js';
import {
  ENROLLED_STATUSES,
  canMoveEnrollment,
  isClosedEnrollment,
} from './enrollment.constants.js';
import { AdmissionWaitlistEntry } from './entities/admission-waitlist-entry.entity.js';
import { StudentRecord } from './entities/student-record.entity.js';
import { openEnrollmentElsewhere, worksAsStaff } from './learners.js';
import {
  OPEN_WAITLIST_STATUSES,
  WAITLIST_SUBJECT,
  isOpenWaitlistEntry,
  statusLabel,
} from './moving.constants.js';
import { Students } from './students.service.js';
import {
  ENROLLED_WHILE_WAITING,
  WaitlistWithdrawals,
} from './waitlist-withdrawals.service.js';

export const WAITLIST_ENTRY_NOT_FOUND = 'Admission waitlist entry not found.';
export const ACCEPTED_REASON = 'Admission waitlist accepted';

export const WaitlistMessages = {
  inactive: (section: string) =>
    `Activate the ${section} before opening its admission queue.`,
  yearClosed:
    'The academic cycle is closed. Reopen it before using its admission queue.',
  noCapacity:
    'This section has no capacity limit, so it does not need an admission waitlist.',
  notMember: 'This candidate does not belong to the school.',
  worksAsStaff: (name: string) =>
    `${name} works as staff. A member of staff cannot be admitted as a learner.`,
  enrolledHere: 'This candidate is already enrolled in the school.',
  stillRoom:
    'This section still has a place. Enrol the candidate instead of waitlisting them.',
  onlyOffered: 'Only an offered admission place can be accepted.',
  attendsHere: 'This candidate already attends the school.',
  cannotReopen: (status: string) =>
    `This candidate's earlier enrollment here is ${statusLabel(status)}, so it cannot be opened again.`,
  attendsSibling: (school: string) =>
    `This candidate attends ${school}. Ask that school to move or transfer them.`,
  enrolledElsewhere:
    'This candidate is enrolled at another school. Ask that school to move or transfer them.',
  decided: 'This admission waitlist entry has already been decided.',
  nothingToOffer:
    'There is no open place or pending candidate for this section.',
} as const;

// The admission waitlist of a campus (reference JoinWaitlist,
// OfferNextWaitlistEntry, AcceptWaitlistEntry, DeclineWaitlistEntry,
// AdmissionWaitlistDirectory). A candidate waits only for a full section
// with a capacity; an open offer holds a seat until it is answered.
@Injectable()
export class AdmissionWaitlist {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactions: TransactionService,
    private readonly sections: CycleSections,
    private readonly placements: EnrollmentPlacements,
    private readonly statuses: EnrollmentStatuses,
    private readonly withdrawals: WaitlistWithdrawals,
    private readonly students: Students,
    private readonly roles: RoleAssignments,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  // The campus's entries, highest priority first, then by position; `next`
  // marks the entry an offer would go to in each section with a free seat.
  async list(
    schoolId: string,
    filter: { academicCycleSectionId?: string; status?: string } = {},
  ): Promise<Array<{ entry: AdmissionWaitlistEntry; next: boolean }>> {
    const manager = this.dataSource.manager;
    const entries = await manager.find(AdmissionWaitlistEntry, {
      where: {
        schoolId,
        ...(filter.academicCycleSectionId
          ? { academicCycleSectionId: filter.academicCycleSectionId }
          : {}),
        ...(filter.status ? { status: filter.status as never } : {}),
      },
      relations: { user: true, academicCycleSection: true },
      withDeleted: true,
      order: { priority: 'DESC', position: 'ASC' },
    });
    const next = new Set<string>();
    const seen = new Set<string>();
    for (const entry of entries) {
      if (entry.status !== 'pending') continue;
      if (seen.has(entry.academicCycleSectionId)) continue;
      seen.add(entry.academicCycleSectionId);
      if (!(await this.isFull(manager, entry.academicCycleSection))) {
        next.add(entry.id);
      }
    }
    return entries.map((entry) => ({ entry, next: next.has(entry.id) }));
  }

  // The sections a candidate may wait for: active, with a capacity, full,
  // and in a year that is not closed.
  async sectionsToWaitFor(
    schoolId: string,
  ): Promise<Array<{ section: AcademicCycleSection; taken: number }>> {
    const manager = this.dataSource.manager;
    const sections = await manager.find(AcademicCycleSection, {
      where: { schoolId, status: 'active', capacity: Not(IsNull()) },
      relations: { academicYear: true, academicLevel: true },
      order: { academicYearId: 'ASC', academicLevelId: 'ASC', position: 'ASC' },
    });
    const open: Array<{ section: AcademicCycleSection; taken: number }> = [];
    for (const section of sections) {
      if (isFrozen(section.academicYear.status)) continue;
      const taken = await this.sections.seatsTaken(manager, section);
      if (taken >= section.capacity!) open.push({ section, taken });
    }
    return open;
  }

  // Joining is safe to repeat: an open entry for the same candidate and
  // section is returned as it is.
  async join(
    actorId: string,
    schoolId: string,
    input: {
      academicCycleSectionId: string;
      userId: string;
      priority?: number;
    },
  ): Promise<AdmissionWaitlistEntry> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const section = await findInSchool(
        manager,
        AcademicCycleSection,
        { id: input.academicCycleSectionId },
        { schoolId, lock: true, notFound: SECTION_NOT_FOUND },
      );
      await this.refuseWhatDoesNotFit(manager, section, input.userId);

      const existing = await manager.findOne(AdmissionWaitlistEntry, {
        where: {
          schoolId,
          academicCycleSectionId: section.id,
          userId: input.userId,
          status: In([...OPEN_WAITLIST_STATUSES]),
        },
      });
      if (existing) return existing;

      const [{ last }] = (await manager.query(
        `SELECT coalesce(max(position), 0)::int AS last
           FROM admission_waitlist_entries WHERE academic_cycle_section_id = $1`,
        [section.id],
      )) as [{ last: number }];
      const priority = input.priority ?? 0;
      const entry = await manager.save(
        newInSchool(
          manager,
          AdmissionWaitlistEntry,
          {
            academicYearId: section.academicYearId,
            academicCycleSectionId: section.id,
            userId: input.userId,
            createdById: actorId,
            priority,
            position: last + 1,
            status: 'pending',
          },
          { schoolId },
        ),
      );
      await this.audit.record(manager, {
        action: AuditAction.AdmissionWaitlistJoined,
        subject: { type: WAITLIST_SUBJECT, id: entry.id },
        context: { academic_cycle_section_id: section.id, priority },
        schoolId,
      });
      return entry;
    });
  }

  // Offers the free seat to the next candidate of the section; null when
  // the section is full or nobody waits. A candidate who enrolled here
  // meanwhile is withdrawn on the way.
  async offerNext(
    actorId: string,
    schoolId: string,
    sectionId: string,
  ): Promise<AdmissionWaitlistEntry | null> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const section = await findInSchool(
        manager,
        AcademicCycleSection,
        { id: sectionId },
        { schoolId, lock: true, notFound: SECTION_NOT_FOUND },
      );
      // An open offer holds its seat, so one free seat is never offered to
      // two families.
      if (await this.isFull(manager, section)) return null;

      const waiting = await manager.find(AdmissionWaitlistEntry, {
        where: {
          schoolId,
          academicCycleSectionId: section.id,
          status: 'pending',
        },
        order: { priority: 'DESC', position: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      for (const entry of waiting) {
        if (await this.enrolledHere(manager, entry.userId, schoolId)) {
          await this.withdrawals.withdrawIn(
            manager,
            entry,
            ENROLLED_WHILE_WAITING,
            actorId,
          );
          continue;
        }
        entry.status = 'offered';
        entry.offeredAt = this.clock.now();
        entry.offeredById = actorId;
        const offered = await manager.save(entry);
        await this.audit.record(manager, {
          action: AuditAction.AdmissionWaitlistOffered,
          subject: { type: WAITLIST_SUBJECT, id: entry.id },
          context: { academic_cycle_section_id: section.id },
          schoolId,
        });
        return offered;
      }
      return null;
    });
  }

  // The family takes the offered seat: the learner is placed in the
  // section, either newly enrolled or taken back into their earlier
  // enrollment here.
  async accept(
    actorId: string,
    schoolId: string,
    id: string,
  ): Promise<StudentRecord> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const entry = await findInSchool(
        manager,
        AdmissionWaitlistEntry,
        { id },
        { schoolId, lock: true, notFound: WAITLIST_ENTRY_NOT_FOUND },
      );
      if (entry.status !== 'offered') {
        throw new RuleViolation(WaitlistMessages.onlyOffered);
      }
      const earlier = await manager.findOne(StudentRecord, {
        where: { schoolId, userId: entry.userId },
        order: { createdAt: 'DESC' },
      });
      if (earlier && !isClosedEnrollment(earlier.status)) {
        throw new RuleViolation(WaitlistMessages.attendsHere);
      }
      if (earlier && !canMoveEnrollment(earlier.status, 'active')) {
        throw new RuleViolation(WaitlistMessages.cannotReopen(earlier.status));
      }
      // Accepting a place must not give one learner two schools to attend.
      const elsewhere = await openEnrollmentElsewhere(
        manager,
        entry.userId,
        schoolId,
      );
      if (elsewhere) {
        const school = await manager.findOneOrFail(School, {
          where: { id: schoolId },
        });
        throw new RuleViolation(
          elsewhere.organizationId === school.organizationId
            ? WaitlistMessages.attendsSibling(elsewhere.schoolName)
            : WaitlistMessages.enrolledElsewhere,
        );
      }
      if (await worksAsStaff(manager, entry.userId)) {
        const candidate = await manager.findOneOrFail(User, {
          where: { id: entry.userId },
          withDeleted: true,
        });
        throw new RuleViolation(WaitlistMessages.worksAsStaff(candidate.name));
      }
      await this.roles.giveFamilyRole(manager, {
        userId: entry.userId,
        roleName: 'student',
        schoolId,
      });

      // The offer becomes the placement. Closing it first frees its own
      // seat for the learner; the transaction undoes both if placing fails.
      entry.status = 'placed';
      entry.decidedAt = this.clock.now();
      entry.decidedById = actorId;
      await manager.save(entry);

      // A learner who left and comes back keeps their one enrollment here,
      // with its history and admission number.
      const enrollment = earlier
        ? await this.statuses.changeIn(manager, {
            enrollmentId: earlier.id,
            status: 'active',
            actorId,
            reason: ACCEPTED_REASON,
            intoSectionId: entry.academicCycleSectionId,
          })
        : await this.placeANewLearner(manager, entry, actorId);

      await this.audit.record(manager, {
        action: AuditAction.AdmissionWaitlistPlaced,
        subject: { type: WAITLIST_SUBJECT, id: entry.id },
        context: { student_record_id: enrollment.id },
        schoolId,
      });
      return enrollment;
    });
  }

  async decline(
    actorId: string,
    schoolId: string,
    id: string,
    reason: string | null,
  ): Promise<AdmissionWaitlistEntry> {
    return this.transactions.run(async (tx) => {
      const manager = tx.manager;
      const entry = await findInSchool(
        manager,
        AdmissionWaitlistEntry,
        { id },
        { schoolId, lock: true, notFound: WAITLIST_ENTRY_NOT_FOUND },
      );
      if (!isOpenWaitlistEntry(entry.status)) {
        throw new RuleViolation(WaitlistMessages.decided);
      }
      const note = reason?.trim() || null;
      entry.status = 'declined';
      entry.decidedAt = this.clock.now();
      entry.decidedById = actorId;
      entry.decisionReason = note;
      const saved = await manager.save(entry);
      await this.audit.record(manager, {
        action: AuditAction.AdmissionWaitlistDeclined,
        subject: { type: WAITLIST_SUBJECT, id: entry.id },
        context: { reason: note },
        schoolId,
      });
      return saved;
    });
  }

  find(schoolId: string, id: string): Promise<AdmissionWaitlistEntry> {
    return findInSchool(
      this.dataSource.manager,
      AdmissionWaitlistEntry,
      { id },
      { schoolId, notFound: WAITLIST_ENTRY_NOT_FOUND },
    );
  }

  private async refuseWhatDoesNotFit(
    manager: EntityManager,
    section: AcademicCycleSection,
    userId: string,
  ): Promise<void> {
    const terms = await campusTerms(manager, section.schoolId);
    if (section.status !== 'active') {
      throw new RuleViolation(WaitlistMessages.inactive(terms.section));
    }
    const year = await manager.findOneOrFail(AcademicYear, {
      where: { id: section.academicYearId },
    });
    if (isFrozen(year.status)) {
      throw new RuleViolation(WaitlistMessages.yearClosed);
    }
    if (section.capacity === null) {
      throw new RuleViolation(WaitlistMessages.noCapacity);
    }
    const member = await manager.exists(SchoolMembership, {
      where: { userId, schoolId: section.schoolId, status: 'active' },
    });
    if (!member) throw new RuleViolation(WaitlistMessages.notMember);
    if (await worksAsStaff(manager, userId)) {
      const candidate = await manager.findOneOrFail(User, {
        where: { id: userId },
      });
      throw new RuleViolation(WaitlistMessages.worksAsStaff(candidate.name));
    }
    if (await this.enrolledHere(manager, userId, section.schoolId)) {
      throw new RuleViolation(WaitlistMessages.enrolledHere);
    }
    // A seat offered to a waiting family is not free to somebody new.
    if (!(await this.isFull(manager, section))) {
      throw new RuleViolation(WaitlistMessages.stillRoom);
    }
  }

  private async placeANewLearner(
    manager: EntityManager,
    entry: AdmissionWaitlistEntry,
    actorId: string,
  ): Promise<StudentRecord> {
    const school = await manager.findOneOrFail(School, {
      where: { id: entry.schoolId },
    });
    const today = this.clock.schoolToday(school.timezone);
    const enrollment = await manager.save(
      newInSchool(
        manager,
        StudentRecord,
        {
          userId: entry.userId,
          admissionNumber: await this.students.generateNumber(
            manager,
            school,
            today,
          ),
          admissionDate: today,
          status: 'active',
          isPrimary: true,
        },
        { schoolId: school.id },
      ),
    );
    return this.placements.placeIn(manager, {
      enrollmentId: enrollment.id,
      sectionId: entry.academicCycleSectionId,
      actorId,
      reason: ACCEPTED_REASON,
    });
  }

  private async isFull(
    manager: EntityManager,
    section: AcademicCycleSection,
  ): Promise<boolean> {
    return (
      section.capacity !== null &&
      (await this.sections.seatsTaken(manager, section)) >= section.capacity
    );
  }

  private enrolledHere(
    manager: EntityManager,
    userId: string,
    schoolId: string,
  ): Promise<boolean> {
    return manager.exists(StudentRecord, {
      where: { userId, schoolId, status: In([...ENROLLED_STATUSES]) },
    });
  }
}
