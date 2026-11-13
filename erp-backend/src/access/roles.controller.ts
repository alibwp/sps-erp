import {
  Body,
  Controller,
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import type { Paginated } from '../common/pagination/pagination.js';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import {
  Campus,
  type CampusAccess,
  CampusRoute,
  RequirePermission,
  RequireVerifiedEmail,
} from './access-context.js';
import { CampusPermission } from './access.constants.js';
import {
  CopyRoleDto,
  CreateRoleDto,
  GrantablePermissionsDto,
  RoleDetailDto,
  RoleDto,
  RoleListDto,
  RoleListQueryDto,
  UpdateRoleDto,
} from './access.dto.js';
import { CampusRoles } from './campus-roles.service.js';
import { RoleAuthority } from './role-authority.service.js';
import { RoleQueries } from './role-queries.service.js';

const READ = CampusPermission.ReadRole;
const MANAGE = CampusPermission.ManageRole;
const ERRORS = [
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;

// The roles of the working campus: its own and the shared ones (reference
// CampusRoleController, CampusRoleRecord, CreateCampusRoleForm). Giving and
// taking a role is under /accounts/{id}/roles.
@ApiTags('Roles')
@ApiBearerAuth('bearer')
@CampusRoute()
@RequireVerifiedEmail()
@Controller('roles')
export class RolesController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly roles: CampusRoles,
    private readonly queries: RoleQueries,
    private readonly authority: RoleAuthority,
  ) {}

  @Get()
  @RequirePermission(READ)
  @ApiOperation({ summary: 'Roles offered at this campus' })
  @ApiOkResponse({ type: RoleListDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, ...ERRORS)
  list(
    @Campus() campus: CampusAccess,
    @Query() query: RoleListQueryDto,
  ): Promise<Paginated<RoleDto>> {
    return this.queries.list(campus.school.id, query);
  }

  @Get('grantable-permissions')
  @RequirePermission(MANAGE)
  @ApiOperation({
    summary: 'What you may put in a role here',
    description:
      'Every campus permission for a platform administrator; otherwise what your roles at this campus hold.',
  })
  @ApiOkResponse({ type: GrantablePermissionsDto })
  @ApiErrorResponses(...ERRORS)
  async grantable(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
  ): Promise<GrantablePermissionsDto> {
    const permissions = await this.authority.grantableBy(
      this.dataSource.manager,
      auth.user.id,
      campus.school.id,
    );
    return { permissions: [...permissions] };
  }

  @Get(':id')
  @RequirePermission(READ)
  @ApiOperation({ summary: 'One role, with who holds it here' })
  @ApiOkResponse({ type: RoleDetailDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, ...ERRORS)
  async show(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RoleDetailDto> {
    const role = await this.roles.roleAt(
      this.dataSource.manager,
      campus.school.id,
      id,
      false,
    );
    return this.queries.detail(campus.school.id, role);
  }

  @Post()
  @RequirePermission(MANAGE)
  @ApiOperation({
    summary: 'Write a role for this campus',
    description: 'A role may only hold permissions you hold here.',
  })
  @ApiCreatedResponse({ type: RoleDetailDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    ...ERRORS,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  async create(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Body() body: CreateRoleDto,
  ): Promise<RoleDetailDto> {
    const role = await this.roles.create(auth.user.id, campus.school.id, body);
    return this.queries.detail(campus.school.id, role);
  }

  @Put(':id')
  @RequirePermission(MANAGE)
  @ApiOperation({
    summary: 'Change what a role holds',
    description:
      'Built-in roles cannot be changed. Changing a shared role (librarian, accountant) gives this campus its own copy, moves its holders here onto it and answers with the copy.',
  })
  @ApiOkResponse({ type: RoleDetailDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    ...ERRORS,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  async update(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRoleDto,
  ): Promise<RoleDetailDto> {
    const role = await this.roles.update(
      auth.user.id,
      campus.school.id,
      id,
      body,
    );
    return this.queries.detail(campus.school.id, role);
  }

  @Post(':id/copies')
  @RequirePermission(MANAGE)
  @ApiOperation({
    summary: 'Copy a role under a new name',
    description: 'The copy holds only what you hold here.',
  })
  @ApiCreatedResponse({ type: RoleDetailDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    ...ERRORS,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  async copy(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CopyRoleDto,
  ): Promise<RoleDetailDto> {
    const role = await this.roles.duplicate(
      auth.user.id,
      campus.school.id,
      id,
      body,
    );
    return this.queries.detail(campus.school.id, role);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MANAGE)
  @ApiOperation({
    summary: 'Stop offering a role',
    description: 'The people holding it keep it.',
  })
  @ApiOkResponse({ type: RoleDetailDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    ...ERRORS,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  async archive(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RoleDetailDto> {
    const role = await this.roles.archive(campus.school.id, id);
    return this.queries.detail(campus.school.id, role);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MANAGE)
  @ApiOperation({ summary: 'Offer an archived role again' })
  @ApiOkResponse({ type: RoleDetailDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    ...ERRORS,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  async restore(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RoleDetailDto> {
    const role = await this.roles.restore(campus.school.id, id);
    return this.queries.detail(campus.school.id, role);
  }
}
