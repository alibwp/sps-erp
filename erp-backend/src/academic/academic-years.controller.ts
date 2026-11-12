import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { DataSource } from 'typeorm';
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
import type { Paginated } from '../common/pagination/pagination.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import { AcademicCalendar } from './academic-calendar.service.js';
import { AcademicLifecycle } from './academic-lifecycle.service.js';
import { AcademicQueries } from './academic-queries.service.js';
import {
  ChangeDatesDto,
  ClosureReadinessDto,
  CreatePeriodDto,
  InstructionalModelDto,
  MigrateInstructionalModelDto,
  ModelMigrationDto,
  PeriodDto,
  RollForwardPreviewDto,
  RollForwardRequestDto,
  RollForwardResultDto,
  SaveCalendarDto,
  SetInstructionalModelDto,
  StatusChangeRequestDto,
  StatusHistoryDto,
  YearDetailDto,
  YearDto,
  YearListQueryDto,
  YearSetupDto,
} from './academic.dto.js';
import { ClosureReadiness } from './closure-readiness.service.js';
import { AcademicYear } from './entities/academic-year.entity.js';
import { InstructionalModels } from './instructional-models.service.js';
import { RollForward } from './roll-forward.service.js';
import { SchoolSetup } from './school-setup.service.js';
import { findInSchool } from '../common/tenancy/school-scope.js';

const READ = ['read academic year', 'read academic period'];
const ERRORS = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;
const WRITE_ERRORS = [...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY] as const;

