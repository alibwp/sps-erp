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
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { RollForwardRequestDto } from '../academic/academic.dto.js';
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
import { CourseOfferings } from './course-offerings.service.js';
import {
  AssignTeacherDto,
  AssignmentDto,
  BulkOfferingsDto,
  BulkResultDto,
  CreateOfferingDto,
  EndAssignmentDto,
  ExceptionDto,
  GrantExceptionDto,
  OfferingDto,
  OfferingListQueryDto,
  OfferingRollForwardPreviewDto,
  OfferingRollForwardResultDto,
  RenameOfferingDto,
  RosterDto,
  RosterQueryDto,
  SectionRollForwardPreviewDto,
  SectionRollForwardResultDto,
  StatusChangeDto,
  UpdateRosterDto,
} from './curriculum.dto.js';
import { CurriculumViews } from './curriculum-views.service.js';
import { CycleSections } from './cycle-sections.service.js';
import { InstructionalModelException } from './entities/instructional-model-exception.entity.js';
import { OfferingExceptions } from './offering-exceptions.service.js';
import { OfferingRollForward } from './offering-roll-forward.service.js';
import { OfferingRoster } from './offering-roster.service.js';
import { TeachingAssignments } from './teaching-assignments.service.js';

const ERRORS = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;
const WRITE_ERRORS = [...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY] as const;

