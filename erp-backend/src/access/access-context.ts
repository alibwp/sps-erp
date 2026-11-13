import {
  ExecutionContext,
  SetMetadata,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';
import { SCHOOL_HEADER } from '../common/openapi/openapi.js';
import type { Feature } from '../features/features.js';
import type { OrganizationPermissionName } from './access.constants.js';
import type { School } from '../organizations/entities/school.entity.js';

// The working campus of a campus route, checked by AccessGuard, and what
// the signed-in person may do there (loaded once per request).
export interface CampusAccess {
  school: School;
  // Campus roles held there plus global roles.
  permissions: ReadonlySet<string>;
  // Global roles only (platform-admin, organization-admin).
  globalPermissions: ReadonlySet<string>;
}

declare module 'express' {
  interface Request {
    campus?: CampusAccess;
  }
}

export const CAMPUS_ROUTE = 'access:campus';
export const REQUIRED_PERMISSIONS = 'access:permissions';
export const REQUIRED_FEATURE = 'access:feature';
export const VERIFIED_EMAIL = 'access:verified-email';
export const ORGANIZATION_PERMISSION_FALLBACK = 'access:organization-fallback';
export const ALLOW_GRADUATED = 'access:allow-graduated';

// The route works inside one campus, named by the X-School-Id header. The
// person must have an active membership there or hold "access all schools";
// otherwise 403.
export const CampusRoute = () =>
  applyDecorators(
    SetMetadata(CAMPUS_ROUTE, true),
    ApiHeader({
      name: SCHOOL_HEADER,
      required: true,
      description:
        'Working campus (UUID). Must match an active school membership, unless you hold "access all schools".',
    }),
  );

// Any one of these campus permissions is enough. Implies a campus route.
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

// The route also accepts this organization permission over the working
// campus's organization, instead of the campus permission (reference
// SchoolPolicy::update accepts "manage organization campuses"). The person
// still needs access to the campus.
export const OrAllowOrganizationPermission = (
  permission: OrganizationPermissionName,
) => SetMetadata(ORGANIZATION_PERMISSION_FALLBACK, permission);

// The route belongs to a feature a campus can switch off. While it is off
// the route answers 404 to everyone, before any permission check.
export const RequireFeature = (feature: Feature) =>
  SetMetadata(REQUIRED_FEATURE, feature);

// A learner who graduated from the working campus may still use the route
// (their own account and context; the portal from Stage 13). Every other
// campus route answers them 403 (reference PreventGraduatedStudent).
export const AllowGraduatedLearners = () => SetMetadata(ALLOW_GRADUATED, true);

// Administration routes need a verified email address (403
// email_not_verified otherwise).
export const RequireVerifiedEmail = () => SetMetadata(VERIFIED_EMAIL, true);

export const Campus = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CampusAccess => {
    const campus = context.switchToHttp().getRequest<Request>().campus;
    if (!campus)
      throw new Error('Campus used on a route that is not a campus route');
    return campus;
  },
);
