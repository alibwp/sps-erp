import {
  Body,
  Controller,
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
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import type { StudentRecord } from '../enrollments/entities/student-record.entity.js';
import type { User } from '../identity/entities/user.entity.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import { Cohorts } from './cohorts.service.js';
import {
  CohortDto,
  CohortMemberDto,
  CohortQueryDto,
  CreateCohortDto,
  JoinCohortDto,
  LeaveCohortDto,
  MembersQueryDto,
  UpdateCohortDto,
} from './cohorts.dto.js';
import type { CohortMember } from './entities/cohort-member.entity.js';
import type { Cohort } from './entities/cohort.entity.js';

const ERRORS = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;
const WRITE_ERRORS = [...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY] as const;

const person = (user: User | null | undefined) =>
  user ? { id: user.id, name: user.name } : null;

const learner = (enrollment: StudentRecord) => ({
  id: enrollment.user.id,
  name: enrollment.user.name,
  studentId: enrollment.id,
  admissionNumber: enrollment.admissionNumber,
});

function cohortDto(cohort: Cohort, currentMembers: number): CohortDto {
  return {
    id: cohort.id,
    name: cohort.name,
    type: cohort.type,
    description: cohort.description,
    isRestricted: cohort.isRestricted,
    isActive: cohort.isActive,
    academicYearId: cohort.academicYearId,
    currentMembers,
    createdAt: cohort.createdAt,
  };
}

function memberDto(member: CohortMember): CohortMemberDto {
  return {
    id: member.id,
    learner: learner(member.studentRecord),
    joinedOn: member.joinedOn,
    leftOn: member.leftOn,
    addedBy: person(member.addedBy),
  };
}

const reader = (auth: AuthContext, campus: CampusAccess) => ({
  id: auth.user.id,
  permissions: campus.permissions,
});

// Cohorts (reference CohortController, CohortDirectory, CohortRecord,
// CohortPolicy). A restricted cohort and its members are not found by
// anyone without "read restricted cohort".
@ApiTags('Cohorts')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('cohorts')
export class CohortsController {
  constructor(private readonly cohorts: Cohorts) {}

  @Get()
  @RequirePermission('read cohort')
  @ApiOperation({
    summary: 'The campus’s cohorts',
    description: 'Restricted cohorts only for "read restricted cohort".',
  })
  @ApiOkResponse({ type: [CohortDto] })
  @ApiErrorResponses(...ERRORS)
  async list(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Query() query: CohortQueryDto,
  ): Promise<CohortDto[]> {
    return (
      await this.cohorts.list(campus.school.id, reader(auth, campus), query)
    ).map(({ cohort, currentMembers }) => cohortDto(cohort, currentMembers));
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('create cohort')
  @ApiOperation({
    summary: 'Make a cohort',
    description:
      'The name is unique here ignoring case. A watchlist is always restricted; other cohorts are restricted only by someone holding "read restricted cohort".',
  })
  @ApiCreatedResponse({ type: CohortDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async create(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Body() body: CreateCohortDto,
  ): Promise<CohortDto> {
    const cohort = await this.cohorts.create(
      reader(auth, campus),
      campus.school,
      body,
    );
    return cohortDto(cohort, 0);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One cohort',
    description:
      '"read cohort"; a restricted cohort needs "read restricted cohort" and is not found otherwise.',
  })
  @ApiOkResponse({ type: CohortDto })
  @ApiErrorResponses(...ERRORS)
  async show(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CohortDto> {
    const cohort = await this.cohorts.find(
      campus.school.id,
      id,
      reader(auth, campus),
    );
    return cohortDto(
      cohort,
      (await this.cohorts.members(cohort.id, true)).length,
    );
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  @RequirePermission('update cohort')
  @ApiOperation({ summary: 'Change a cohort' })
  @ApiOkResponse({ type: CohortDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateCohortDto,
  ): Promise<CohortDto> {
    const cohort = await this.cohorts.update(
      reader(auth, campus),
      campus.school,
      id,
      body,
    );
    return cohortDto(
      cohort,
      (await this.cohorts.members(cohort.id, true)).length,
    );
  }

  @Get(':id/members')
  @ApiOperation({
    summary: 'The cohort’s members, past and present',
    description: 'Seen as the cohort is.',
  })
  @ApiOkResponse({ type: [CohortMemberDto] })
  @ApiErrorResponses(...ERRORS)
  async members(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MembersQueryDto,
  ): Promise<CohortMemberDto[]> {
    const cohort = await this.cohorts.find(
      campus.school.id,
      id,
      reader(auth, campus),
    );
    return (
      await this.cohorts.members(cohort.id, query.currentOnly ?? false)
    ).map(memberDto);
  }

  @Post(':id/members')
  @RequireVerifiedEmail()
  @RequirePermission('update cohort')
  @ApiOperation({
    summary: 'A learner joins the cohort',
    description:
      'Only a learner attending this campus, never on a day still ahead, never an inactive cohort. A learner who left joins again in a new membership.',
  })
  @ApiCreatedResponse({ type: CohortMemberDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async join(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: JoinCohortDto,
  ): Promise<CohortMemberDto> {
    const member = await this.cohorts.join(
      reader(auth, campus),
      campus.school.id,
      id,
      body,
    );
    return this.member(member.cohortId, member.id);
  }

  @Post(':id/members/:memberId/leave')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update cohort')
  @ApiOperation({
    summary: 'A member leaves the cohort',
    description:
      'Sets the leaving day; the membership stays as history. Leaving twice is refused.',
  })
  @ApiOkResponse({ type: CohortMemberDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async leave(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() body: LeaveCohortDto,
  ): Promise<CohortMemberDto> {
    await this.cohorts.leave(
      reader(auth, campus),
      campus.school.id,
      id,
      memberId,
      body.leftOn ?? null,
    );
    return this.member(id, memberId);
  }

  private async member(
    cohortId: string,
    memberId: string,
  ): Promise<CohortMemberDto> {
    const member = (await this.cohorts.members(cohortId, false)).find(
      (one) => one.id === memberId,
    )!;
    return memberDto(member);
  }
}
