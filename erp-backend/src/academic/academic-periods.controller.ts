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
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import {
  Campus,
  type CampusAccess,
  CampusRoute,
  RequirePermission,
  RequireVerifiedEmail,
} from '../access/access-context.js';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import { findInSchool } from '../common/tenancy/school-scope.js';
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
  PeriodDto,
  StatusChangeRequestDto,
  StatusHistoryDto,
  UpdatePeriodDto,
} from './academic.dto.js';
import { ClosureReadiness } from './closure-readiness.service.js';
import { AcademicPeriod } from './entities/academic-period.entity.js';

const ERRORS = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;
const WRITE_ERRORS = [...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY] as const;

// One period of a school year of the working campus.
@ApiTags('Academic calendar')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('academic-periods')
export class AcademicPeriodsController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly calendar: AcademicCalendar,
    private readonly lifecycle: AcademicLifecycle,
    private readonly queries: AcademicQueries,
    private readonly readiness: ClosureReadiness,
  ) {}

  @Get(':id')
  @RequirePermission('read academic period')
  @ApiOperation({ summary: 'One period with the periods inside it' })
  @ApiOkResponse({ type: PeriodDto })
  @ApiErrorResponses(...ERRORS)
  show(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PeriodDto> {
    return this.queries.periodDetail(campus.school.id, id);
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  @RequirePermission('update academic period')
  @ApiOperation({
    summary: 'Rename a period, or change its label, type or position',
    description: 'Dates change through PUT /academic-periods/{id}/dates.',
  })
  @ApiOkResponse({ type: PeriodDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async update(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePeriodDto,
  ): Promise<PeriodDto> {
    await this.calendar.updatePeriod(campus.school.id, id, body);
    return this.queries.periodDetail(campus.school.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireVerifiedEmail()
  @RequirePermission('delete academic period')
  @ApiOperation({
    summary: 'Delete a draft period',
    description: 'Only a draft that never changed status; archive the others.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(...WRITE_ERRORS)
  async remove(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.calendar.deletePeriod(campus.school.id, id);
  }

  @Put(':id/dates')
  @RequireVerifiedEmail()
  @RequirePermission('update academic period')
  @ApiOperation({
    summary: 'Change the dates of a period',
    description:
      'A closed period keeps its dates; one in use needs a reason. It must stay inside its parent or year, hold its sub-periods and not overlap a sibling.',
  })
  @ApiOkResponse({ type: PeriodDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async changeDates(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChangeDatesDto,
  ): Promise<PeriodDto> {
    await this.calendar.changeDates({
      kind: 'academic_period',
      id,
      schoolId: campus.school.id,
      startsOn: body.startsOn,
      endsOn: body.endsOn,
      reason: body.reason ?? null,
    });
    return this.queries.periodDetail(campus.school.id, id);
  }

  @Post(':id/status-changes')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission(
    'update academic period',
    'close academic period',
    'reopen academic period',
  )
  @ApiOperation({
    summary: 'Move a period to another status',
    description:
      'As for years. A period cannot reopen while its year or parent is closed; closing it closes the periods inside.',
  })
  @ApiOkResponse({ type: PeriodDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async changeStatus(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatusChangeRequestDto,
  ): Promise<PeriodDto> {
    await this.lifecycle.transition({
      kind: 'academic_period',
      id,
      schoolId: campus.school.id,
      to: body.to,
      reason: body.reason ?? null,
      force: body.force ?? false,
      actorId: auth.user.id,
      permissions: campus.permissions,
    });
    return this.queries.periodDetail(campus.school.id, id);
  }

  @Get(':id/status-changes')
  @RequirePermission('read academic period')
  @ApiOperation({ summary: 'The status history of a period' })
  @ApiOkResponse({ type: [StatusHistoryDto] })
  @ApiErrorResponses(...ERRORS)
  history(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StatusHistoryDto[]> {
    return this.queries.history(campus.school.id, 'academic_period', id);
  }

  @Get(':id/closure-readiness')
  @RequirePermission('close academic period')
  @ApiOperation({ summary: 'What closing the period would leave behind' })
  @ApiOkResponse({ type: ClosureReadinessDto })
  @ApiErrorResponses(...ERRORS)
  async closureReadiness(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClosureReadinessDto> {
    const manager = this.dataSource.manager;
    const period = await findInSchool(
      manager,
      AcademicPeriod,
      { id },
      { schoolId: campus.school.id, notFound: 'Academic period not found.' },
    );
    const findings = await this.readiness.forPeriod(manager, period);
    return { ready: !findings.some((finding) => finding.blocking), findings };
  }
}
