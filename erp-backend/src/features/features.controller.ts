import {
  Body,
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional } from 'class-validator';
import {
  Campus,
  type CampusAccess,
  CampusRoute,
  OrAllowOrganizationPermission,
  RequirePermission,
  RequireVerifiedEmail,
} from '../access/access-context.js';
import {
  CampusPermission,
  OrganizationPermission,
} from '../access/access.constants.js';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import { type FeatureState, FeatureService } from './feature.service.js';
import { FEATURES, isFeature } from './features.js';

export class FeatureStateDto {
  @ApiProperty({ enum: FEATURES }) feature: string;
  @ApiProperty() label: string;
  @ApiProperty() description: string;
  @ApiProperty() group: string;
  @ApiProperty() enabled: boolean;
  @ApiProperty() defaultEnabled: boolean;
  @ApiProperty({ enum: ['campus', 'platform', 'default'] }) source: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    nullable: true,
    description:
      'attendance: daily_register, lesson_register; portal: one switch per area. Every switch defaults to on.',
  })
  config: Record<string, boolean> | null;
}

export class SetFeatureDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    example: { results: true, invoices: false },
    description: 'Switches to change; the ones not sent keep their value.',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

// The feature switches of the working campus (reference
// ManageSchoolFeatures). Any member may read them, so menus can hide
// switched-off features; changing them needs what PATCH /school needs.
@ApiTags('Campus settings')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('school/features')
export class FeaturesController {
  constructor(private readonly features: FeatureService) {}

  @Get()
  @ApiOperation({ summary: 'Which features are on at this campus' })
  @ApiOkResponse({ type: [FeatureStateDto] })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  list(@Campus() campus: CampusAccess): Promise<FeatureState[]> {
    return this.features.list(campus.school.id);
  }

  @Put(':feature')
  @RequireVerifiedEmail()
  // Reference SchoolPolicy::update, as PATCH /school.
  @RequirePermission(
    CampusPermission.UpdateSchool,
    CampusPermission.ManageSchoolSettings,
  )
  @OrAllowOrganizationPermission(OrganizationPermission.ManageCampuses)
  @ApiOperation({
    summary: 'Switch a feature on or off at this campus',
    description:
      'Switching off closes the feature’s routes (404) and keeps its records.',
  })
  @ApiParam({ name: 'feature', enum: FEATURES })
  @ApiOkResponse({ type: FeatureStateDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  set(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('feature') feature: string,
    @Body() body: SetFeatureDto,
  ): Promise<FeatureState> {
    if (!isFeature(feature)) throw new NotFoundException('Unknown feature.');
    return this.features.set(
      auth.user.id,
      campus.school.id,
      feature,
      body.enabled,
      body.config,
    );
  }
}
