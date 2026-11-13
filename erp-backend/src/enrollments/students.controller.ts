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
import { DataSource } from 'typeorm';
import type { WorkingPeriod } from '../academic/academic-period-context.service.js';
import {
  RequireAcademicPeriod,
  Working,
} from '../academic/academic-period.guard.js';
import {
  Campus,
  type CampusAccess,
  CampusRoute,
  RequirePermission,
  RequireVerifiedEmail,
} from '../access/access-context.js';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import type { Paginated } from '../common/pagination/pagination.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import { StudentViews } from './student-views.service.js';
import {
  AdmitStudentDto,
  ChangeEnrollmentStatusDto,
  EnrollmentStatusHistoryDto,
  PlaceStudentDto,
  PlacementHistoryDto,
  StudentDto,
  StudentListQueryDto,
  UpdateStudentDto,
} from './students.dto.js';
import { Students } from './students.service.js';

const ERRORS = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;
const WRITE_ERRORS = [...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY] as const;

// The learners of the working campus, one enrollment each (reference
// StudentController, CreateStudentForm, ShowStudentProfile, UserPolicy for
// the "student" permissions).
@ApiTags('Students')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('students')
export class StudentsController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly students: Students,
    private readonly views: StudentViews,
  ) {}

  @Get()
  @RequirePermission('read student')
  @ApiOperation({ summary: 'The campus’s learners' })
  @ApiOkResponse({ type: [StudentDto] })
  @ApiErrorResponses(...ERRORS)
  async list(
    @Campus() campus: CampusAccess,
    @Query() query: StudentListQueryDto,
  ): Promise<Paginated<StudentDto>> {
    const page = await this.students.list(campus.school.id, query);
    return { data: await this.views.students(page.data), meta: page.meta };
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('create student')
  @RequireAcademicPeriod()
  @ApiOperation({
    summary: 'Admit a learner',
    description:
      'Provisions the account (a new person is emailed an invitation), gives the student role at the campus, opens the enrollment and places the learner in an active section of the working school year. Refused for a person who already holds the student role here, works as staff, or is enrolled at another campus, and when the section is full.',
  })
  @ApiCreatedResponse({ type: StudentDto })
  @ApiErrorResponses(...WRITE_ERRORS, HttpStatus.CONFLICT)
  async admit(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Working() working: WorkingPeriod,
    @Body() body: AdmitStudentDto,
  ): Promise<StudentDto> {
    const { enrollment } = await this.students.admit(
      auth.user.id,
      campus.school.id,
      working,
      body,
    );
    return this.views.student(enrollment);
  }

  @Get(':id')
  @RequirePermission('read student')
  @ApiOperation({ summary: 'One learner (by enrollment)' })
  @ApiOkResponse({ type: StudentDto })
  @ApiErrorResponses(...ERRORS)
  async show(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StudentDto> {
    return this.views.student(
      await this.students.find(this.dataSource.manager, campus.school.id, id),
    );
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  @RequirePermission('update student')
  @ApiOperation({
    summary: 'Change a learner’s details',
    description:
      'Only the person may change the email when they belong to another campus, hold access beyond this one, or hold more here than you.',
  })
  @ApiOkResponse({ type: StudentDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStudentDto,
  ): Promise<StudentDto> {
    return this.views.student(
      await this.students.update(auth.user.id, campus.school.id, id, body),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireVerifiedEmail()
  @RequirePermission('delete student')
  @ApiOperation({
    summary: 'Remove a learner from the campus',
    description:
      'Withdraws an open enrollment, ends the campus membership, and deletes the account unless the person still belongs to another campus or has access beyond this one.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(...WRITE_ERRORS)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.students.remove(auth.user.id, campus.school.id, id);
  }

  @Post(':id/placements')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update student')
  @RequireAcademicPeriod()
  @ApiOperation({
    summary: 'Move a learner to another section of the working year',
    description:
      'Refused for a closed enrollment, an inactive section, a closed year, a future day or a full section (open waitlist offers count as taken seats). The same section changes nothing.',
  })
  @ApiOkResponse({ type: StudentDto })
  @ApiErrorResponses(...WRITE_ERRORS, HttpStatus.CONFLICT)
  async place(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Working() working: WorkingPeriod,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PlaceStudentDto,
  ): Promise<StudentDto> {
    return this.views.student(
      await this.students.place(
        auth.user.id,
        campus.school.id,
        working,
        id,
        body,
      ),
    );
  }

  @Get(':id/placements')
  @RequirePermission('read student')
  @ApiOperation({ summary: 'Where the learner sat, oldest first' })
  @ApiOkResponse({ type: [PlacementHistoryDto] })
  @ApiErrorResponses(...ERRORS)
  async placements(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PlacementHistoryDto[]> {
    const enrollment = await this.students.find(
      this.dataSource.manager,
      campus.school.id,
      id,
    );
    return this.views.placements(enrollment.id);
  }

  @Post(':id/status-changes')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update student')
  @ApiOperation({
    summary: 'Change the enrollment’s state',
    description:
      'active → suspended, withdrawn, transferred, graduated, archived; suspended → active, withdrawn, transferred, archived; withdrawn → active, archived; transferred → archived; graduated → active, archived. Taking back a learner who left refuses one who attends elsewhere or works as staff, and needs a free seat.',
  })
  @ApiOkResponse({ type: StudentDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async changeStatus(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChangeEnrollmentStatusDto,
  ): Promise<StudentDto> {
    return this.views.student(
      await this.students.changeStatus(
        auth.user.id,
        campus.school.id,
        id,
        body,
      ),
    );
  }

  @Get(':id/status-changes')
  @RequirePermission('read student')
  @ApiOperation({ summary: 'The enrollment’s state history, oldest first' })
  @ApiOkResponse({ type: [EnrollmentStatusHistoryDto] })
  @ApiErrorResponses(...ERRORS)
  async statuses(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EnrollmentStatusHistoryDto[]> {
    const enrollment = await this.students.find(
      this.dataSource.manager,
      campus.school.id,
      id,
    );
    return this.views.statuses(enrollment.id);
  }
}
