import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { ValidationFailed } from '../common/errors/api-exception.js';
import { SCHOOL_HEADER } from '../common/openapi/openapi.js';
import { currentRequest } from '../common/request-context/request-context.js';
import { FeatureService } from '../features/feature.service.js';
import type { Feature } from '../features/features.js';
import { IS_PUBLIC } from '../identity/auth/auth-context.js';
import { SchoolMembership } from '../organizations/entities/school-membership.entity.js';
import { School } from '../organizations/entities/school.entity.js';
import { OrganizationAccess } from '../organizations/organization-access.service.js';
import {
  CAMPUS_ROUTE,
  type CampusAccess,
  ORGANIZATION_PERMISSION_FALLBACK,
  REQUIRED_FEATURE,
  REQUIRED_PERMISSIONS,
  VERIFIED_EMAIL,
} from './access-context.js';
import {
  EmailNotVerified,
  Forbidden,
  type OrganizationPermissionName,
  PlatformPermission,
} from './access.constants.js';
import { PermissionResolver } from './permission-resolver.service.js';

export const NO_CAMPUS_ACCESS = 'You do not have access to that school.';

// Global guard 4 of 4, after authentication, the forced password change
// and the rate limit. In order:
//   1. campus routes: X-School-Id must name a campus the person may work in
//      (an active membership, or "access all schools"); otherwise 403;
//   2. a switched-off feature answers 404 to everyone;
//   3. administration routes need a verified email (403);
//   4. the route's campus permission, or the organization permission a
//      route accepts instead over the campus's organization (403).
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
    private readonly resolver: PermissionResolver,
    private readonly features: FeatureService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.auth;
    if (!auth) return true;

    const permissions =
      this.reflector.getAllAndOverride<string[]>(
        REQUIRED_PERMISSIONS,
        targets,
      ) ?? [];
    const feature = this.reflector.getAllAndOverride<Feature>(
      REQUIRED_FEATURE,
      targets,
    );
    const isCampusRoute =
      this.reflector.getAllAndOverride<boolean>(CAMPUS_ROUTE, targets) ===
        true ||
      permissions.length > 0 ||
      feature !== undefined;

    if (isCampusRoute) {
      req.campus = await this.resolveCampus(req, auth.user.id);
      if (
        feature !== undefined &&
        !(await this.features.enabled(feature, req.campus.school.id))
      ) {
        throw new NotFoundException();
      }
    }

    if (
      this.reflector.getAllAndOverride<boolean>(VERIFIED_EMAIL, targets) &&
      !auth.user.emailVerifiedAt
    ) {
      throw new EmailNotVerified();
    }

    if (
      permissions.length &&
      !permissions.some((permission) =>
        req.campus!.permissions.has(permission),
      ) &&
      !(await this.organizationAllows(
        auth.user.id,
        req.campus!.school,
        this.reflector.getAllAndOverride<OrganizationPermissionName>(
          ORGANIZATION_PERMISSION_FALLBACK,
          targets,
        ),
      ))
    ) {
      throw new Forbidden();
    }
    return true;
  }

  // A route may also accept an organization permission over the campus's
  // organization (reference SchoolPolicy::update: "manage organization
  // campuses"). The campus check above still applies.
  private async organizationAllows(
    userId: string,
    school: School,
    permission: OrganizationPermissionName | undefined,
  ): Promise<boolean> {
    if (!permission) return false;
    // Resolved at run time: OrganizationsModule depends on this module.
    const organizations = this.moduleRef.get(OrganizationAccess, {
      strict: false,
    });
    return organizations.allows(
      this.dataSource.manager,
      userId,
      school.organizationId,
      permission,
    );
  }

  private async resolveCampus(
    req: Request,
    userId: string,
  ): Promise<CampusAccess> {
    const header = req.headers[SCHOOL_HEADER.toLowerCase()];
    const schoolId = typeof header === 'string' ? header.trim() : '';
    if (!isUUID(schoolId)) {
      throw new ValidationFailed(
        {
          [SCHOOL_HEADER]: [
            'Send the id of your working campus in the X-School-Id header.',
          ],
        },
        'Choose a working campus.',
      );
    }

    const manager = this.dataSource.manager;
    const [school, globalPermissions] = await Promise.all([
      manager.findOne(School, { where: { id: schoolId } }),
      this.resolver.globalPermissions(userId, manager),
    ]);
    // An unknown campus answers like one the person may not open, so the
    // header cannot be used to find out which campuses exist.
    if (!school) throw new Forbidden(NO_CAMPUS_ACCESS);
    const allowed =
      globalPermissions.has(PlatformPermission.AccessAllSchools) ||
      (await manager.exists(SchoolMembership, {
        where: { userId, schoolId, status: 'active' },
      }));
    if (!allowed) throw new Forbidden(NO_CAMPUS_ACCESS);

    const requestContext = currentRequest();
    if (requestContext) requestContext.schoolId = school.id;
    return {
      school,
      permissions: await this.resolver.campusPermissions(
        userId,
        school.id,
        manager,
      ),
      globalPermissions,
    };
  }
}
