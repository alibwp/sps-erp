import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  Campus,
  type CampusAccess,
  CampusRoute,
  RequireFeature,
  RequirePermission,
  RequireVerifiedEmail,
} from '../access/access-context.js';
import { Clock } from '../common/clock/clock.js';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import type { Paginated } from '../common/pagination/pagination.js';
import type { User } from '../identity/entities/user.entity.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import type { StaffAvailability } from './entities/staff-availability.entity.js';
import type { StaffCredential } from './entities/staff-credential.entity.js';
import type { StaffProfile } from './entities/staff-profile.entity.js';
import { StaffProfiles } from './staff-profiles.service.js';
import {
  CreateStaffProfileDto,
  CredentialInputDto,
  HoursInputDto,
  StaffCredentialDto,
  StaffHoursDto,
  StaffProfileDetailDto,
  StaffProfileDto,
  StaffProfileQueryDto,
  UpdateStaffProfileDto,
} from './staff.dto.js';

const ERRORS = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;
const WRITE_ERRORS = [...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY] as const;

const person = (user: User | null | undefined) =>
  user ? { id: user.id, name: user.name } : null;

function profileDto(profile: StaffProfile): StaffProfileDto {
  return {
    id: profile.id,
    userId: profile.userId,
    name: profile.user.name,
    email: profile.user.email,
    staffNumber: profile.staffNumber,
    jobTitle: profile.jobTitle,
    department: profile.department,
    employmentType: profile.employmentType,
    status: profile.status,
    joinedOn: profile.joinedOn,
    leftOn: profile.leftOn,
    createdAt: profile.createdAt,
  };
}

function credentialDto(
  credential: StaffCredential,
  today: string,
): StaffCredentialDto {
  return {
    id: credential.id,
    type: credential.type,
    name: credential.name,
    issuer: credential.issuer,
    reference: credential.reference,
    issuedOn: credential.issuedOn,
    expiresOn: credential.expiresOn,
    expired: credential.expiresOn !== null && credential.expiresOn < today,
    verifiedAt: credential.verifiedAt,
    verifiedBy: person(credential.verifiedBy),
  };
}

function hoursDto(hours: StaffAvailability): StaffHoursDto {
  return {
    id: hours.id,
    dayOfWeek: hours.dayOfWeek,
    startsAt: hours.startsAt.slice(0, 5),
    endsAt: hours.endsAt.slice(0, 5),
  };
}

const viewer = (auth: AuthContext, campus: CampusAccess) => ({
  id: auth.user.id,
  permissions: campus.permissions,
});

// Employment records (reference StaffProfileController, StaffProfileRecord,
// StaffProfilePolicy). The whole of staff operations answers 404 while the
// campus has the feature switched off.
@ApiTags('Staff profiles')
@ApiBearerAuth('bearer')
@CampusRoute()
@RequireFeature('staff_operations')
@Controller('staff-profiles')
export class StaffProfilesController {
  constructor(
    private readonly profiles: StaffProfiles,
    private readonly clock: Clock,
  ) {}

