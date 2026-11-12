import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  Forbidden,
  ORGANIZATION_PERMISSIONS,
  OrganizationPermission,
  type OrganizationPermissionName,
  PlatformPermission,
} from '../access/access.constants.js';
import { PermissionResolver } from '../access/permission-resolver.service.js';
import { OrganizationMembership } from './entities/organization-membership.entity.js';
import { Organization } from './entities/organization.entity.js';

export const ORGANIZATION_NOT_FOUND = 'Organization not found.';

// The permissions a membership carries: all of them when the list is null.
export function grantedPermissions(
  membership: Pick<OrganizationMembership, 'permissions'>,
): OrganizationPermissionName[] {
  if (membership.permissions === null) return [...ORGANIZATION_PERMISSIONS];
  return ORGANIZATION_PERMISSIONS.filter((permission) =>
    membership.permissions!.includes(permission),
  );
}

// An ended or suspended membership carries nothing.
export function membershipGrants(
  membership: Pick<OrganizationMembership, 'permissions' | 'status'>,
  permission: OrganizationPermissionName,
): boolean {
  return (
    membership.status === 'active' &&
    grantedPermissions(membership).includes(permission)
  );
}

// Organization authority (reference OrganizationPermissionScope): a member
// holds a permission only when the global organization-admin role carries
// it AND their active membership in that organization grants it, so
// delegation can only narrow. "access all organizations" (platform
// administrators) allows everything. Never opens campus records.
@Injectable()
export class OrganizationAccess {
  constructor(private readonly resolver: PermissionResolver) {}

  async allows(
    manager: EntityManager,
    userId: string,
    organizationId: string,
    permission: OrganizationPermissionName,
  ): Promise<boolean> {
    return (
      await this.permissionsFor(manager, userId, organizationId)
    ).includes(permission);
  }

  async permissionsFor(
    manager: EntityManager,
    userId: string,
    organizationId: string,
  ): Promise<OrganizationPermissionName[]> {
    const global = await this.resolver.globalPermissions(userId, manager);
    if (global.has(PlatformPermission.AccessAllOrganizations)) {
      return [...ORGANIZATION_PERMISSIONS];
    }
    const membership = await manager.findOne(OrganizationMembership, {
      where: { userId, organizationId, status: 'active' },
    });
    if (!membership) return [];
    return grantedPermissions(membership).filter((permission) =>
      global.has(permission),
    );
  }

  // The organization, when the person may act on it with this permission.
  // Someone who cannot even read it gets 404, so the id does not reveal it
  // exists; a member without the permission gets 403.
  async authorize(
    manager: EntityManager,
    userId: string,
    organizationId: string,
    permission: OrganizationPermissionName,
    options: { lock?: boolean } = {},
  ): Promise<Organization> {
    const organization = await manager.findOne(Organization, {
      where: { id: organizationId },
      ...(options.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!organization) throw new NotFoundException(ORGANIZATION_NOT_FOUND);
    const held = await this.permissionsFor(manager, userId, organizationId);
    if (!held.includes(OrganizationPermission.Read)) {
      throw new NotFoundException(ORGANIZATION_NOT_FOUND);
    }
    if (!held.includes(permission)) throw new Forbidden();
    return organization;
  }
}
