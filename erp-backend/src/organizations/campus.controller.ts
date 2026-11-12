import {
  Body,
  CallHandler,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  NestInterceptor,
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { catchError, type Observable } from 'rxjs';
import {
  Campus,
  type CampusAccess,
  CampusRoute,
  OrAllowOrganizationPermission,
  RequirePermission,
  RequireVerifiedEmail,
} from '../access/access-context.js';
import {
  CampusPermission,
  OrganizationPermission,
} from '../access/access.constants.js';
import { ValidationFailed } from '../common/errors/api-exception.js';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import {
  Campuses,
  LOGO_MAX_BYTES,
  LOGO_TOO_LARGE,
} from './campuses.service.js';
import {
  CampusDto,
  OperatingProfileDto,
  SetOperatingProfileDto,
  UpdateCampusDto,
} from './organizations.dto.js';

// Multer stops reading at the size limit; that answer becomes the same 400
// as any other logo problem.
@Injectable()
class LogoTooLarge implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof PayloadTooLargeException) {
          throw new ValidationFailed({ logo: [LOGO_TOO_LARGE] });
        }
        throw error;
      }),
    );
  }
}

const READ = [
  CampusPermission.ReadSchool,
  CampusPermission.ManageSchoolSettings,
];
// Reference SchoolPolicy::update: "update school" or "manage school
// settings" at the working campus, or "manage organization campuses" over
// its organization (the person must still work at the campus).
const UPDATE = [
  CampusPermission.UpdateSchool,
  CampusPermission.ManageSchoolSettings,
];
const ERRORS = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
] as const;

// The working campus's details, logo and operating profile.
@ApiTags('Campus settings')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('school')
export class CampusController {
  constructor(private readonly campuses: Campuses) {}

  @Get()
  @RequireVerifiedEmail()
  @RequirePermission(...READ)
  // Reference SchoolPolicy::view: "read organization" over its organization.
  @OrAllowOrganizationPermission(OrganizationPermission.Read)
  @ApiOperation({
    summary:
      'The working campus ("read school" or "manage school settings", or "read organization")',
  })
  @ApiOkResponse({ type: CampusDto })
  @ApiErrorResponses(...ERRORS)
  show(@Campus() campus: CampusAccess): Promise<CampusDto> {
    return this.campuses.toDto(campus.school);
  }

  @Patch()
  @RequireVerifiedEmail()
  @RequirePermission(...UPDATE)
  @OrAllowOrganizationPermission(OrganizationPermission.ManageCampuses)
  @ApiOperation({
    summary: 'Edit the working campus, including its time zone',
    description: 'Only the fields sent change.',
  })
  @ApiOkResponse({ type: CampusDto })
  @ApiErrorResponses(...ERRORS)
  async update(
    @Campus() campus: CampusAccess,
    @Body() body: UpdateCampusDto,
  ): Promise<CampusDto> {
    return this.campuses.toDto(
      await this.campuses.update(campus.school.id, body),
    );
  }

  @Post('logo')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission(...UPDATE)
  @OrAllowOrganizationPermission(OrganizationPermission.ManageCampuses)
  @UseInterceptors(
    LogoTooLarge,
    FileInterceptor('logo', {
      limits: { fileSize: LOGO_MAX_BYTES, files: 1, fields: 0 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['logo'],
      properties: {
        logo: {
          type: 'string',
          format: 'binary',
          description: 'jpg or png, at most 5120 KB',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload the campus logo',
    description: 'The type is checked from the file content; SVG is refused.',
  })
  @ApiOkResponse({ type: CampusDto })
  @ApiErrorResponses(...ERRORS)
  async uploadLogo(
    @Campus() campus: CampusAccess,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<CampusDto> {
    return this.campuses.toDto(
      await this.campuses.setLogo(campus.school.id, file?.buffer),
    );
  }

  @Delete('logo')
  @RequireVerifiedEmail()
  @RequirePermission(...UPDATE)
  @OrAllowOrganizationPermission(OrganizationPermission.ManageCampuses)
  @ApiOperation({ summary: 'Remove the campus logo' })
  @ApiOkResponse({ type: CampusDto })
  @ApiErrorResponses(...ERRORS)
  async removeLogo(@Campus() campus: CampusAccess): Promise<CampusDto> {
    return this.campuses.toDto(
      await this.campuses.removeLogo(campus.school.id),
    );
  }

  @Get('operating-profile')
  @ApiOperation({
    summary:
      'The words this campus uses (Class or Grade, Term or Semester, ...)',
    description: 'Any member of the campus may read them.',
  })
  @ApiOkResponse({ type: OperatingProfileDto })
  @ApiErrorResponses(...ERRORS)
  profile(@Campus() campus: CampusAccess): Promise<OperatingProfileDto> {
    return this.campuses.profile(campus.school.id);
  }

  @Put('operating-profile')
  @RequireVerifiedEmail()
  @RequirePermission(...UPDATE)
  @OrAllowOrganizationPermission(OrganizationPermission.ManageCampuses)
  @ApiOperation({
    summary: 'Set the words this campus uses',
    description: 'A preset and all seven words, each at most 40 characters.',
  })
  @ApiOkResponse({ type: OperatingProfileDto })
  @ApiErrorResponses(...ERRORS)
  setProfile(
    @Campus() campus: CampusAccess,
    @Body() body: SetOperatingProfileDto,
  ): Promise<OperatingProfileDto> {
    return this.campuses.setProfile(campus.school.id, body);
  }
}
