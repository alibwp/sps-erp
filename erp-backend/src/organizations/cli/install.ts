import type { INestApplicationContext } from '@nestjs/common';
import { BuiltInRole } from '../../access/access.constants.js';
import { RoleAssignments } from '../../access/role-assignments.service.js';
import { AuditAction, AuditService } from '../../audit/audit.service.js';
import { TransactionService } from '../../common/database/transaction.service.js';
import {
  CliError,
  checkEmail,
  checkName,
} from '../../identity/cli/create-platform-admin.js';
import { User } from '../../identity/entities/user.entity.js';
import { InvitationService } from '../../identity/invitations/invitation.service.js';
import { Campuses } from '../campuses.service.js';
import { Organization } from '../entities/organization.entity.js';
import { School } from '../entities/school.entity.js';
import { isTimeZone } from '../organizations.dto.js';
import {
  ORGANIZATION_SUBJECT,
  Organizations,
} from '../organizations.service.js';
import { SchoolMemberships } from '../school-memberships.service.js';

export interface InstallInput {
  organization?: string;
  campus?: string;
  timezone?: string;
  adminEmail?: string;
  adminName?: string;
}

export interface Installed {
  organizationId: string;
  schoolId: string;
  userId: string;
  link: string;
  expiresAt: Date;
}

export const ALREADY_INSTALLED =
  'This database already contains application data.';

// `install --organization --campus --timezone --admin-email --admin-name`
// (reference InstallApplication): on an empty database, creates the
// organization, its first campus and the platform administrator, who joins
// the campus as their primary one. Prints the administrator's one-time
// invitation link; no email is sent and there is no default password.
// Refuses to run when people, organizations or campuses already exist.
export async function install(
  app: INestApplicationContext,
  input: InstallInput,
): Promise<Installed> {
  const organizationName = checkName(input.organization, '--organization');
  const campusName = checkName(input.campus, '--campus');
  const adminName = checkName(input.adminName, '--admin-name');
  const adminEmail = checkEmail(input.adminEmail, '--admin-email');
  const timezone = input.timezone?.trim() ?? '';
  if (!isTimeZone(timezone)) {
    throw new CliError(
      '--timezone must be an IANA time zone, for example Africa/Lagos.',
    );
  }

  const installed = await app.get(TransactionService).run(async (tx) => {
    const manager = tx.manager;
    // Two installs started at once: the second waits here, then sees data.
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtext('sps-erp:install'))`,
    );
    const hasData =
      (await manager.exists(User, { withDeleted: true })) ||
      (await manager.exists(Organization)) ||
      (await manager.exists(School));
    if (hasData) throw new CliError(ALREADY_INSTALLED);

    const organization = await app.get(Organizations).createIn(
      manager,
      {
        name: organizationName,
        code: null,
        address: null,
        email: null,
        phone: null,
      },
      null,
    );
    const school = await app
      .get(Campuses)
      .openIn(manager, organization.id, { name: campusName, timezone }, null);
    const admin = await manager.save(
      manager.create(User, {
        name: adminName,
        email: adminEmail,
        accountStatus: 'invited',
      }),
    );
    await app
      .get(RoleAssignments)
      .grantGlobal(manager, admin.id, BuiltInRole.PlatformAdmin, null);
    await app
      .get(SchoolMemberships)
      .grant(manager, admin.id, school.id, { primary: true });
    await app.get(AuditService).record(manager, {
      action: AuditAction.InstallationCompleted,
      subject: { type: ORGANIZATION_SUBJECT, id: organization.id },
      context: { organization_id: organization.id, school_id: school.id },
      actorId: null,
      schoolId: school.id,
    });
    return { organization, school, admin };
  });

  const sent = await app
    .get(InvitationService)
    .send(installed.admin.id, { invitedById: null, notify: false });
  return {
    organizationId: installed.organization.id,
    schoolId: installed.school.id,
    userId: installed.admin.id,
    link: sent.link,
    expiresAt: sent.invitation.expiresAt,
  };
}
