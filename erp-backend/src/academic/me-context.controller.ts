import { Body, Controller, Get, HttpStatus, Put, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import {
  AllowGraduatedLearners,
  Campus,
  type CampusAccess,
  CampusRoute,
  RequirePermission,
} from '../access/access-context.js';
import { Forbidden } from '../access/access.constants.js';
import { NO_CAMPUS_ACCESS } from '../access/access.guard.js';
import { ValidationFailed } from '../common/errors/api-exception.js';
import { ApiErrorResponses, SCHOOL_HEADER } from '../common/openapi/openapi.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import { School } from '../organizations/entities/school.entity.js';
import { SchoolContext } from '../organizations/school-context.service.js';
import { AcademicQueries } from './academic-queries.service.js';
import { PeriodDto, SetWorkingContextDto, YearDto } from './academic.dto.js';
import {
  AcademicPeriodContext,
  type WorkingPeriod,
} from './academic-period-context.service.js';
import { academicPeriodHeader, periodHeader } from './academic-period.guard.js';

class ContextOrganizationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

class ContextCampusDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() code: string;
  @ApiProperty({ nullable: true, type: String }) initials: string | null;
  @ApiProperty() timezone: string;
  @ApiProperty({ type: ContextOrganizationDto })
  organization: ContextOrganizationDto;
  @ApiProperty() isPrimary: boolean;
}

class WorkingDto {
  @ApiProperty({ format: 'uuid' }) schoolId: string;
  @ApiProperty({ type: YearDto, nullable: true }) academicYear: YearDto | null;
  @ApiProperty({ type: PeriodDto, nullable: true })
  academicPeriod: PeriodDto | null;
  @ApiProperty({
    enum: ['header', 'preference', 'calendar', 'campus_default'],
    nullable: true,
    type: String,
    description: 'Where the period came from',
  })
  source: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Two top-level periods cover campus today: routes that need a period answer 409 until their dates are fixed',
  })
  periodError: string | null;
}

export class WorkingContextDto {
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Send this as X-School-Id unless the person picks another',
  })
  defaultSchoolId: string | null;
  @ApiProperty({ type: [ContextCampusDto] }) campuses: ContextCampusDto[];
  @ApiProperty({
    type: WorkingDto,
    nullable: true,
    description:
      'The working year and period at the campus named by X-School-Id, or the default campus',
  })
  working: WorkingDto | null;
}

@ApiTags('Me')
@ApiBearerAuth('bearer')
@AllowGraduatedLearners()
@Controller('me')
export class MeContextController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly schools: SchoolContext,
    private readonly periods: AcademicPeriodContext,
    private readonly queries: AcademicQueries,
  ) {}

  @Get('context')
  @ApiHeader({
    name: SCHOOL_HEADER,
    required: false,
    description:
      'The campus to work out the working period for; default campus when absent',
  })
  @academicPeriodHeader()
  @ApiOperation({
    summary: 'Your campuses, the default one, and your working year and period',
    description:
      'Default campus: your primary campus, then your oldest membership; with "access all schools" and no membership, the first campus. Working period: X-Academic-Period-Id, then your saved choice, then the period covering campus today, then the campus default.',
  })
  @ApiOkResponse({ type: WorkingContextDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  async show(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<WorkingContextDto> {
    const context = await this.schools.forUser(auth.user.id);
    const header = req.headers[SCHOOL_HEADER.toLowerCase()];
    let schoolId = context.defaultSchoolId;
    if (header !== undefined) {
      const id = typeof header === 'string' ? header.trim() : '';
      if (!isUUID(id)) {
        throw new ValidationFailed({
          [SCHOOL_HEADER]: [
            'Send the id of your working campus in the X-School-Id header.',
          ],
        });
      }
      if (!context.campuses.some((campus) => campus.id === id)) {
        throw new Forbidden(NO_CAMPUS_ACCESS);
      }
      schoolId = id;
    }
    if (!schoolId) return { ...context, working: null };

    const school = await this.dataSource.manager.findOneOrFail(School, {
      where: { id: schoolId },
    });
    const working = await this.periods.resolve(
      auth.user.id,
      school,
      periodHeader(req),
    );
    return { ...context, working: this.working(school, working) };
  }

  @Put('context')
  @CampusRoute()
  @RequirePermission('set academic year', 'set academic period')
  @ApiOperation({
    summary: 'Save your working year and/or period at the campus',
    description:
      'academicYearId needs "set academic year" (a published year; your earlier choice in it is kept, else its first period). academicPeriodId needs "set academic period" (a top-level period of the working year).',
  })
  @ApiOkResponse({ type: WorkingContextDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  async update(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Body() body: SetWorkingContextDto,
  ): Promise<WorkingContextDto> {
    const working = await this.periods.setWorking(
      auth.user.id,
      campus.school,
      campus.permissions,
      body,
    );
    const context = await this.schools.forUser(auth.user.id);
    const school = await this.dataSource.manager.findOneOrFail(School, {
      where: { id: campus.school.id },
    });
    return { ...context, working: this.working(school, working) };
  }

  private working(school: School, working: WorkingPeriod): WorkingDto {
    return {
      schoolId: school.id,
      academicYear: working.academicYear
        ? this.queries.year(working.academicYear, school)
        : null,
      academicPeriod: working.academicPeriod
        ? this.queries.period(working.academicPeriod)
        : null,
      source: working.source,
      periodError: working.error,
    };
  }
}
