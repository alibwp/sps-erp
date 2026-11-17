import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import type { Paginated } from '../common/pagination/pagination.js';
import type { AcademicCycleSection } from '../curriculum/entities/academic-cycle-section.entity.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import {
  AdmissionWaitlist,
  WaitlistMessages,
} from './admission-waitlist.service.js';
import type { AdmissionWaitlistEntry } from './entities/admission-waitlist-entry.entity.js';
import type { Promotion } from './entities/promotion.entity.js';
import {
  GraduateStudentsDto,
  GraduationResultDto,
  JoinWaitlistDto,
  NoteDto,
  OfferWaitlistDto,
  PromoteStudentsDto,
  PromotionDto,
  PromotionListQueryDto,
  ReasonDto,
  WaitlistEntryDto,
  WaitlistOfferDto,
  WaitlistQueryDto,
  WaitlistSectionDto,
} from './moving.dto.js';
import { Promotions } from './promotions.service.js';
import { StudentViews } from './student-views.service.js';
import { StudentDto, StudentListQueryDto } from './students.dto.js';
import { Students } from './students.service.js';

const ERRORS = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;
const WRITE_ERRORS = [...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY] as const;

const sectionBrief = (section: AcademicCycleSection) => ({
  id: section.id,
  name: section.name,
  academicLevelId: section.academicLevelId,
});

function promotionDto(promotion: Promotion): PromotionDto {
  return {
    id: promotion.id,
    academicYearId: promotion.academicYearId,
    source: sectionBrief(promotion.sourceAcademicCycleSection),
    destination: sectionBrief(promotion.destinationAcademicCycleSection),
    studentIds: promotion.studentRecordIds,
    createdAt: promotion.createdAt,
  };
}

function entryDto(view: {
  entry: AdmissionWaitlistEntry;
  next: boolean;
}): WaitlistEntryDto {
  const { entry } = view;
  return {
    id: entry.id,
    academicYearId: entry.academicYearId,
    section: sectionBrief(entry.academicCycleSection),
    candidate: {
      id: entry.user.id,
      name: entry.user.name,
      email: entry.user.email,
    },
    status: entry.status,
    priority: entry.priority,
    position: entry.position,
    next: view.next,
    decisionReason: entry.decisionReason,
    offeredAt: entry.offeredAt,
    decidedAt: entry.decidedAt,
    createdAt: entry.createdAt,
  };
}