// What the campus teaches (reference CreateCourseOffering,
// SetUpSubjectAcrossLevels, EditCourseOfferingRoster, CourseOfferingDirectory,
// CourseOfferingPolicy: the "subject" permissions).
@ApiTags('Course offerings')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('course-offerings')
export class CourseOfferingsController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly offerings: CourseOfferings,
    private readonly roster: OfferingRoster,
    private readonly assignments: TeachingAssignments,
    private readonly views: CurriculumViews,
  ) {}

  @Get()
  @RequirePermission('read subject')
  @ApiOperation({ summary: 'The campus’s course offerings' })
  @ApiOkResponse({ type: [OfferingDto] })
  @ApiErrorResponses(...ERRORS)
  async list(
    @Campus() campus: CampusAccess,
    @Query() query: OfferingListQueryDto,
  ): Promise<Paginated<OfferingDto>> {
    const page = await this.offerings.list(campus.school.id, query);
    return { data: await this.views.offerings(page.data), meta: page.meta };
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('create subject')
  @ApiOperation({
    summary: 'Offer a subject to a level',
    description:
      'Creates draft offerings: one for the chosen period, or one per teaching period of the year with "all". The roster must suit the year’s teaching model or an exception.',
  })
  @ApiCreatedResponse({ type: [OfferingDto] })
  @ApiErrorResponses(...WRITE_ERRORS)
  async create(
    @Campus() campus: CampusAccess,
    @Body() body: CreateOfferingDto,
  ): Promise<OfferingDto[]> {
    return this.views.offerings(
      await this.offerings.create(campus.school.id, body),
    );
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('create subject')
  @ApiOperation({
    summary: 'Offer one subject to several levels at once',
    description:
      'A one-section roster with several sections makes one offering per section. Anything the year already teaches is skipped and listed.',
  })
  @ApiOkResponse({ type: BulkResultDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async bulk(
    @Campus() campus: CampusAccess,
    @Body() body: BulkOfferingsDto,
  ): Promise<BulkResultDto> {
    const result = await this.offerings.bulk(campus.school.id, body);
    return {
      created: await this.views.offerings(result.created),
      skipped: result.skipped,
    };
  }

  @Get(':id')
  @RequirePermission('read subject')
  @ApiOperation({ summary: 'One course offering' })
  @ApiOkResponse({ type: OfferingDto })
  @ApiErrorResponses(...ERRORS)
  async show(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfferingDto> {
    return this.views.offering(
      await this.offerings.find(this.dataSource.manager, campus.school.id, id),
    );
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  @RequirePermission('update subject')
  @ApiOperation({
    summary: 'Name an offering, or take its name away',
    description: 'Up to 100 characters. An archived offering never changes.',
  })
  @ApiOkResponse({ type: OfferingDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async rename(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RenameOfferingDto,
  ): Promise<OfferingDto> {
    return this.views.offering(
      await this.offerings.rename(campus.school.id, id, body.name),
    );
  }

  @Put(':id/roster')
  @RequireVerifiedEmail()
  @RequirePermission('update subject')
  @ApiOperation({
    summary: 'Change who an offering teaches',
    description: 'Refused while the year or period is closed.',
  })
  @ApiOkResponse({ type: OfferingDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async updateRoster(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRosterDto,
  ): Promise<OfferingDto> {
    return this.views.offering(
      await this.offerings.updateRoster(
        campus.school.id,
        id,
        body.rosterMode,
        body.academicCycleSectionIds ?? [],
        body.studentRecordIds ?? [],
      ),
    );
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update subject')
  @ApiOperation({
    summary: 'Activate or archive an offering',
    description:
      'Activation needs its period open or closing and a complete roster, and no other active offering with the same subject, period, level and roster.',
  })
  @ApiOkResponse({ type: OfferingDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async changeStatus(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatusChangeDto,
  ): Promise<OfferingDto> {
    return this.views.offering(
      await this.offerings.changeStatus(campus.school.id, id, body.status),
    );
  }

  @Get(':id/roster')
  @RequirePermission('read subject', 'read gradebook')
  @ApiOperation({
    summary: 'Who the offering teaches',
    description:
      'With "read gradebook" only, for offerings the reader teaches or taught. A teacher of part of a section-based offering sees only their sections unless they hold "update subject".',
  })
  @ApiOkResponse({ type: RosterDto })
  @ApiErrorResponses(...ERRORS)
  async showRoster(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RosterQueryDto,
  ): Promise<RosterDto> {
    const manager = this.dataSource.manager;
    const offering = await this.offerings.find(manager, campus.school.id, id);
    const viewer = { userId: auth.user.id, permissions: campus.permissions };
    await this.roster.assertCanView(manager, offering, viewer);
    const scope = await this.roster.scope(manager, offering, viewer);
    const date =
      query.date ?? (await this.assignments.today(manager, campus.school.id));
    return {
      courseOfferingId: scope.courseOfferingId,
      date,
      learners: await this.roster.learnersOn(manager, offering, date, viewer),
      rosterMode: scope.rosterMode,
      academicLevelIds: scope.academicLevelIds,
      sections: scope.sections.map((section) =>
        this.views.sectionBrief(section),
      ),
      studentRecordIds: scope.studentRecordIds,
      limitedToSections: scope.limitedToSections,
    };
  }

  @Get(':id/teaching-assignments')
  @RequirePermission('read subject')
  @ApiOperation({ summary: 'Who teaches the offering, past and present' })
  @ApiOkResponse({ type: [AssignmentDto] })
  @ApiErrorResponses(...ERRORS)
  async listAssignments(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssignmentDto[]> {
    const rows = await this.assignments.list(campus.school.id, id);
    return this.views.assignments(
      rows,
      await this.assignments.today(this.dataSource.manager, campus.school.id),
    );
  }

  @Post(':id/teaching-assignments')
  @RequireVerifiedEmail()
  @RequirePermission('update subject')
  @ApiOperation({
    summary: 'Assign a teacher',
    description:
      'Only a teacher of the campus. Answers 200 with the running assignment when the same one is already running, 201 when it is new.',
  })
  @ApiCreatedResponse({ type: AssignmentDto })
  @ApiOkResponse({ type: AssignmentDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async assign(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignTeacherDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AssignmentDto> {
    const { assignment, created } = await this.assignments.assign(
      campus.school.id,
      id,
      body,
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    const today = await this.assignments.today(
      this.dataSource.manager,
      campus.school.id,
    );
    return (await this.views.assignments([assignment], today))[0];
  }
}

@ApiTags('Course offerings')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('teaching-assignments')
export class TeachingAssignmentsController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly assignments: TeachingAssignments,
    private readonly views: CurriculumViews,
  ) {}

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update subject')
  @ApiOperation({
    summary: 'End a teaching assignment',
    description:
      'The last day defaults to the campus’s today. Ending it later than an earlier end changes nothing.',
  })
  @ApiOkResponse({ type: AssignmentDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async end(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EndAssignmentDto,
  ): Promise<AssignmentDto> {
    const assignment = await this.assignments.end(
      campus.school.id,
      id,
      body.endsOn,
    );
    const today = await this.assignments.today(
      this.dataSource.manager,
      campus.school.id,
    );
    return (await this.views.assignments([assignment], today))[0];
  }
}

// Year-level curriculum work: rolling sections and offerings forward, and
// the instructional-model exceptions (reference RollForwardSections,
// RollOverSubjects, ManageInstructionalModel).
@ApiTags('Academic structure')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('academic-years')
export class CurriculumYearsController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly sections: CycleSections,
    private readonly offeringRollForward: OfferingRollForward,
    private readonly exceptions: OfferingExceptions,
    private readonly views: CurriculumViews,
  ) {}

  @Get(':id/sections/roll-forward')
  @RequirePermission('create section')
  @ApiOperation({ summary: 'Preview copying another year’s sections here' })
  @ApiOkResponse({ type: SectionRollForwardPreviewDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async previewSections(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RollForwardRequestDto,
  ): Promise<SectionRollForwardPreviewDto> {
    const preview = await this.sections.previewRollForward(
      campus.school.id,
      id,
      query.sourceYearId,
    );
    const brief = (rows: typeof preview.copies) =>
      rows.map((section) => this.views.sectionBrief(section));
    return {
      copies: brief(preview.copies),
      skips: brief(preview.skips),
      leftBehind: brief(preview.leftBehind),
    };
  }

  @Post(':id/sections/roll-forward')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('create section')
  @ApiOperation({
    summary: 'Copy another year’s sections here',
    description:
      'Sections of active, teachable levels that this year lacks by name are copied as drafts, without a class teacher.',
  })
  @ApiOkResponse({ type: SectionRollForwardResultDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async rollSectionsForward(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RollForwardRequestDto,
  ): Promise<SectionRollForwardResultDto> {
    const created = await this.sections.rollForward(
      campus.school.id,
      id,
      body.sourceYearId,
    );
    return { created: await this.views.sections(created) };
  }

  @Get(':id/course-offerings/roll-forward')
  @RequirePermission('create subject')
  @ApiOperation({ summary: 'Preview copying another year’s offerings here' })
  @ApiOkResponse({ type: OfferingRollForwardPreviewDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async previewOfferings(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: RollForwardRequestDto,
  ): Promise<OfferingRollForwardPreviewDto> {
    const preview = await this.offeringRollForward.preview(
      campus.school.id,
      id,
      query.sourceYearId,
    );
    const offerings = await this.views.offerings([
      ...preview.copies.map((copy) => copy.offering),
      ...preview.skips,
      ...preview.problems.map((problem) => problem.offering),
    ]);
    const view = (id: string) => offerings.find((row) => row.id === id)!;
    return {
      copies: preview.copies.map((copy) => ({
        offering: view(copy.offering.id),
        academicPeriodId: copy.period.id,
        periodName: copy.period.name,
        sectionCount: copy.sectionCount,
      })),
      skips: preview.skips.map((offering) => view(offering.id)),
      problems: preview.problems.map((problem) => ({
        offering: view(problem.offering.id),
        reason: problem.reason,
      })),
    };
  }

  @Post(':id/course-offerings/roll-forward')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('create subject')
  @ApiOperation({
    summary: 'Copy another year’s offerings here',
    description:
      'Periods match by name, type, position and parent; sections by level and name. What this year already teaches is skipped. Copies are drafts.',
  })
  @ApiOkResponse({ type: OfferingRollForwardResultDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async rollOfferingsForward(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RollForwardRequestDto,
  ): Promise<OfferingRollForwardResultDto> {
    const created = await this.offeringRollForward.run(
      campus.school.id,
      id,
      body.sourceYearId,
    );
    return { created: await this.views.offerings(created) };
  }

  @Get(':id/instructional-model/exceptions')
  @RequirePermission(
    'read academic year',
    'manage school settings',
    'migrate instructional model',
  )
  @OrAllowOrganizationPermission(OrganizationPermission.ManageCampuses)
  @ApiOperation({ summary: 'The subjects taught outside the year’s model' })
  @ApiOkResponse({ type: [ExceptionDto] })
  @ApiErrorResponses(...ERRORS)
  async listExceptions(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExceptionDto[]> {
    return this.views.exceptions(
      await this.exceptions.list(campus.school.id, id),
    );
  }

  @Post(':id/instructional-model/exceptions')
  @RequireVerifiedEmail()
  @RequirePermission('manage school settings')
  @OrAllowOrganizationPermission(OrganizationPermission.ManageCampuses)
  @ApiOperation({
    summary: 'Let one subject use a roster the model refuses',
    description:
      'Needs a reason. No level: every level. Answers 200 with the running exception when the same one is already granted, 201 when it is new.',
  })
  @ApiCreatedResponse({ type: ExceptionDto })
  @ApiOkResponse({ type: ExceptionDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async grantException(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: GrantExceptionDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ExceptionDto> {
    const { exception, created } = await this.exceptions.grant(
      auth.user.id,
      campus.school.id,
      id,
      body,
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return this.exceptionView(exception.id);
  }

  @Post(':id/instructional-model/exceptions/:exceptionId/revoke')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('manage school settings')
  @OrAllowOrganizationPermission(OrganizationPermission.ManageCampuses)
  @ApiOperation({
    summary: 'Take an exception back',
    description: 'Offerings made under it keep running.',
  })
  @ApiOkResponse({ type: ExceptionDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async revokeException(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('exceptionId', ParseUUIDPipe) exceptionId: string,
  ): Promise<ExceptionDto> {
    const exception = await this.exceptions.revoke(
      auth.user.id,
      campus.school.id,
      id,
      exceptionId,
    );
    return this.exceptionView(exception.id);
  }

  private async exceptionView(id: string): Promise<ExceptionDto> {
    const exception = await this.dataSource.manager.findOneOrFail(
      InstructionalModelException,
      { where: { id }, relations: { academicLevel: true } },
    );
    return (await this.views.exceptions([exception]))[0];
  }
}
