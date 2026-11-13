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
import {
  Campus,
  type CampusAccess,
  CampusRoute,
  RequirePermission,
  RequireVerifiedEmail,
} from '../access/access-context.js';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import {
  type Paginated,
  PaginationQueryDto,
} from '../common/pagination/pagination.js';
import { AcademicLevels } from './academic-levels.service.js';
import {
  CreateLevelDto,
  CreateSectionDto,
  CreateSubjectDto,
  LevelDto,
  LevelListQueryDto,
  MoveDto,
  MovedDto,
  SectionDto,
  SectionListQueryDto,
  StatusChangeDto,
  SubjectDto,
  UpdateLevelDto,
  UpdateSectionDto,
  UpdateSubjectDto,
} from './curriculum.dto.js';
import { CurriculumViews } from './curriculum-views.service.js';
import { CycleSections } from './cycle-sections.service.js';
import { Subjects } from './subjects.service.js';

const ERRORS = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;
const WRITE_ERRORS = [...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY] as const;

// The campus's levels (classes, grades), reused every year (reference
// AcademicLevelForm, AcademicLevelPolicy: the "class" permissions).
@ApiTags('Academic structure')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('academic-levels')
export class AcademicLevelsController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly levels: AcademicLevels,
    private readonly views: CurriculumViews,
  ) {}

  @Get()
  @RequirePermission('read class')
  @ApiOperation({ summary: 'The campus’s levels in display order' })
  @ApiOkResponse({ type: [LevelDto] })
  @ApiErrorResponses(...ERRORS)
  async list(
    @Campus() campus: CampusAccess,
    @Query() query: LevelListQueryDto,
  ): Promise<LevelDto[]> {
    const levels = await this.levels.list(campus.school.id, query.status);
    return levels.map((level) => this.views.level(level));
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('create class')
  @ApiOperation({
    summary: 'Add a level',
    description:
      'A level group sits at the top and teaches through its child levels; a level may sit under an active group.',
  })
  @ApiCreatedResponse({ type: LevelDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async create(
    @Campus() campus: CampusAccess,
    @Body() body: CreateLevelDto,
  ): Promise<LevelDto> {
    return this.views.level(await this.levels.create(campus.school.id, body));
  }

  @Get(':id')
  @RequirePermission('read class')
  @ApiOperation({ summary: 'One level' })
  @ApiOkResponse({ type: LevelDto })
  @ApiErrorResponses(...ERRORS)
  async show(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LevelDto> {
    return this.views.level(
      await this.levels.find(this.dataSource.manager, campus.school.id, id),
    );
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  @RequirePermission('update class')
  @ApiOperation({ summary: 'Change a level' })
  @ApiOkResponse({ type: LevelDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async update(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateLevelDto,
  ): Promise<LevelDto> {
    return this.views.level(
      await this.levels.update(campus.school.id, id, body),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireVerifiedEmail()
  @RequirePermission('delete class')
  @ApiOperation({
    summary: 'Delete an unused level',
    description:
      'A level with child levels, sections, offerings or exceptions is kept: archive it.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(...WRITE_ERRORS)
  async delete(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.levels.delete(campus.school.id, id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update class')
  @ApiOperation({
    summary: 'Activate or archive a level',
    description: 'Archiving waits until no draft or active section uses it.',
  })
  @ApiOkResponse({ type: LevelDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async changeStatus(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatusChangeDto,
  ): Promise<LevelDto> {
    return this.views.level(
      await this.levels.changeStatus(campus.school.id, id, body.status),
    );
  }

  @Post(':id/move')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update class')
  @ApiOperation({ summary: 'Move a level up or down among its siblings' })
  @ApiOkResponse({ type: MovedDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async move(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MoveDto,
  ): Promise<MovedDto> {
    return {
      moved: await this.levels.move(campus.school.id, id, body.direction),
    };
  }
}

// The sections of each level in each school year (reference
// AcademicCycleSectionForm, AcademicCycleSectionPolicy: the "section"
// permissions). Sections are archived, never deleted.
@ApiTags('Academic structure')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('academic-cycle-sections')
export class CycleSectionsController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly sections: CycleSections,
    private readonly views: CurriculumViews,
  ) {}

  @Get()
  @RequirePermission('read section')
  @ApiOperation({ summary: 'The campus’s sections' })
  @ApiOkResponse({ type: [SectionDto] })
  @ApiErrorResponses(...ERRORS)
  async list(
    @Campus() campus: CampusAccess,
    @Query() query: SectionListQueryDto,
  ): Promise<Paginated<SectionDto>> {
    const page = await this.sections.list(campus.school.id, query);
    return { data: await this.views.sections(page.data), meta: page.meta };
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('create section')
  @ApiOperation({
    summary: 'Add a section to a level for a school year',
    description:
      'Created as a draft. The class teacher must be a teacher of the campus.',
  })
  @ApiCreatedResponse({ type: SectionDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async create(
    @Campus() campus: CampusAccess,
    @Body() body: CreateSectionDto,
  ): Promise<SectionDto> {
    const { academicYearId, academicLevelId, ...details } = body;
    return this.views.section(
      await this.sections.create(
        campus.school.id,
        academicYearId,
        academicLevelId,
        details,
      ),
    );
  }

  @Get(':id')
  @RequirePermission('read section')
  @ApiOperation({ summary: 'One section' })
  @ApiOkResponse({ type: SectionDto })
  @ApiErrorResponses(...ERRORS)
  async show(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SectionDto> {
    return this.views.section(
      await this.sections.find(this.dataSource.manager, campus.school.id, id),
    );
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  @RequirePermission('update section')
  @ApiOperation({ summary: 'Change a section' })
  @ApiOkResponse({ type: SectionDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async update(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSectionDto,
  ): Promise<SectionDto> {
    return this.views.section(
      await this.sections.update(campus.school.id, id, body),
    );
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update section')
  @ApiOperation({
    summary: 'Activate or archive a section',
    description: 'A section of a closed year cannot be activated.',
  })
  @ApiOkResponse({ type: SectionDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async changeStatus(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatusChangeDto,
  ): Promise<SectionDto> {
    return this.views.section(
      await this.sections.changeStatus(campus.school.id, id, body.status),
    );
  }

  @Post(':id/move')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('update section')
  @ApiOperation({ summary: 'Move a section up or down within its level' })
  @ApiOkResponse({ type: MovedDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async move(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MoveDto,
  ): Promise<MovedDto> {
    return {
      moved: await this.sections.move(campus.school.id, id, body.direction),
    };
  }
}

// The campus's subject catalog (reference SubjectController, SubjectPolicy).
@ApiTags('Academic structure')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('subjects')
export class SubjectsController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly subjects: Subjects,
    private readonly views: CurriculumViews,
  ) {}

  @Get()
  @RequirePermission('read subject')
  @ApiOperation({ summary: 'The campus’s subjects' })
  @ApiOkResponse({ type: [SubjectDto] })
  @ApiErrorResponses(...ERRORS)
  async list(
    @Campus() campus: CampusAccess,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<SubjectDto>> {
    const page = await this.subjects.list(campus.school.id, query);
    return {
      data: page.data.map((subject) => this.views.subject(subject)),
      meta: page.meta,
    };
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('create subject')
  @ApiOperation({ summary: 'Add a subject' })
  @ApiCreatedResponse({ type: SubjectDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async create(
    @Campus() campus: CampusAccess,
    @Body() body: CreateSubjectDto,
  ): Promise<SubjectDto> {
    return this.views.subject(
      await this.subjects.create(campus.school.id, body),
    );
  }

  @Get(':id')
  @RequirePermission('read subject')
  @ApiOperation({ summary: 'One subject' })
  @ApiOkResponse({ type: SubjectDto })
  @ApiErrorResponses(...ERRORS)
  async show(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SubjectDto> {
    return this.views.subject(
      await this.subjects.find(this.dataSource.manager, campus.school.id, id),
    );
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  @RequirePermission('update subject')
  @ApiOperation({ summary: 'Rename a subject' })
  @ApiOkResponse({ type: SubjectDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async update(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateSubjectDto,
  ): Promise<SubjectDto> {
    return this.views.subject(
      await this.subjects.update(campus.school.id, id, body),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireVerifiedEmail()
  @RequirePermission('delete subject')
  @ApiOperation({
    summary: 'Delete a subject nobody teaches',
    description: 'The record is kept for history; a taught subject is refused.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(...WRITE_ERRORS)
  async delete(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.subjects.delete(campus.school.id, id);
  }
}
