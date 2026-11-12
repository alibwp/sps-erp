import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  FAMILY_ROLES,
  Forbidden,
  OrganizationPermission,
  PlatformPermission,
} from '../access/access.constants.js';
import { PermissionResolver } from '../access/permission-resolver.service.js';
import { RoleAuthority } from '../access/role-authority.service.js';
import { User } from '../identity/entities/user.entity.js';
import { OrganizationMembership } from '../organizations/entities/organization-membership.entity.js';
import { SchoolMembership } from '../organizations/entities/school-membership.entity.js';
import { OrganizationAccess } from '../organizations/organization-access.service.js';

export const ACCOUNT_NOT_FOUND = 'Account not found.';

export type OutOfReachCheck = (
  manager: EntityManager,
  userId: string,
  schoolId: string,
) => Promise<string | null>;

export const AccountMessages = {
  self: 'You cannot change access to your own account.',
  beyondCampus:
    'This person has access beyond this campus, so their account access cannot be changed here.',
  holdsMore: 'This person holds more at this campus than you do.',
} as const;

// Who may change a person's account access from a campus.
//
// Account access (suspend, reinstate, archive, end the campus membership),
// reference UserPolicy::manageAccountAccess: nobody acts on their own
// account, nor on a person with access beyond the campus (a global role,
// organization scope, a staff role or membership somewhere the campus does
// not reach), nor on one holding more at the campus than the actor could
// hand out. There is no exception for platform administrators.
//
// Invitations (send, resend, revoke), reference AccountInvitationPolicy::canAct:
// the same, except that a person who reaches the invitee beyond this campus
// (a platform administrator, or an organization member with "manage
// organization members" at one of the invitee's campuses) may act.
export type AccountAction = 'access' | 'invitation';

@Injectable()
export class AccountAuthority {
  private readonly outOfReach: OutOfReachCheck[] = [];

  constructor(
    private readonly resolver: PermissionResolver,
    private readonly roles: RoleAuthority,
    private readonly organizations: OrganizationAccess,
  ) {}

  // A later stage that knows why a person is not this campus's to manage
  // (Stage 5: a learner enrolled only at another campus).
  registerOutOfReach(check: OutOfReachCheck): void {
    this.outOfReach.push(check);
  }

  // A person with an active membership at the campus; anyone else is 404.
  async member(
    manager: EntityManager,
    userId: string,
    schoolId: string,
    options: { lock?: boolean } = {},
  ): Promise<User> {
    const qb = manager
      .createQueryBuilder(User, 'person')
      .innerJoin(
        SchoolMembership,
        'membership',
        "membership.userId = person.id AND membership.schoolId = :schoolId AND membership.status = 'active'",
        { schoolId },
      )
      .where('person.id = :userId', { userId });
    if (options.lock) qb.setLock('pessimistic_write', undefined, ['person']);
    const user = await qb.getOne();
    if (!user) throw new NotFoundException(ACCOUNT_NOT_FOUND);
    return user;
  }

  async mustManage(
    manager: EntityManager,
    actorId: string,
    target: User,
    schoolId: string,
    action: AccountAction = 'access',
  ): Promise<void> {
    if (target.id === actorId) throw new Forbidden(AccountMessages.self);
    if (
      action === 'invitation' &&
      (await this.reachesBeyondThisCampus(manager, actorId, target.id))
    ) {
      return;
    }
    if (await this.holdsPowerBeyond(manager, target.id, schoolId)) {
      throw new Forbidden(AccountMessages.beyondCampus);
    }
    for (const check of this.outOfReach) {
      const refusal = await check(manager, target.id, schoolId);
      if (refusal) throw new Forbidden(refusal);
    }
    if (await this.roles.holdsMoreThan(manager, target.id, actorId, schoolId)) {
      throw new Forbidden(AccountMessages.holdsMore);
    }
  }

  // Reference AccountInvitationVisibility::reachesBeyondThisCampus: the
  // actor holds "access all schools", or manages the members of an
  // organization one of whose campuses the person actively belongs to.
  async reachesBeyondThisCampus(
    manager: EntityManager,
    actorId: string,
    userId: string,
  ): Promise<boolean> {
    const global = await this.resolver.globalPermissions(actorId, manager);
    if (global.has(PlatformPermission.AccessAllSchools)) return true;
    return this.belongsToOrganizations(
      manager,
      userId,
      await this.organizationsManagedBy(manager, actorId),
    );
  }

  // The organizations whose members this person manages.
  async organizationsManagedBy(
    manager: EntityManager,
    actorId: string,
  ): Promise<string[]> {
    const memberships = await manager.find(OrganizationMembership, {
      where: { userId: actorId, status: 'active' },
      select: { organizationId: true },
    });
    const managed: string[] = [];
    for (const { organizationId } of memberships) {
      if (
        await this.organizations.allows(
          manager,
          actorId,
          organizationId,
          OrganizationPermission.ManageMembers,
        )
      ) {
        managed.push(organizationId);
      }
    }
    return managed;
  }

  // Whether the person has an active membership at a campus of one of
  // these organizations.
  async belongsToOrganizations(
    manager: EntityManager,
    userId: string,
    organizationIds: string[],
  ): Promise<boolean> {
    if (!organizationIds.length) return false;
    const rows = (await manager.query(
      `SELECT 1 FROM school_memberships m
         JOIN schools s ON s.id = m.school_id
        WHERE m.user_id = $1 AND m.status = 'active'
          AND s.organization_id = ANY($2::uuid[])
        LIMIT 1`,
      [userId, organizationIds],
    )) as unknown[];
    return rows.length > 0;
  }

  // Reference User::holdsPowerBeyond: a global role, a staff role at
  // another campus they work at, active organization scope, or a
  // membership at a campus of another organization.
  async holdsPowerBeyond(
    manager: EntityManager,
    userId: string,
    schoolId: string,
  ): Promise<boolean> {
    const rows = (await manager.query(
      `SELECT
         EXISTS (SELECT 1 FROM model_has_roles a
                  WHERE a.user_id = $1 AND a.school_id IS NULL) AS global_role,
         EXISTS (SELECT 1 FROM model_has_roles a
                   JOIN roles r ON r.id = a.role_id
                   JOIN school_memberships m
                     ON m.user_id = a.user_id AND m.school_id = a.school_id AND m.status = 'active'
                  WHERE a.user_id = $1 AND a.school_id <> $2
                    AND NOT (r.school_id IS NULL AND r.name = ANY($3::varchar[]))) AS staff_elsewhere,
         EXISTS (SELECT 1 FROM organization_memberships o
                  WHERE o.user_id = $1 AND o.status = 'active') AS organization_scope,
         EXISTS (SELECT 1 FROM school_memberships m
                   JOIN schools s ON s.id = m.school_id
                  WHERE m.user_id = $1 AND m.status = 'active' AND m.school_id <> $2
                    AND s.organization_id <> (SELECT organization_id FROM schools WHERE id = $2)) AS other_organization`,
      [userId, schoolId, FAMILY_ROLES],
    )) as Array<Record<string, boolean>>;
    const row = rows[0];
    return (
      row.global_role ||
      row.staff_elsewhere ||
      row.organization_scope ||
      row.other_organization
    );
  }
}
