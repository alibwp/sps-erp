import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  Campus,
  type CampusAccess,
  CampusRoute,
  OrAllowOrganizationPermission,
  RequirePermission,
  RequireVerifiedEmail,
} from '../access/access-context.js';
import { OrganizationPermission } from '../access/access.constants.js';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import { SchoolSetupDto } from './academic.dto.js';
import { SchoolSetup, type SchoolSetupState } from './school-setup.service.js';

// The working campus's setup, with the same permission as PATCH /school
// (reference SchoolPolicy::update).
@ApiTags('Campus settings')
@ApiBearerAuth('bearer')
@CampusRoute()
@RequireVerifiedEmail()
@RequirePermission('update school', 'manage school settings')
@OrAllowOrganizationPermission(OrganizationPermission.ManageCampuses)
@Controller('school/setup')
export class SchoolSetupController {
  constructor(private readonly setup: SchoolSetup) {}

  @Get()
  @ApiOperation({
    summary: 'The campus setup: steps, checklist and phase',
    description:
      'The checklist reads your working year. Steps that depend on later modules (classes, sections, subjects, grading scales, students) stay not done until those modules exist.',
  })
  @ApiOkResponse({ type: SchoolSetupDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  show(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
  ): Promise<SchoolSetupState> {
    return this.setup.forSchool(auth.user.id, campus.school);
  }

  @Post('acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm a ready setup',
    description: 'Only once every required item is done (422 otherwise).',
  })
  @ApiOkResponse({ type: SchoolSetupDto })
  @ApiErrorResponses(
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  acknowledge(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
  ): Promise<SchoolSetupState> {
    return this.setup.acknowledge(auth.user.id, campus.school);
  }
}
