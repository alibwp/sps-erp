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
  RequirePermission,
  RequireVerifiedEmail,
} from '../access/access-context.js';
import {
  AccountDetailDto,
  AccountDto,
  AccountListQueryDto,
  ProvisionAccountDto,
} from '../accounts/accounts.dto.js';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import type { Paginated } from '../common/pagination/pagination.js';
import { GuardianLinks } from '../enrollments/guardian-links.service.js';
import { StudentViews } from '../enrollments/student-views.service.js';
import { StudentDto } from '../enrollments/students.dto.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import { LinkChildDto, UpdatePersonDto } from './people.dto.js';
import { People, type PersonRole } from './people.service.js';

const ERRORS = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;
const WRITE_ERRORS = [...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY] as const;

const CREATE_DESCRIPTION = (role: string) =>
  `Provisions the account (a new person is emailed an invitation, a person the organization knows is reused) and gives the ${role} role at this campus. Refused for a person who already holds it here.`;
const REMOVE_DESCRIPTION =
  'Ends the person’s membership here, then deletes the account unless they still belong to another campus or have access beyond this one. Refused for a person who holds more here than you.';

// The routes every kind of person has, under its own permissions.
abstract class PeopleRoutes {
  protected abstract readonly role: PersonRole;

  constructor(protected readonly people: People) {}

  protected list(
    campus: CampusAccess,
    query: AccountListQueryDto,
  ): Promise<Paginated<AccountDto>> {
    return this.people.list(campus.school.id, this.role, query);
  }

  protected async create(
    auth: AuthContext,
    campus: CampusAccess,
    body: ProvisionAccountDto,
  ): Promise<AccountDetailDto> {
    const user = await this.people.create(
      auth.user.id,
      campus.school.id,
      this.role,
      body,
    );
    return this.people.view(campus.school.id, this.role, user.id);
  }

  protected show(campus: CampusAccess, id: string): Promise<AccountDetailDto> {
    return this.people.view(campus.school.id, this.role, id);
  }

  protected async update(
    auth: AuthContext,
    campus: CampusAccess,
    id: string,
    body: UpdatePersonDto,
  ): Promise<AccountDetailDto> {
    await this.people.update(auth.user.id, campus.school, this.role, id, body);
    return this.people.view(campus.school.id, this.role, id);
  }

  protected remove(
    auth: AuthContext,
    campus: CampusAccess,
    id: string,
  ): Promise<void> {
    return this.people.remove(auth.user.id, campus.school.id, this.role, id);
  }
}

// Teachers (reference TeacherController, TeacherService, UserPolicy).
@ApiTags('Teachers')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('teachers')
export class TeachersController extends PeopleRoutes {
  protected readonly role = 'teacher';

  constructor(people: People) {
    super(people);
  }

