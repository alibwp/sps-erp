import { Module, type OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicModule } from '../academic/academic.module.js';
import { SchoolSetup } from '../academic/school-setup.service.js';
import { AccessModule } from '../access/access.module.js';
import { RoleAssignments } from '../access/role-assignments.service.js';
import { AccountAuthority } from '../accounts/account-authority.service.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { CycleSections } from '../curriculum/cycle-sections.service.js';
import { IdentityModule } from '../identity/identity.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { AdmissionWaitlist } from './admission-waitlist.service.js';
import { CampusMoveAuthority, CampusMoves } from './campus-moves.service.js';
import { EnrollmentPlacements } from './enrollment-placements.service.js';
import { EnrollmentStatuses } from './enrollment-statuses.service.js';
import { AcademicYearStudentRecord } from './entities/academic-year-student-record.entity.js';
import { AdmissionWaitlistEntry } from './entities/admission-waitlist-entry.entity.js';
import { CampusMoveRequest } from './entities/campus-move-request.entity.js';
import { EnrollmentPlacement } from './entities/enrollment-placement.entity.js';
import { EnrollmentStatusChange } from './entities/enrollment-status-change.entity.js';
import { GuardianLink } from './entities/guardian-link.entity.js';
import { ParentRecord } from './entities/parent-record.entity.js';
import { Promotion } from './entities/promotion.entity.js';
import { StudentRecord } from './entities/student-record.entity.js';
import { GraduatedGuard } from './graduated.guard.js';
import { GuardianLinks } from './guardian-links.service.js';
import { isEnrolledLearner, isEnrolledOnlyElsewhere } from './learners.js';
import {
  AdmissionWaitlistController,
  CampusMovesController,
  GraduationsController,
  PromotionsController,
} from './moving.controllers.js';
import { statusLabel } from './moving.constants.js';
import { Promotions } from './promotions.service.js';
import { StudentViews } from './student-views.service.js';
import { StudentsController } from './students.controller.js';
import { Students } from './students.service.js';
import { Transfers } from './transfers.service.js';
import { WaitlistWithdrawals } from './waitlist-withdrawals.service.js';

export const EnrollmentRuleMessages = {
  learnerRole: (name: string) =>
    `${name} is a learner. A learner cannot hold a campus role.`,
  enrolledElsewhere:
    'This learner attends another campus, so their account is managed there.',
  placedLearners: (count: number) =>
    `Move the ${count} learners of this section before archiving it.`,
  openWaitlist: (count: number) =>
    `Decide the ${count} open entries of this section's admission queue before archiving it.`,
} as const;

// Stage 5 parts 1 to 3: learners, their enrollments, placements and
// states, with the graduated-learner guard; promotions, graduations, the
// admission waitlist, campus moves and transfers; guardians and their
// links to learners. Later stages register what ends with an enrollment
// (EnrollmentStatuses.registerCloseHandler), follows a campus move
// (CampusMoves.registerMoveHandler) or ends with a guardian link
// (GuardianLinks.registerUnlinkHook).
@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentRecord,
      EnrollmentPlacement,
      EnrollmentStatusChange,
      AcademicYearStudentRecord,
      Promotion,
      AdmissionWaitlistEntry,
      CampusMoveRequest,
      ParentRecord,
      GuardianLink,
    ]),
    AccessModule,
    AccountsModule,
    IdentityModule,
    OrganizationsModule,
    AcademicModule,
    CurriculumModule,
  ],
  controllers: [
    StudentsController,
    PromotionsController,
    GraduationsController,
    AdmissionWaitlistController,
    CampusMovesController,
  ],
  providers: [
    WaitlistWithdrawals,
    EnrollmentPlacements,
    EnrollmentStatuses,
    Students,
    StudentViews,
    GraduatedGuard,
    Promotions,
    AdmissionWaitlist,
    CampusMoveAuthority,
    CampusMoves,
    Transfers,
    GuardianLinks,
  ],
  exports: [
    EnrollmentPlacements,
    EnrollmentStatuses,
    Students,
    GraduatedGuard,
    Transfers,
    GuardianLinks,
    StudentViews,
    CampusMoves,
  ],
})
export class EnrollmentsModule implements OnModuleInit {
  constructor(
    private readonly setup: SchoolSetup,
    private readonly sections: CycleSections,
    private readonly accounts: AccountAuthority,
    private readonly roles: RoleAssignments,
    private readonly statuses: EnrollmentStatuses,
    private readonly campusMoves: CampusMoves,
  ) {}

  onModuleInit(): void {
    // The setup checklist's learners: active enrollments at the campus.
    this.setup.registerCount('students', (manager, school) =>
      manager.count(StudentRecord, {
        where: { schoolId: school.id, status: 'active' },
      }),
    );

    // A seat is taken by every enrolled learner placed in the section and
    // by every open waitlist offer (SectionSeats). Placed learners and open
    // waitlist entries keep a section from being archived
    // (ChangeAcademicCycleSectionStatus).
    const placed = (
      manager: Parameters<typeof this.sections.seatsTaken>[0],
      sectionId: string,
    ) =>
      manager
        .createQueryBuilder(StudentRecord, 'enrollment')
        .where('enrollment.academicCycleSectionId = :sectionId', { sectionId })
        .andWhere("enrollment.status IN ('active', 'suspended')")
        .getCount();
    const waiting = (
      manager: Parameters<typeof this.sections.seatsTaken>[0],
      sectionId: string,
      statuses: string[],
    ) =>
      manager
        .createQueryBuilder(AdmissionWaitlistEntry, 'entry')
        .where('entry.academicCycleSectionId = :sectionId', { sectionId })
        .andWhere('entry.status IN (:...statuses)', { statuses })
        .getCount();
    this.sections.registerUsage({
      seatsTaken: async (manager, section) =>
        (await placed(manager, section.id)) +
        (await waiting(manager, section.id, ['offered'])),
      archiveRefusal: async (manager, section) => {
        const count = await placed(manager, section.id);
        if (count) return EnrollmentRuleMessages.placedLearners(count);
        const open = await waiting(manager, section.id, ['pending', 'offered']);
        return open ? EnrollmentRuleMessages.openWaitlist(open) : null;
      },
    });

    // A closed enrollment can never move, so a move still waiting would
    // only fail when somebody tried to approve it.
    this.statuses.registerCloseHandler((manager, enrollment, status, context) =>
      this.campusMoves.cancelOpenIn(
        manager,
        enrollment.id,
        context.actorId,
        `Enrollment closed: ${statusLabel(status)}`,
      ),
    );

    // A learner enrolled only at another campus is that campus's to manage
    // (UserPolicy::manageAccountAccess, AccountInvitationPolicy).
    this.accounts.registerOutOfReach(async (manager, userId, schoolId) =>
      (await isEnrolledOnlyElsewhere(manager, userId, schoolId))
        ? EnrollmentRuleMessages.enrolledElsewhere
        : null,
    );

    // An enrolled learner holds no campus role (AssignCampusRole::give).
    this.roles.registerGiveCheck(async (manager, person) =>
      (await isEnrolledLearner(manager, person.id))
        ? EnrollmentRuleMessages.learnerRole(person.name)
        : null,
    );
  }
}
