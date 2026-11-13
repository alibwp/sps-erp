import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { currentRequest } from '../common/request-context/request-context.js';
import { AuditEvent } from './audit-event.entity.js';

// Action names from the reference's app/Enums/AuditAction.php, plus the
// five campus and account actions agreed for Stage 2 (school.opened,
// school.updated, school_membership.granted, school_membership.ended,
// account.provisioned). Later stages add theirs.
export const AuditAction = {
  AccountStatusChanged: 'account.status_changed',
  AccountInvitationSent: 'account_invitation.sent',
  AccountInvitationRevoked: 'account_invitation.revoked',
  AccountPasswordChanged: 'account.password_changed',
  AccountProvisioned: 'account.provisioned',

  RoleAttached: 'role.attached',
  RoleDetached: 'role.detached',
  RoleCreated: 'role.created',
  RoleUpdated: 'role.updated',
  RoleArchived: 'role.archived',
  PermissionAttached: 'permission.attached',
  PermissionDetached: 'permission.detached',

  OrganizationCreated: 'organization.created',
  OrganizationUpdated: 'organization.updated',
  OrganizationMembershipGranted: 'organization_membership.granted',
  OrganizationMembershipRevoked: 'organization_membership.revoked',
  OrganizationMembershipPermissionsChanged:
    'organization_membership.permissions_changed',
  BillingGroupChanged: 'organization.billing_group_changed',

  SchoolOpened: 'school.opened',
  SchoolUpdated: 'school.updated',
  SchoolMembershipGranted: 'school_membership.granted',
  SchoolMembershipEnded: 'school_membership.ended',

  FeatureEnabled: 'feature.enabled',
  FeatureDisabled: 'feature.disabled',

  InstallationCompleted: 'installation.completed',

  AcademicPeriodStatusChanged: 'academic_period.status_changed',
  AcademicPeriodDatesChanged: 'academic_period.dates_changed',
  AcademicCalendarSaved: 'academic_calendar.saved',
  AcademicCalendarPublished: 'academic_calendar.published',
  AcademicCycleGenerated: 'academic_cycle.generated',
  AcademicYearSetupRolledForward: 'academic_year.setup_rolled_forward',
  CalendarTemplateSaved: 'calendar_template.saved',
  CampusCalendarOverridden: 'campus_calendar.overridden',
  InstructionalModelChanged: 'instructional_model.changed',
  InstructionalModelMigrated: 'instructional_model.migrated',
  SchoolSetupAcknowledged: 'school_setup.acknowledged',

  AcademicLevelCreated: 'academic_level.created',
  AcademicLevelUpdated: 'academic_level.updated',
  AcademicLevelStatusChanged: 'academic_level.status_changed',
  AcademicLevelDeleted: 'academic_level.deleted',
  AcademicCycleSectionCreated: 'academic_cycle_section.created',
  AcademicCycleSectionUpdated: 'academic_cycle_section.updated',
  AcademicCycleSectionStatusChanged: 'academic_cycle_section.status_changed',
  AcademicCycleSectionsRolledForward: 'academic_cycle_section.rolled_forward',
  CourseOfferingCreated: 'course_offering.created',
  CourseOfferingRenamed: 'course_offering.renamed',
  CourseOfferingRosterUpdated: 'course_offering.roster_updated',
  CourseOfferingStatusChanged: 'course_offering.status_changed',
  TeachingAssignmentCreated: 'teaching_assignment.created',
  TeachingAssignmentEnded: 'teaching_assignment.ended',
  OfferingExceptionGranted: 'instructional_model.exception_granted',
  OfferingExceptionRevoked: 'instructional_model.exception_revoked',

  EnrollmentPlaced: 'enrollment.placed',
  EnrollmentStatusChanged: 'enrollment.status_changed',
  AccountDeleted: 'account.deleted',
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  action: AuditActionName;
  subject?: { type: string; id: string } | null;
  context?: Record<string, unknown>;
  // Defaults to the signed-in user; null for system actions.
  actorId?: string | null;
  // Defaults to the working campus of the request; null for an action that
  // belongs to no campus (an organization, a global role).
  schoolId?: string | null;
}

// Writes one audit event inside the caller's transaction, so the event is
// saved exactly when the change it describes is.
@Injectable()
export class AuditService {
  async record(manager: EntityManager, entry: AuditEntry): Promise<AuditEvent> {
    const request = currentRequest();
    const event = manager.create(AuditEvent, {
      action: entry.action,
      subjectType: entry.subject?.type ?? null,
      subjectId: entry.subject?.id ?? null,
      context:
        entry.context && Object.keys(entry.context).length
          ? entry.context
          : null,
      actorId:
        entry.actorId === undefined ? (request?.userId ?? null) : entry.actorId,
      schoolId:
        entry.schoolId === undefined
          ? (request?.schoolId ?? null)
          : entry.schoolId,
      ipAddress: request?.ipAddress ?? null,
    });
    return manager.save(AuditEvent, event);
  }
}