  @Get()
  @RequirePermission('read teacher')
  @ApiOperation({ summary: 'People holding the teacher role here' })
  @ApiOkResponse({ type: [AccountDto] })
  @ApiErrorResponses(...ERRORS)
  index(
    @Campus() campus: CampusAccess,
    @Query() query: AccountListQueryDto,
  ): Promise<Paginated<AccountDto>> {
    return this.list(campus, query);
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('create teacher')
  @ApiOperation({
    summary: 'Add a teacher',
    description: `${CREATE_DESCRIPTION('teacher')} Refused for an enrolled learner.`,
  })
  @ApiCreatedResponse({ type: AccountDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  store(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Body() body: ProvisionAccountDto,
  ): Promise<AccountDetailDto> {
    return this.create(auth, campus, body);
  }

  @Get(':id')
  @RequirePermission('read teacher')
  @ApiOperation({ summary: 'One teacher (by user id)' })
  @ApiOkResponse({ type: AccountDetailDto })
  @ApiErrorResponses(...ERRORS)
  view(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountDetailDto> {
    return this.show(campus, id);
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  @RequirePermission('update teacher')
  @ApiOperation({
    summary: 'Change a teacher’s details',
    description:
      'Only the person may change the email when they belong to another campus, hold access beyond this one, or hold more here than you.',
  })
  @ApiOkResponse({ type: AccountDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  edit(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePersonDto,
  ): Promise<AccountDetailDto> {
    return this.update(auth, campus, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireVerifiedEmail()
  @RequirePermission('delete teacher')
  @ApiOperation({
    summary: 'Remove a teacher from the campus',
    description: REMOVE_DESCRIPTION,
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(...WRITE_ERRORS)
  destroy(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.remove(auth, campus, id);
  }
}

// Administrators (reference AdminController, AdminService). Only platform
// administrators hold the "* admin" permissions.
@ApiTags('Administrators')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('admins')
export class AdminsController extends PeopleRoutes {
  protected readonly role = 'admin';

  constructor(people: People) {
    super(people);
  }

  @Get()
  @RequirePermission('read admin')
  @ApiOperation({ summary: 'People holding the admin role here' })
  @ApiOkResponse({ type: [AccountDto] })
  @ApiErrorResponses(...ERRORS)
  index(
    @Campus() campus: CampusAccess,
    @Query() query: AccountListQueryDto,
  ): Promise<Paginated<AccountDto>> {
    return this.list(campus, query);
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('create admin')
  @ApiOperation({
    summary: 'Add an administrator',
    description: CREATE_DESCRIPTION('admin'),
  })
  @ApiCreatedResponse({ type: AccountDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  store(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Body() body: ProvisionAccountDto,
  ): Promise<AccountDetailDto> {
    return this.create(auth, campus, body);
  }

  @Get(':id')
  @RequirePermission('read admin')
  @ApiOperation({ summary: 'One administrator (by user id)' })
  @ApiOkResponse({ type: AccountDetailDto })
  @ApiErrorResponses(...ERRORS)
  view(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountDetailDto> {
    return this.show(campus, id);
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  @RequirePermission('update admin')
  @ApiOperation({ summary: 'Change an administrator’s details' })
  @ApiOkResponse({ type: AccountDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  edit(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePersonDto,
  ): Promise<AccountDetailDto> {
    return this.update(auth, campus, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireVerifiedEmail()
  @RequirePermission('delete admin')
  @ApiOperation({
    summary: 'Remove an administrator from the campus',
    description: `${REMOVE_DESCRIPTION} A campus keeps at least one person who can manage its roles.`,
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(...WRITE_ERRORS)
  destroy(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.remove(auth, campus, id);
  }
}

// Parents and their links to learners (reference ParentController,
// ParentService, AssignStudentsToParent, ChangeGuardianLink).
@ApiTags('Parents')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('parents')
export class ParentsController extends PeopleRoutes {
  protected readonly role = 'parent';

  constructor(
    people: People,
    private readonly guardians: GuardianLinks,
    private readonly views: StudentViews,
  ) {
    super(people);
  }

  @Get()
  @RequirePermission('read parent')
  @ApiOperation({ summary: 'People holding the parent role here' })
  @ApiOkResponse({ type: [AccountDto] })
  @ApiErrorResponses(...ERRORS)
  index(
    @Campus() campus: CampusAccess,
    @Query() query: AccountListQueryDto,
  ): Promise<Paginated<AccountDto>> {
    return this.list(campus, query);
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('create parent')
  @ApiOperation({
    summary: 'Add a parent',
    description: `${CREATE_DESCRIPTION('parent')} The person has one guardian record, shared by every campus they join.`,
  })
  @ApiCreatedResponse({ type: AccountDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  store(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Body() body: ProvisionAccountDto,
  ): Promise<AccountDetailDto> {
    return this.create(auth, campus, body);
  }

  @Get(':id')
  @RequirePermission('read parent')
  @ApiOperation({ summary: 'One parent (by user id)' })
  @ApiOkResponse({ type: AccountDetailDto })
  @ApiErrorResponses(...ERRORS)
  view(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountDetailDto> {
    return this.show(campus, id);
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  @RequirePermission('update parent')
  @ApiOperation({ summary: 'Change a parent’s details' })
  @ApiOkResponse({ type: AccountDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  edit(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePersonDto,
  ): Promise<AccountDetailDto> {
    return this.update(auth, campus, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireVerifiedEmail()
  @RequirePermission('delete parent')
  @ApiOperation({
    summary: 'Remove a parent from the campus',
    description: `Unlinks the parent from this campus’s learners first. ${REMOVE_DESCRIPTION}`,
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(...WRITE_ERRORS)
  destroy(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.remove(auth, campus, id);
  }

  @Get(':id/children')
  @RequirePermission('read parent')
  @ApiOperation({ summary: 'The parent’s learners at this campus' })
  @ApiOkResponse({ type: [StudentDto] })
  @ApiErrorResponses(...ERRORS)
  async children(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StudentDto[]> {
    await this.show(campus, id);
    return this.views.students(
      await this.guardians.children(campus.school.id, id),
    );
  }

  @Post(':id/children')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update parent')
  @ApiOperation({
    summary: 'Link the parent to a learner',
    description:
      'The learner needs an enrollment at this campus, in any state. Linking twice changes nothing. Answers the parent’s learners here.',
  })
  @ApiOkResponse({ type: [StudentDto] })
  @ApiErrorResponses(...WRITE_ERRORS)
  async link(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: LinkChildDto,
  ): Promise<StudentDto[]> {
    await this.show(campus, id);
    await this.guardians.link(
      auth.user.id,
      campus.school.id,
      id,
      body.studentId,
    );
    return this.views.students(
      await this.guardians.children(campus.school.id, id),
    );
  }

  @Delete(':id/children/:studentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireVerifiedEmail()
  @RequirePermission('update parent')
  @ApiOperation({
    summary: 'Unlink the parent from a learner',
    description:
      'Ends what depended on the link (Stage 13: the parent’s open portal requests for that learner). A missing link changes nothing.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(...WRITE_ERRORS)
  async unlink(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ): Promise<void> {
    await this.show(campus, id);
    await this.guardians.unlink(auth.user.id, campus.school.id, id, studentId);
  }
}