  @Get()
  @RequirePermission('read staff profile')
  @ApiOperation({ summary: 'The campus’s employment records' })
  @ApiOkResponse({ type: [StaffProfileDto] })
  @ApiErrorResponses(...ERRORS)
  async list(
    @Campus() campus: CampusAccess,
    @Query() query: StaffProfileQueryDto,
  ): Promise<Paginated<StaffProfileDto>> {
    const page = await this.profiles.list(campus.school.id, query);
    return { data: page.data.map(profileDto), meta: page.meta };
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('create staff profile')
  @ApiOperation({
    summary: 'Open an employment record',
    description:
      'For a member of this campus who has none here. Refused for an enrolled learner; a staff number is unique here ignoring case.',
  })
  @ApiCreatedResponse({ type: StaffProfileDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async create(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Body() body: CreateStaffProfileDto,
  ): Promise<StaffProfileDetailDto> {
    const profile = await this.profiles.create(
      auth.user.id,
      campus.school.id,
      body,
    );
    return this.detail(campus, profile.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One employment record, with credentials and hours',
    description: '"read staff profile", or your own record.',
  })
  @ApiOkResponse({ type: StaffProfileDetailDto })
  @ApiErrorResponses(...ERRORS)
  async show(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StaffProfileDetailDto> {
    await this.profiles.find(campus.school.id, id, viewer(auth, campus));
    return this.detail(campus, id);
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  @RequirePermission('update staff profile')
  @ApiOperation({
    summary: 'Change an employment record',
    description:
      'Status "left" records the last working day (leftOn, or today): their leave after it is cancelled, their duties end from the next day, and their access ends once campus today is after it. Refused before the joining day, for a person who holds more than you, and for the campus’s last role manager. Taking a leaver back gives them their membership again.',
  })
  @ApiOkResponse({ type: StaffProfileDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStaffProfileDto,
  ): Promise<StaffProfileDetailDto> {
    await this.profiles.update(auth.user.id, campus.school.id, id, body);
    return this.detail(campus, id);
  }

  @Post(':id/credentials')
  @RequireVerifiedEmail()
  @RequirePermission('update staff profile')
  @ApiOperation({ summary: 'Add a credential' })
  @ApiCreatedResponse({ type: StaffCredentialDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async addCredential(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CredentialInputDto,
  ): Promise<StaffCredentialDto> {
    const credential = await this.profiles.addCredential(
      campus.school.id,
      id,
      body,
    );
    return credentialDto(credential, this.today(campus));
  }

  @Post(':id/credentials/:credentialId/verify')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update staff profile')
  @ApiOperation({
    summary: 'Verify a credential',
    description:
      'Records who verified it and when. Nobody verifies their own credential.',
  })
  @ApiOkResponse({ type: StaffCredentialDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async verifyCredential(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('credentialId', ParseUUIDPipe) credentialId: string,
  ): Promise<StaffCredentialDto> {
    await this.profiles.verifyCredential(
      auth.user.id,
      campus.school.id,
      id,
      credentialId,
    );
    const credential = (await this.profiles.credentials(id)).find(
      (one) => one.id === credentialId,
    )!;
    return credentialDto(credential, this.today(campus));
  }

  @Delete(':id/credentials/:credentialId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireVerifiedEmail()
  @RequirePermission('update staff profile')
  @ApiOperation({ summary: 'Remove a credential' })
  @ApiNoContentResponse()
  @ApiErrorResponses(...WRITE_ERRORS)
  async removeCredential(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('credentialId', ParseUUIDPipe) credentialId: string,
  ): Promise<void> {
    await this.profiles.removeCredential(campus.school.id, id, credentialId);
  }

  @Post(':id/availability')
  @RequireVerifiedEmail()
  @RequirePermission('update staff profile')
  @ApiOperation({
    summary: 'Add weekly hours',
    description: 'Hours of one day never overlap.',
  })
  @ApiCreatedResponse({ type: StaffHoursDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async addHours(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: HoursInputDto,
  ): Promise<StaffHoursDto> {
    return hoursDto(await this.profiles.addHours(campus.school.id, id, body));
  }

  @Delete(':id/availability/:hoursId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireVerifiedEmail()
  @RequirePermission('update staff profile')
  @ApiOperation({ summary: 'Remove weekly hours' })
  @ApiNoContentResponse()
  @ApiErrorResponses(...WRITE_ERRORS)
  async removeHours(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('hoursId', ParseUUIDPipe) hoursId: string,
  ): Promise<void> {
    await this.profiles.removeHours(campus.school.id, id, hoursId);
  }

  private async detail(
    campus: CampusAccess,
    id: string,
  ): Promise<StaffProfileDetailDto> {
    const profile = await this.profiles.find(campus.school.id, id);
    const today = this.today(campus);
    return {
      ...profileDto(profile),
      credentials: (await this.profiles.credentials(id)).map((c) =>
        credentialDto(c, today),
      ),
      availability: (await this.profiles.hours(id)).map(hoursDto),
    };
  }

  private today(campus: CampusAccess): string {
    return this.clock.schoolToday(campus.school.timezone);
  }
}
