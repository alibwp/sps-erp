import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessModule } from '../access/access.module.js';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { StaffAvailability } from './entities/staff-availability.entity.js';
import { StaffCredential } from './entities/staff-credential.entity.js';
import { StaffLeaveRequest } from './entities/staff-leave-request.entity.js';
import { StaffLeaveStatusChange } from './entities/staff-leave-status-change.entity.js';
import { StaffProfile } from './entities/staff-profile.entity.js';
import { StaffLeave } from './staff-leave.service.js';
import { StaffProfiles } from './staff-profiles.service.js';
import {
  StaffLeaveController,
  StaffProfilesController,
} from './staff.controllers.js';

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
      StaffLeaveRequest,
      StaffLeaveStatusChange,
    ]),
    AccessModule,
    OrganizationsModule,
    CurriculumModule,
  ],
  controllers: [StaffProfilesController, StaffLeaveController],
  providers: [StaffProfiles, StaffLeave],
  exports: [StaffProfiles, StaffLeave],
})
export class StaffModule {}
