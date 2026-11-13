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
import { EnrollmentPlacements } from './enrollment-placements.service.js';
import { EnrollmentStatuses } from './enrollment-statuses.service.js';
import { AcademicYearStudentRecord } from './entities/academic-year-student-record.entity.js';
import { EnrollmentPlacement } from './entities/enrollment-placement.entity.js';
import { EnrollmentStatusChange } from './entities/enrollment-status-change.entity.js';
import { StudentRecord } from './entities/student-record.entity.js';
import { GraduatedGuard } from './graduated.guard.js';
import { isEnrolledLearner, isEnrolledOnlyElsewhere } from './learners.js';
import { StudentViews } from './student-views.service.js';
import { StudentsController } from './students.controller.js';
import { Students } from './students.service.js';

export const EnrollmentRuleMessages = {
  learnerRole: (name: string) =>
    `${name} is a learner. A learner cannot hold a campus role.`,
  enrolledElsewhere:
    'This learner attends another campus, so their account is managed there.',
  placedLearners: (count: number) =>
    `Move the ${count} learners of this section before archiving it.`,
} as const;

// Stage 5 part 1: learners, their enrollments, placements and states, with
// the graduated-learner guard. Later parts and stages register what ends
// with an enrollment (EnrollmentStatuses.registerCloseHandler).
@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentRecord,
      EnrollmentPlacement,
      EnrollmentStatusChange,
      AcademicYearStudentRecord,
    ]),
    AccessModule,
    AccountsModule,
    IdentityModule,
    OrganizationsModule,
    AcademicModule,
    CurriculumModule,
  ],
  controllers: [StudentsController],
  providers: [
    EnrollmentPlacements,
    EnrollmentStatuses,
    Students,
    StudentViews,
    GraduatedGuard,
  ],
  exports: [EnrollmentPlacements, EnrollmentStatuses, Students, GraduatedGuard],
})
export class EnrollmentsModule implements OnModuleInit {
  constructor(
    private readonly setup: SchoolSetup,
    private readonly sections: CycleSections,
    private readonly accounts: AccountAuthority,
    private readonly roles: RoleAssignments,
  ) {}

  onModuleInit(): void {
    // The setup checklist's learners: active enrollments at the campus.
    this.setup.registerCount('students', (manager, school) =>
      manager.count(StudentRecord, {
        where: { schoolId: school.id, status: 'active' },
      }),
    );

    // A seat is taken by every enrolled learner placed in the section, and
    // they keep it from being archived (Stage 5 part 2 adds open waitlist
    // entries and offers).
    const placed = (
      manager: Parameters<typeof this.sections.seatsTaken>[0],
      sectionId: string,
    ) =>
      manager
        .createQueryBuilder(StudentRecord, 'enrollment')
        .where('enrollment.academicCycleSectionId = :sectionId', { sectionId })
        .andWhere("enrollment.status IN ('active', 'suspended')")
        .getCount();
    this.sections.registerUsage({
      seatsTaken: (manager, section) => placed(manager, section.id),
      archiveRefusal: async (manager, section) => {
        const count = await placed(manager, section.id);
        return count ? EnrollmentRuleMessages.placedLearners(count) : null;
      },
    });

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