// The school years of the working campus (reference AcademicCalendarForm,
// ShowAcademicYear, PublishAcademicYear, AcademicPeriodStatusControl,
// ManageInstructionalModel).
@ApiTags('Academic calendar')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('academic-years')
export class AcademicYearsController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly calendar: AcademicCalendar,
    private readonly lifecycle: AcademicLifecycle,
    private readonly queries: AcademicQueries,
    private readonly readiness: ClosureReadiness,
    private readonly rollForward: RollForward,
    private readonly models: InstructionalModels,
    private readonly setup: SchoolSetup,
  ) {}

  @Get()
  @RequirePermission(...READ)
  @ApiOperation({ summary: 'The campus’s school years, newest first' })
  @ApiOkResponse({ type: [YearDto] })
  @ApiErrorResponses(...ERRORS)
  list(
    @Campus() campus: CampusAccess,
    @Query() query: YearListQueryDto,
  ): Promise<Paginated<YearDto>> {
    return this.queries.years(campus.school.id, query);
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('create academic year')
  @ApiOperation({
    summary: 'Create a draft school calendar',
    description:
      'The year and its top-level periods (up to eight). Periods must not overlap and must sit inside the year; the year must not overlap another.',
  })
  @ApiCreatedResponse({ type: YearDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async create(
    @Campus() campus: CampusAccess,
    @Body() body: SaveCalendarDto,
  ): Promise<YearDetailDto> {
    const year = await this.calendar.save(campus.school.id, body);
    return this.queries.yearDetail(campus.school.id, year.id);
  }

  @Get(':id')
  @RequirePermission(...READ)
  @ApiOperation({ summary: 'One school year with its periods' })
  @ApiOkResponse({ type: YearDetailDto })
  @ApiErrorResponses(...ERRORS)
  show(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<YearDetailDto> {
    return this.queries.yearDetail(campus.school.id, id);
  }

  @Put(':id')
  @RequireVerifiedEmail()
  @RequirePermission('update academic year')
  @ApiOperation({
    summary: 'Rewrite a draft school calendar',
    description:
      'Periods listed with their id are kept; periods left out are removed with what is inside them.',
  })
  @ApiOkResponse({ type: YearDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async update(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveCalendarDto,
  ): Promise<YearDetailDto> {
    await this.calendar.save(campus.school.id, body, id);
    return this.queries.yearDetail(campus.school.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireVerifiedEmail()
  @RequirePermission('delete academic year')
  @ApiOperation({
    summary: 'Delete a draft school calendar',
    description: 'Only a draft that was never published; archive the others.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(...WRITE_ERRORS)
  async remove(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.calendar.deleteYear(campus.school.id, id);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update academic year')
  @ApiOperation({
    summary: 'Publish a draft school calendar',
    description:
      'The year and each period become closed, scheduled or open from their dates against campus today. The campus opens in this year (and its first period) by default from now on.',
  })
  @ApiOkResponse({ type: YearDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async publish(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<YearDetailDto> {
    await this.calendar.publish(campus.school.id, id);
    return this.queries.yearDetail(campus.school.id, id);
  }

  @Put(':id/dates')
  @RequireVerifiedEmail()
  @RequirePermission('update academic year')
  @ApiOperation({
    summary: 'Change the dates of a school year',
    description:
      'A closed year keeps its dates; a running one needs a reason. Its periods must still fit and it must not overlap another year.',
  })
  @ApiOkResponse({ type: YearDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async changeDates(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChangeDatesDto,
  ): Promise<YearDetailDto> {
    await this.calendar.changeDates({
      kind: 'academic_year',
      id,
      schoolId: campus.school.id,
      startsOn: body.startsOn,
      endsOn: body.endsOn,
      reason: body.reason ?? null,
    });
    return this.queries.yearDetail(campus.school.id, id);
  }

  @Post(':id/status-changes')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission(
    'update academic year',
    'close academic period',
    'reopen academic period',
  )
  @ApiOperation({
    summary: 'Move a school year to another status',
    description:
      'closing, closed and archived need "close academic period"; reopening from closing or closed needs "reopen academic period" and, from closed, a reason; other moves need "update academic year". Closing or archiving takes the periods along. A close runs the readiness check: blocking findings refuse it unless force is sent.',
  })
  @ApiOkResponse({ type: YearDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async changeStatus(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatusChangeRequestDto,
  ): Promise<YearDetailDto> {
    await this.lifecycle.transition({
      kind: 'academic_year',
      id,
      schoolId: campus.school.id,
      to: body.to,
      reason: body.reason ?? null,
      force: body.force ?? false,
      actorId: auth.user.id,
      permissions: campus.permissions,
    });
    return this.queries.yearDetail(campus.school.id, id);
  }

  @Get(':id/status-changes')
  @RequirePermission(...READ)
  @ApiOperation({ summary: 'The status history of a school year' })
  @ApiOkResponse({ type: [StatusHistoryDto] })
  @ApiErrorResponses(...ERRORS)
  history(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StatusHistoryDto[]> {
    return this.queries.history(campus.school.id, 'academic_year', id);
  }

  @Get(':id/closure-readiness')
  @RequirePermission('close academic period')
  @ApiOperation({
    summary: 'What closing the year would leave behind',
    description:
      'The periods still open, and every period’s findings added up.',
  })
  @ApiOkResponse({ type: ClosureReadinessDto })
  @ApiErrorResponses(...ERRORS)
  async closureReadiness(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClosureReadinessDto> {
    const manager = this.dataSource.manager;
    const year = await findInSchool(
      manager,
      AcademicYear,
      { id },
      { schoolId: campus.school.id, notFound: 'Academic year not found.' },
    );
    const findings = await this.readiness.forYear(manager, year);
    return { ready: !findings.some((finding) => finding.blocking), findings };
  }

  @Post(':id/periods')
  @RequireVerifiedEmail()
  @RequirePermission('create academic period')
  @ApiOperation({
    summary: 'Add a period to a school year',
    description:
      'A top-level period, or with parentId an exam window, holiday or reporting period inside one. In a published year it takes its status from its dates.',
  })
  @ApiCreatedResponse({ type: PeriodDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async createPeriod(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreatePeriodDto,
  ): Promise<PeriodDto> {
    const period = await this.calendar.createPeriod(campus.school.id, id, body);
    return this.queries.periodDetail(campus.school.id, period.id);
  }

  @Get(':id/roll-forward')
  @RequirePermission('update academic year')
  @ApiOperation({
    summary: 'Preview copying another year’s setup into this one',
  })
  @ApiQuery({ name: 'sourceYearId', format: 'uuid', required: true })
  @ApiOkResponse({ type: RollForwardPreviewDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  previewRollForward(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RollForwardRequestDto,
  ): Promise<RollForwardPreviewDto> {
    return this.rollForward.preview(campus.school.id, id, query.sourceYearId);
  }

  @Post(':id/roll-forward')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update academic year')
  @ApiOperation({
    summary: 'Copy another year’s teaching model and periods into this one',
    description:
      'Only what this year lacks is copied; dates move by whole years and the copies start as drafts.',
  })
  @ApiOkResponse({ type: RollForwardResultDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  runRollForward(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RollForwardRequestDto,
  ): Promise<RollForwardResultDto> {
    return this.rollForward.run(
      auth.user.id,
      campus.school.id,
      id,
      body.sourceYearId,
    );
  }

  @Get(':id/instructional-model')
  @RequirePermission(
    'read academic year',
    'manage school settings',
    'migrate instructional model',
  )
  @OrAllowOrganizationPermission(OrganizationPermission.ManageCampuses)
  @ApiOperation({ summary: 'How the campus teaches this year' })
  @ApiOkResponse({ type: InstructionalModelDto })
  @ApiErrorResponses(...ERRORS)
  instructionalModel(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InstructionalModelDto> {
    return this.models.view(campus.school.id, id);
  }

  @Put(':id/instructional-model')
  @RequireVerifiedEmail()
  @RequirePermission('manage school settings')
  @OrAllowOrganizationPermission(OrganizationPermission.ManageCampuses)
  @ApiOperation({
    summary: 'Choose how a year that has not started is taught',
    description: 'A running year is changed with a migration instead.',
  })
  @ApiOkResponse({ type: InstructionalModelDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async setInstructionalModel(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetInstructionalModelDto,
  ): Promise<InstructionalModelDto> {
    await this.models.set(
      auth.user.id,
      campus.school.id,
      id,
      body.model,
      body.reason ?? null,
    );
    return this.models.view(campus.school.id, id);
  }

  @Post(':id/instructional-model/migrations')
  @RequireVerifiedEmail()
  @RequirePermission('migrate instructional model')
  @OrAllowOrganizationPermission(OrganizationPermission.ManageCampuses)
  @ApiOperation({
    summary: 'Move a running year to another teaching model',
    description:
      'Needs a reason; records the impact on the year’s course offerings.',
  })
  @ApiCreatedResponse({ type: ModelMigrationDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async migrateInstructionalModel(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MigrateInstructionalModelDto,
  ): Promise<ModelMigrationDto> {
    const migration = await this.models.migrate(
      auth.user.id,
      campus.school.id,
      id,
      body.model,
      body.reason,
    );
    return {
      id: migration.id,
      fromModel: migration.fromModel,
      toModel: migration.toModel,
      reason: migration.reason,
      impact: migration.impact,
      migratedById: migration.migratedById,
      createdAt: migration.createdAt,
    };
  }

  @Get(':id/setup')
  @RequirePermission('update school', 'manage school settings')
  @OrAllowOrganizationPermission(OrganizationPermission.ManageCampuses)
  @ApiOperation({ summary: 'The setup steps of a school year' })
  @ApiOkResponse({ type: YearSetupDto })
  @ApiErrorResponses(...ERRORS)
  yearSetup(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<YearSetupDto> {
    return this.setup.forYear(campus.school.id, id);
  }
}
