import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessModule } from '../access/access.module.js';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { StaffAvailability } from './entities/staff-availability.entity.js';
import { StaffCredential } from './entities/staff-credential.entity.js';
import { StaffProfile } from './entities/staff-profile.entity.js';
import { StaffProfiles } from './staff-profiles.service.js';
import { StaffProfilesController } from './staff.controllers.js';

// Stage 5 part 4: staff operations, behind the staff_operations feature.
// Employment records, weekly availability, credentials, leave, and the
// daily job ending leavers' access. Stage 8 registers the cover check
// (StaffLeave.registerApprovalCheck).
@Module({
  imports: [
    TypeOrmModule.forFeature([
      StaffProfile,
      StaffCredential,
      StaffAvailability,
    ]),
    AccessModule,
    OrganizationsModule,
    CurriculumModule,
  ],
  controllers: [StaffProfilesController],
  providers: [StaffProfiles],
  exports: [StaffProfiles],
})
export class StaffModule {}
