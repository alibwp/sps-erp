import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequireVerifiedEmail } from '../access/access-context.js';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import { Campuses } from '../organizations/campuses.service.js';
import { CampusDto } from '../organizations/organizations.dto.js';
import { AcademicQueries } from './academic-queries.service.js';
import {
  CampusTemplateDto,
  GenerateCycleDto,
  SaveTemplateDto,
  TemplateDto,
  YearDetailDto,
} from './academic.dto.js';
import {
  CalendarTemplates,
  type TemplateView,
} from './calendar-templates.service.js';

const ERRORS = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;
const WRITE_ERRORS = [...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY] as const;

// An organization's calendar templates (reference CalendarTemplateForm,
// CalendarTemplatePolicy): read with "read organization", written with
// "manage organization".
@ApiTags('Organizations')
@ApiBearerAuth('bearer')
@RequireVerifiedEmail()
@Controller('organizations/:id/calendar-templates')
export class CalendarTemplatesController {
  constructor(private readonly templates: CalendarTemplates) {}

  @Get()
  @ApiOperation({ summary: 'The organization’s calendar templates' })
  @ApiOkResponse({ type: [TemplateDto] })
  @ApiErrorResponses(...ERRORS)
  list(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TemplateView[]> {
    return this.templates.list(auth.user.id, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a calendar template',
    description:
      'Periods are day offsets from the cycle start; a row may name an earlier row as its parent. Making it the default stops the previous default being one.',
  })
  @ApiCreatedResponse({ type: TemplateDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  create(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveTemplateDto,
  ): Promise<TemplateView> {
    return this.templates.save(auth.user.id, id, body);
  }

  @Get(':templateId')
  @ApiOperation({ summary: 'One calendar template' })
  @ApiOkResponse({ type: TemplateDto })
  @ApiErrorResponses(...ERRORS)
  show(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
  ): Promise<TemplateView> {
    return this.templates.show(auth.user.id, id, templateId);
  }

  @Put(':templateId')
  @ApiOperation({
    summary: 'Rewrite a calendar template',
    description:
      'Its periods are replaced. Years already generated are unchanged.',
  })
  @ApiOkResponse({ type: TemplateDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() body: SaveTemplateDto,
  ): Promise<TemplateView> {
    return this.templates.save(auth.user.id, id, body, templateId);
  }
}

// A campus's calendar template and cycle generation, from its organization
// ("manage organization": OrganizationPolicy::manageCalendar).
@ApiTags('Organizations')
@ApiBearerAuth('bearer')
@RequireVerifiedEmail()
@Controller('organizations/:id/campuses/:schoolId')
export class CampusCalendarController {
  constructor(
    private readonly templates: CalendarTemplates,
    private readonly campuses: Campuses,
    private readonly queries: AcademicQueries,
  ) {}

  @Put('calendar-template')
  @ApiOperation({
    summary: 'Choose the template a campus follows',
    description:
      'A template of its own needs a reason; null follows the organization default again.',
  })
  @ApiOkResponse({ type: CampusDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async setTemplate(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() body: CampusTemplateDto,
  ): Promise<CampusDto> {
    const school = await this.templates.setCampusTemplate(
      auth.user.id,
      id,
      schoolId,
      body.calendarTemplateId,
      body.reason ?? null,
    );
    return this.campuses.toDto(school);
  }

  @Post('academic-cycles')
  @ApiOperation({
    summary: 'Draft a school year for the campus from a template',
    description:
      'Every period is dated from the start day. The year must not overlap another of the campus.',
  })
  @ApiCreatedResponse({ type: YearDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async generate(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() body: GenerateCycleDto,
  ): Promise<YearDetailDto> {
    const year = await this.templates.generate(
      auth.user.id,
      id,
      schoolId,
      body.startsOn,
      body.calendarTemplateId ?? null,
    );
    return this.queries.yearDetail(schoolId, year.id);
  }
}
