import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessModule } from '../access/access.module.js';
import { BillingGroups } from './billing-groups.service.js';
import { CampusController } from './campus.controller.js';
import { Campuses } from './campuses.service.js';
import { BillingGroup } from './entities/billing-group.entity.js';
import { OrganizationMembership } from './entities/organization-membership.entity.js';
import { Organization } from './entities/organization.entity.js';
import { SchoolMembership } from './entities/school-membership.entity.js';
import { SchoolOperatingProfile } from './entities/school-operating-profile.entity.js';
import { School } from './entities/school.entity.js';
import { OrganizationAccess } from './organization-access.service.js';
import { OrganizationMembers } from './organization-members.service.js';
import { OrganizationsController } from './organizations.controller.js';
import { Organizations } from './organizations.service.js';
import { SchoolContext } from './school-context.service.js';
import { SchoolMemberships } from './school-memberships.service.js';

// Stage 2: organizations, campuses, campus and organization memberships,
// billing groups and operating profiles.
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      School,
      SchoolMembership,
      OrganizationMembership,
      BillingGroup,
      SchoolOperatingProfile,
    ]),
    AccessModule,
  ],
  controllers: [OrganizationsController, CampusController],
  providers: [
    OrganizationAccess,
    Organizations,
    Campuses,
    BillingGroups,
    OrganizationMembers,
    SchoolMemberships,
    SchoolContext,
  ],
  exports: [
    OrganizationAccess,
    Organizations,
    Campuses,
    OrganizationMembers,
    SchoolMemberships,
    SchoolContext,
  ],
})
export class OrganizationsModule {}
