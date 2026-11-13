import { Controller, Get, HttpStatus } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import {
  AllowGraduatedLearners,
  Campus,
  type CampusAccess,
  CampusRoute,
} from './access-context.js';
import { MyPermissionsDto } from './access.dto.js';
import { RoleQueries } from './role-queries.service.js';

@ApiTags('Me')
@ApiBearerAuth('bearer')
@AllowGraduatedLearners()
@Controller('me')
export class MePermissionsController {
  constructor(private readonly roles: RoleQueries) {}

  @Get('permissions')
  @CampusRoute()
  @ApiOperation({
    summary: 'What you may do at the working campus',
    description:
      'Your roles at the campus named by X-School-Id plus your global roles, and every permission they give.',
  })
  @ApiOkResponse({ type: MyPermissionsDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
  )
  async permissions(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
  ): Promise<MyPermissionsDto> {
    return {
      schoolId: campus.school.id,
      roles: await this.roles.heldBy(auth.user.id, campus.school.id),
      permissions: [...campus.permissions].sort(),
    };
  }
}
