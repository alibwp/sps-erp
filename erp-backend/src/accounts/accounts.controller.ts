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
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  Campus,
  type CampusAccess,
  CampusRoute,
  RequirePermission,
  RequireVerifiedEmail,
} from '../access/access-context.js';
import {
  CampusPermission,
  OrganizationPermission,
} from '../access/access.constants.js';
import { DataSource } from 'typeorm';
import { OrganizationAccess } from '../organizations/organization-access.service.js';
import { RoleQueries } from '../access/role-queries.service.js';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import type { Paginated } from '../common/pagination/pagination.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import { AccountQueries } from './account-queries.service.js';
import {
  AccountDetailDto,
  AccountDto,
  AccountInvitationDto,
  AccountListQueryDto,
  AssignRoleDto,
  HeldRolesDto,
  InvitationListQueryDto,
  InvitationSentDto,
  ProvisionAccountDto,
  StatusChangeDto,
} from './accounts.dto.js';
import { Accounts } from './accounts.service.js';

const MANAGE_ACCESS = CampusPermission.ManageAccountAccess;
const ERRORS = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;

// The people of the working campus and their access.
@ApiTags('Accounts')
@ApiBearerAuth('bearer')
@CampusRoute()
@RequireVerifiedEmail()
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accounts: Accounts,
    private readonly queries: AccountQueries,
    private readonly roles: RoleQueries,
  ) {}

  @Get()
  @RequirePermission(MANAGE_ACCESS)
  @ApiOperation({ summary: 'People with an active membership at this campus' })
  @ApiOkResponse({ type: [AccountDto] })
  @ApiErrorResponses(...ERRORS)
  list(
    @Campus() campus: CampusAccess,
    @Query() query: AccountListQueryDto,
  ): Promise<Paginated<AccountDto>> {
    return this.queries.list(campus.school.id, query);
  }

  @Post()
  @RequirePermission(MANAGE_ACCESS)
  @ApiOperation({
    summary: 'Provision an account at this campus',
    description:
      'A new person gets an invited account (send the invitation with POST /accounts/{id}/invitation). A person the organization already knows keeps their profile: only blank fields are filled. An email of a person outside the organization is refused. Answers 201 for a new account, 200 for an existing one.',
  })
  @ApiCreatedResponse({ type: AccountDetailDto })
  @ApiOkResponse({ type: AccountDetailDto })
  @ApiErrorResponses(...ERRORS)
  async provision(
    @Campus() campus: CampusAccess,
    @Body() body: ProvisionAccountDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountDetailDto> {
    const { user, created } = await this.accounts.provision(
      campus.school.id,
      body,
    );
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return this.queries.detail(campus.school.id, user.id);
  }

  @Get(':id')
  @RequirePermission(MANAGE_ACCESS)
  @ApiOperation({ summary: 'One person of this campus' })
  @ApiOkResponse({ type: AccountDetailDto })
  @ApiErrorResponses(...ERRORS)
  show(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccountDetailDto> {
    return this.queries.detail(campus.school.id, id);
  }

  @Post(':id/status-changes')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MANAGE_ACCESS)
  @ApiOperation({
    summary: 'Suspend, reinstate or archive an account',
    description:
      'Suspending or archiving ends the account’s sessions and pending invitations at once. A platform administrator cannot be suspended or archived, and nobody can block the last role manager of a campus or member manager of an organization.',
  })
  @ApiOkResponse({ type: AccountDetailDto })
  @ApiErrorResponses(...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY)
  async changeStatus(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatusChangeDto,
  ): Promise<AccountDetailDto> {
    await this.accounts.changeStatus(
      auth.user.id,
      campus.school.id,
      id,
      body.action,
      body.reason ?? null,
    );
    return this.queries.detail(campus.school.id, id);
  }

  @Post(':id/invitation')
  @RequirePermission(MANAGE_ACCESS)
  @ApiOperation({
    summary: 'Email a new invitation link',
    description:
      'Earlier links stop working. An archived account cannot be invited.',
  })
  @ApiCreatedResponse({ type: InvitationSentDto })
  @ApiErrorResponses(
    ...ERRORS,
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.SERVICE_UNAVAILABLE,
  )
  sendInvitation(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<InvitationSentDto> {
    return this.accounts.sendInvitation(auth.user.id, campus.school.id, id);
  }

  @Delete(':id/invitation')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(MANAGE_ACCESS)
  @ApiOperation({ summary: 'Stop every unused invitation link of the account' })
  @ApiNoContentResponse()
  @ApiErrorResponses(...ERRORS)
  async revokeInvitation(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.accounts.revokeInvitations(auth.user.id, campus.school.id, id);
  }

  @Post(':id/membership/end')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(MANAGE_ACCESS)
  @ApiOperation({
    summary: 'End the person’s access to this campus',
    description:
      'The account, the records and the history stay. Refused when nobody left at the campus could manage roles.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY)
  async endMembership(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.accounts.endMembership(auth.user.id, campus.school.id, id);
  }

  @Post(':id/roles')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(CampusPermission.ManageRole)
  @ApiOperation({
    summary: 'Give a staff role at this campus ("manage role")',
    description:
      'Only roles holding nothing you do not hold. The platform roles and the student and parent roles are not given here.',
  })
  @ApiOkResponse({ type: HeldRolesDto })
  @ApiErrorResponses(...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY)
  async giveRole(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignRoleDto,
  ): Promise<HeldRolesDto> {
    await this.accounts.giveRole(
      auth.user.id,
      campus.school.id,
      id,
      body.roleId,
    );
    return { roles: await this.roles.heldBy(id, campus.school.id) };
  }

  @Delete(':id/roles/:roleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(CampusPermission.ManageRole)
  @ApiOperation({
    summary: 'Take a staff role away ("manage role")',
    description:
      'Refused when the role holds more than you do, or when nobody at the campus could manage roles afterwards.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY)
  async takeRole(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ): Promise<void> {
    await this.accounts.takeRole(auth.user.id, campus.school.id, id, roleId);
  }
}

// Invitations of the people of the working campus.
@ApiTags('Accounts')
@ApiBearerAuth('bearer')
@CampusRoute()
@RequireVerifiedEmail()
@Controller('account-invitations')
export class AccountInvitationsController {
  constructor(private readonly queries: AccountQueries) {}

  @Get()
  @RequirePermission(MANAGE_ACCESS)
  @ApiOperation({
    summary: 'Invitations of this campus’s people, with their state',
  })
  @ApiOkResponse({ type: [AccountInvitationDto] })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  list(
    @Campus() campus: CampusAccess,
    @Query() query: InvitationListQueryDto,
  ): Promise<Paginated<AccountInvitationDto>> {
    return this.queries.invitations({ schoolId: campus.school.id }, query);
  }
}

// Invitations of the people at an organization's campuses, for members
// with "manage organization members" (reference AccountInvitationVisibility
// and AccountInvitationPolicy). No campus membership is needed. Someone who
// cannot read the organization gets 404.
@ApiTags('Organizations')
@ApiBearerAuth('bearer')
@RequireVerifiedEmail()
@Controller('organizations/:id/invitations')
export class OrganizationInvitationsController {
  constructor(
    private readonly accounts: Accounts,
    private readonly queries: AccountQueries,
    private readonly organizationAccess: OrganizationAccess,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Invitations of people at the organization’s campuses ("manage organization members")',
  })
  @ApiOkResponse({ type: [AccountInvitationDto] })
  @ApiErrorResponses(...ERRORS)
  async list(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: InvitationListQueryDto,
  ): Promise<Paginated<AccountInvitationDto>> {
    await this.organizationAccess.authorize(
      this.dataSource.manager,
      auth.user.id,
      id,
      OrganizationPermission.ManageMembers,
    );
    return this.queries.invitations({ organizationId: id }, query);
  }

  @Post(':invitationId/resend')
  @ApiOperation({
    summary: 'Email a new link for a pending invitation',
    description: 'The earlier link stops working.',
  })
  @ApiCreatedResponse({ type: InvitationSentDto })
  @ApiErrorResponses(
    ...ERRORS,
    HttpStatus.UNPROCESSABLE_ENTITY,
    HttpStatus.SERVICE_UNAVAILABLE,
  )
  resend(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<InvitationSentDto> {
    return this.accounts.resendFromOrganization(auth.user.id, id, invitationId);
  }

  @Post(':invitationId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Stop a pending invitation',
    description: 'Every unused link of that person stops working.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(...ERRORS)
  async revoke(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ): Promise<void> {
    await this.accounts.revokeFromOrganization(auth.user.id, id, invitationId);
  }
}
