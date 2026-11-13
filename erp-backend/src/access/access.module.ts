import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeaturesModule } from '../features/features.module.js';
import { AccessGuard } from './access.guard.js';
import { CampusRoles } from './campus-roles.service.js';
import { Permission } from './entities/permission.entity.js';
import { RoleAssignment } from './entities/role-assignment.entity.js';
import { RolePermission } from './entities/role-permission.entity.js';
import { Role } from './entities/role.entity.js';
import { MePermissionsController } from './me-permissions.controller.js';
import { PermissionResolver } from './permission-resolver.service.js';
import { RoleAssignments } from './role-assignments.service.js';
import { RoleAuthority } from './role-authority.service.js';
import { RoleQueries } from './role-queries.service.js';
import { RolesController } from './roles.controller.js';

// Stage 2: permissions, roles (built-in, shared and campus-written), who
// holds which role where, and the guard that checks every request's campus,
// feature, verified email and permission.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Permission,
      Role,
      RolePermission,
      RoleAssignment,
    ]),
    FeaturesModule,
  ],
  controllers: [RolesController, MePermissionsController],
  providers: [
    PermissionResolver,
    RoleAuthority,
    RoleAssignments,
    CampusRoles,
    RoleQueries,
    AccessGuard,
  ],
  exports: [
    PermissionResolver,
    RoleAuthority,
    RoleAssignments,
    CampusRoles,
    RoleQueries,
    AccessGuard,
  ],
})
export class AccessModule {}
