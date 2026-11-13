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
import { RequireVerifiedEmail } from '../access/access-context.js';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import {
  PaginationQueryDto,
  type Paginated,
} from '../common/pagination/pagination.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import { BillingGroups } from './billing-groups.service.js';
import { Campuses } from './campuses.service.js';
import type { Organization } from './entities/organization.entity.js';
import { OrganizationMembers } from './organization-members.service.js';
import {
  BillingGroupDto,
  CampusDto,
  CampusListQueryDto,
  CreateBillingGroupDto,
  CreateOrganizationDto,
  GrantOrganizationMemberDto,
  OpenCampusDto,
  OrganizationDto,
  OrganizationMemberDto,
  PlaceCampusDto,
  SetMemberPermissionsDto,
  UpdateCampusDto,
  UpdateOrganizationDto,
} from './organizations.dto.js';
import { Organizations } from './organizations.service.js';

const ERRORS = [
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;

// Organizations and their campuses, billing groups and members. These are
// not campus routes: authority comes from the organization membership
// (reference OrganizationPolicy, SchoolPolicy::createForOrganization), and
// never opens a campus's records.
@ApiTags('Organizations')
@ApiBearerAuth('bearer')
@RequireVerifiedEmail()
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizations: Organizations,
    private readonly campuses: Campuses,
    private readonly billingGroups: BillingGroups,
    private readonly members: OrganizationMembers,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create an organization',
    description: 'Platform administrators only ("access all organizations").',
  })
  @ApiCreatedResponse({ type: OrganizationDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() body: CreateOrganizationDto,
  ): Promise<OrganizationDto> {
    const organization = await this.organizations.create(auth.user.id, body);
    return this.toDto(auth.user.id, organization);
  }

  @Get()
  @ApiOperation({
    summary: 'Organizations you can read',
    description:
      'Every organization for a platform administrator; otherwise the ones you administer.',
  })
  @ApiOkResponse({ type: [OrganizationDto] })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<OrganizationDto>> {
    const page = await this.organizations.list(auth.user.id, query);
    return {
      data: await Promise.all(
        page.data.map((organization) => this.toDto(auth.user.id, organization)),
      ),
      meta: page.meta,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'One organization ("read organization")' })
  @ApiOkResponse({ type: OrganizationDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, ...ERRORS)
  async show(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrganizationDto> {
    return this.toDto(
      auth.user.id,
      await this.organizations.show(auth.user.id, id),
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change the organization details ("manage organization")',
  })
  @ApiOkResponse({ type: OrganizationDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, ...ERRORS)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateOrganizationDto,
  ): Promise<OrganizationDto> {
    return this.toDto(
      auth.user.id,
      await this.organizations.update(auth.user.id, id, body),
    );
  }

  // ---------- Campuses ----------

  @Get(':id/campuses')
  @ApiOperation({
    summary: 'The organization’s campuses ("read organization")',
  })
  @ApiOkResponse({ type: [CampusDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, ...ERRORS)
  async campusList(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CampusListQueryDto,
  ): Promise<Paginated<CampusDto>> {
    const page = await this.campuses.list(auth.user.id, id, query);
    return {
      data: await Promise.all(
        page.data.map((school) => this.campuses.toDto(school)),
      ),
      meta: page.meta,
    };
  }

  @Post(':id/campuses')
  @ApiOperation({
    summary: 'Open a campus ("manage organization campuses")',
    description:
      'You join the new campus. It starts with the default operating profile and no role manager: a platform administrator gives its first role.',
  })
  @ApiCreatedResponse({ type: CampusDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, ...ERRORS)
  async openCampus(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OpenCampusDto,
  ): Promise<CampusDto> {
    return this.campuses.toDto(
      await this.campuses.open(auth.user.id, id, body),
    );
  }

  @Patch(':id/campuses/:schoolId')
  @ApiOperation({
    summary: 'Edit a campus ("manage organization campuses")',
    description: 'Only the fields sent change.',
  })
  @ApiOkResponse({ type: CampusDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, ...ERRORS)
  async updateCampus(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() body: UpdateCampusDto,
  ): Promise<CampusDto> {
    return this.campuses.toDto(
      await this.campuses.updateFromOrganization(
        auth.user.id,
        id,
        schoolId,
        body,
      ),
    );
  }

  @Put(':id/campuses/:schoolId/billing-group')
  @ApiOperation({
    summary: 'Put a campus in a billing group ("manage organization")',
    description:
      'null: the campus bills on its own. Nothing already in the books moves.',
  })
  @ApiOkResponse({ type: CampusDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    ...ERRORS,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  async placeCampus(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() body: PlaceCampusDto,
  ): Promise<CampusDto> {
    return this.campuses.toDto(
      await this.billingGroups.place(
        auth.user.id,
        id,
        schoolId,
        body.billingGroupId,
      ),
    );
  }

  // ---------- Billing groups ----------

  @Get(':id/billing-groups')
  @ApiOperation({ summary: 'Billing groups ("manage organization")' })
  @ApiOkResponse({ type: [BillingGroupDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, ...ERRORS)
  billingGroupList(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BillingGroupDto[]> {
    return this.billingGroups.list(auth.user.id, id);
  }

  @Post(':id/billing-groups')
  @ApiOperation({
    summary: 'Start an empty billing group ("manage organization")',
  })
  @ApiCreatedResponse({ type: BillingGroupDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    ...ERRORS,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  startBillingGroup(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateBillingGroupDto,
  ): Promise<BillingGroupDto> {
    return this.billingGroups.start(auth.user.id, id, body.name);
  }

  @Delete(':id/billing-groups/:groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a billing group no campus is in ("manage organization")',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    ...ERRORS,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  async deleteBillingGroup(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<void> {
    await this.billingGroups.delete(auth.user.id, id, groupId);
  }

  // ---------- Members ----------

  @Get(':id/members')
  @ApiOperation({
    summary:
      'People who administer the organization ("manage organization members")',
  })
  @ApiOkResponse({ type: [OrganizationMemberDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, ...ERRORS)
  memberList(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrganizationMemberDto[]> {
    return this.members.list(auth.user.id, id);
  }

  @Post(':id/members')
  @ApiOperation({
    summary:
      'Give organization scope to a person ("manage organization members")',
    description:
      'The person must already be known to the organization. They get what you hold here, and no campus access.',
  })
  @ApiCreatedResponse({ type: OrganizationMemberDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, ...ERRORS)
  grantMember(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: GrantOrganizationMemberDto,
  ): Promise<OrganizationMemberDto> {
    return this.members.grant(auth.user.id, id, body.email);
  }

  @Put(':id/members/:userId/permissions')
  @ApiOperation({
    summary: 'Set what a member may do ("manage organization members")',
    description:
      'You can only give or take away permissions you hold. The last member who can manage members cannot lose that.',
  })
  @ApiOkResponse({ type: OrganizationMemberDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    ...ERRORS,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  setMemberPermissions(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: SetMemberPermissionsDto,
  ): Promise<OrganizationMemberDto> {
    return this.members.setPermissions(
      auth.user.id,
      id,
      userId,
      body.permissions,
    );
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'End a member’s organization scope ("manage organization members")',
    description: 'Their campus access is unchanged.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    ...ERRORS,
    HttpStatus.UNPROCESSABLE_ENTITY,
  )
  async revokeMember(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.members.revoke(auth.user.id, id, userId);
  }

  private async toDto(
    actorId: string,
    organization: Organization,
  ): Promise<OrganizationDto> {
    return {
      id: organization.id,
      name: organization.name,
      code: organization.code,
      address: organization.address,
      email: organization.email,
      phone: organization.phone,
      yourPermissions: await this.organizations.permissionsFor(
        actorId,
        organization.id,
      ),
      createdAt: organization.createdAt,
    };
  }
}