// Promotions (reference PromotionController, PromotionPolicy).
@ApiTags('Promotions')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotions: Promotions) {}

  @Get()
  @RequirePermission('read promotion')
  @ApiOperation({ summary: 'The campus’s promotions, newest first' })
  @ApiOkResponse({ type: [PromotionDto] })
  @ApiErrorResponses(...ERRORS)
  async list(
    @Campus() campus: CampusAccess,
    @Query() query: PromotionListQueryDto,
  ): Promise<PromotionDto[]> {
    return (
      await this.promotions.list(campus.school.id, query.academicYearId)
    ).map(promotionDto);
  }

  @Get(':id')
  @RequirePermission('read promotion')
  @ApiOperation({ summary: 'One promotion' })
  @ApiOkResponse({ type: PromotionDto })
  @ApiErrorResponses(...ERRORS)
  async show(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PromotionDto> {
    return promotionDto(await this.promotions.find(campus.school.id, id));
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('promote student')
  @ApiOperation({
    summary: 'Promote learners to another section',
    description:
      'Moves the chosen learners still active in the source section to the destination, one placement each (reason "Promotion"), and records the promotion. Every learner moves or none does.',
  })
  @ApiCreatedResponse({ type: PromotionDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async promote(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Body() body: PromoteStudentsDto,
  ): Promise<PromotionDto> {
    const promotion = await this.promotions.promote(
      auth.user.id,
      campus.school.id,
      body,
    );
    return promotionDto(
      await this.promotions.find(campus.school.id, promotion.id),
    );
  }

  @Post(':id/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireVerifiedEmail()
  @RequirePermission('reset promotion')
  @ApiOperation({
    summary: 'Undo a promotion',
    description:
      'Moves back every learner still enrolled and still in the destination section (reason "Promotion reset"), then deletes the promotion. Learners who moved on, graduated or left stay where they are.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(...WRITE_ERRORS)
  async reset(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.promotions.reset(auth.user.id, campus.school.id, id);
  }
}

// Graduations (reference GraduationController, GraduationPolicy).
@ApiTags('Graduations')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('graduations')
export class GraduationsController {
  constructor(
    private readonly promotions: Promotions,
    private readonly students: Students,
    private readonly views: StudentViews,
  ) {}

  @Get()
  @RequirePermission('view graduations')
  @ApiOperation({ summary: 'The campus’s graduates' })
  @ApiOkResponse({ type: [StudentDto] })
  @ApiErrorResponses(...ERRORS)
  async list(
    @Campus() campus: CampusAccess,
    @Query() query: StudentListQueryDto,
  ): Promise<Paginated<StudentDto>> {
    const page = await this.students.list(campus.school.id, {
      ...query,
      status: 'graduated',
    });
    return { data: await this.views.students(page.data), meta: page.meta };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('graduate student')
  @ApiOperation({
    summary: 'Graduate learners of a section',
    description:
      'Graduates the chosen learners still active in the section. Every learner graduates or none does.',
  })
  @ApiOkResponse({ type: GraduationResultDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async graduate(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Body() body: GraduateStudentsDto,
  ): Promise<GraduationResultDto> {
    return {
      graduated: await this.promotions.graduate(
        auth.user.id,
        campus.school.id,
        body,
      ),
    };
  }

  @Post(':studentId/reset')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('reset graduation')
  @ApiOperation({
    summary: 'Undo a learner’s graduation',
    description:
      'Returns the graduate to active, with the checks for taking a learner back: not enrolled elsewhere, not staff, and a free seat in their section. An enrollment that is not graduated is left as it is.',
  })
  @ApiOkResponse({ type: StudentDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async reset(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() body: ReasonDto,
  ): Promise<StudentDto> {
    return this.views.student(
      await this.promotions.resetGraduation(
        auth.user.id,
        campus.school.id,
        studentId,
        body.reason ?? null,
      ),
    );
  }
}

// The admission waitlist (reference AdmissionWaitlistController,
// AdmissionWaitlistEntryPolicy).
@ApiTags('Admission waitlist')
@ApiBearerAuth('bearer')
@CampusRoute()
@Controller('admission-waitlist')
export class AdmissionWaitlistController {
  constructor(
    private readonly waitlist: AdmissionWaitlist,
    private readonly views: StudentViews,
  ) {}

  @Get()
  @RequirePermission('read admission waitlist')
  @ApiOperation({
    summary: 'The waitlist, by priority (highest first) then position',
  })
  @ApiOkResponse({ type: [WaitlistEntryDto] })
  @ApiErrorResponses(...ERRORS)
  async list(
    @Campus() campus: CampusAccess,
    @Query() query: WaitlistQueryDto,
  ): Promise<WaitlistEntryDto[]> {
    return (await this.waitlist.list(campus.school.id, query)).map(entryDto);
  }

  @Get('sections')
  @RequirePermission('read admission waitlist')
  @ApiOperation({
    summary: 'Sections a candidate may wait for',
    description:
      'Active sections with a capacity that are full (placed learners plus open offers), in years that are not closed.',
  })
  @ApiOkResponse({ type: [WaitlistSectionDto] })
  @ApiErrorResponses(...ERRORS)
  async sections(
    @Campus() campus: CampusAccess,
  ): Promise<WaitlistSectionDto[]> {
    return (await this.waitlist.sectionsToWaitFor(campus.school.id)).map(
      ({ section, taken }) => ({
        ...sectionBrief(section),
        academicYearId: section.academicYearId,
        capacity: section.capacity!,
        seatsTaken: taken,
      }),
    );
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('manage admission waitlist')
  @ApiOperation({
    summary: 'Put a candidate on a section’s waitlist',
    description:
      'Only for a full section with a capacity, and a campus member who is not enrolled here and not staff. An open entry for the same candidate and section is returned as it is.',
  })
  @ApiCreatedResponse({ type: WaitlistEntryDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async join(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Body() body: JoinWaitlistDto,
  ): Promise<WaitlistEntryDto> {
    const entry = await this.waitlist.join(
      auth.user.id,
      campus.school.id,
      body,
    );
    return this.view(campus.school.id, entry.id);
  }

  @Post('offers')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('manage admission waitlist')
  @ApiOperation({
    summary: 'Offer a free seat to the next candidate',
    description:
      'The next pending entry of the section (priority, then position) is offered the seat, which it holds until answered. A candidate who enrolled here meanwhile is withdrawn. Nothing is offered when the section is full or nobody waits.',
  })
  @ApiOkResponse({ type: WaitlistOfferDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async offer(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Body() body: OfferWaitlistDto,
  ): Promise<WaitlistOfferDto> {
    const entry = await this.waitlist.offerNext(
      auth.user.id,
      campus.school.id,
      body.academicCycleSectionId,
    );
    return entry
      ? { entry: await this.view(campus.school.id, entry.id), message: null }
      : { entry: null, message: WaitlistMessages.nothingToOffer };
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('manage admission waitlist')
  @ApiOperation({
    summary: 'The candidate takes the offered seat',
    description:
      'Places the learner in the section: a new enrollment, or their earlier one here opened again. Refused for a learner enrolled elsewhere or working as staff.',
  })
  @ApiOkResponse({ type: StudentDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async accept(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StudentDto> {
    return this.views.student(
      await this.waitlist.accept(auth.user.id, campus.school.id, id),
    );
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('manage admission waitlist')
  @ApiOperation({
    summary: 'Decline an open entry',
    description: 'A decided entry cannot be decided again.',
  })
  @ApiOkResponse({ type: WaitlistEntryDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async decline(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReasonDto,
  ): Promise<WaitlistEntryDto> {
    await this.waitlist.decline(
      auth.user.id,
      campus.school.id,
      id,
      body.reason ?? null,
    );
    return this.view(campus.school.id, id);
  }

  private async view(schoolId: string, id: string): Promise<WaitlistEntryDto> {
    const entry = await this.waitlist.find(schoolId, id);
    const views = await this.waitlist.list(schoolId, {
      academicCycleSectionId: entry.academicCycleSectionId,
    });
    return entryDto(views.find((view) => view.entry.id === id)!);
  }
}
