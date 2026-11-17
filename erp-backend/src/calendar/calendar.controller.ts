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
  RequireFeature,
  RequirePermission,
  RequireVerifiedEmail,
} from '../access/access-context.js';
import { ApiErrorResponses } from '../common/openapi/openapi.js';
import {
  type AuthContext,
  CurrentAuth,
} from '../identity/auth/auth-context.js';
import { CalendarEvents } from './calendar-events.service.js';
import { wallTime } from './calendar.constants.js';
import {
  CalendarQueryDto,
  CreateEventDto,
  EventDetailDto,
  EventDto,
  UpdateEventDto,
} from './calendar.dto.js';
import type { CalendarEvent } from './entities/calendar-event.entity.js';

const ERRORS = [
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
] as const;
const WRITE_ERRORS = [...ERRORS, HttpStatus.UNPROCESSABLE_ENTITY] as const;

const reader = (auth: AuthContext, campus: CampusAccess) => ({
  id: auth.user.id,
  permissions: campus.permissions,
});

// The campus calendar (reference CalendarEventController,
// CalendarEventEditor, CalendarEventDirectory, CalendarEventPolicy),
// behind the events feature.
@ApiTags('Calendar events')
@ApiBearerAuth('bearer')
@CampusRoute()
@RequireFeature('events')
@Controller('calendar-events')
export class CalendarEventsController {
  constructor(private readonly events: CalendarEvents) {}

  @Get()
  @RequirePermission('read calendar event')
  @ApiOperation({
    summary: 'Events touching the days from … to',
    description:
      'Drafts only for "update calendar event". People who only hold the parent or student role read their calendar through the portal.',
  })
  @ApiOkResponse({ type: [EventDto] })
  @ApiErrorResponses(...ERRORS)
  async list(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Query() query: CalendarQueryDto,
  ): Promise<EventDto[]> {
    const events = await this.events.list(
      campus.school,
      reader(auth, campus),
      query,
    );
    return events.map((event) => this.dto(event, campus));
  }

  @Post()
  @RequireVerifiedEmail()
  @RequirePermission('create calendar event')
  @ApiOperation({
    summary: 'Add an event (a draft)',
    description:
      'No sections and no people means the whole campus. An event cannot end before it starts or last more than a year.',
  })
  @ApiCreatedResponse({ type: EventDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async create(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Body() body: CreateEventDto,
  ): Promise<EventDetailDto> {
    const event = await this.events.create(
      reader(auth, campus),
      campus.school,
      body,
    );
    return this.detail(auth, campus, event.id, false);
  }

  @Get(':id')
  @RequirePermission('read calendar event')
  @ApiOperation({
    summary: 'One event',
    description: 'A draft for "update calendar event" or its creator.',
  })
  @ApiOkResponse({ type: EventDetailDto })
  @ApiErrorResponses(...ERRORS)
  show(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EventDetailDto> {
    return this.detail(auth, campus, id);
  }

  @Patch(':id')
  @RequireVerifiedEmail()
  @RequirePermission('update calendar event')
  @ApiOperation({
    summary: 'Change an event',
    description: 'Sections and people, when sent, replace the ones it had.',
  })
  @ApiOkResponse({ type: EventDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateEventDto,
  ): Promise<EventDetailDto> {
    await this.events.update(reader(auth, campus), campus.school, id, body);
    return this.detail(auth, campus, id, false);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('publish calendar event')
  @ApiOperation({
    summary: 'Publish an event',
    description:
      'A published holiday or closure shuts the campus, or its sections.',
  })
  @ApiOkResponse({ type: EventDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async publish(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EventDetailDto> {
    await this.events.setPublished(campus.school.id, id, true);
    return this.detail(auth, campus, id, false);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  @RequireVerifiedEmail()
  @RequirePermission('publish calendar event')
  @ApiOperation({ summary: 'Take an event back to a draft' })
  @ApiOkResponse({ type: EventDetailDto })
  @ApiErrorResponses(...WRITE_ERRORS)
  async unpublish(
    @CurrentAuth() auth: AuthContext,
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EventDetailDto> {
    await this.events.setPublished(campus.school.id, id, false);
    return this.detail(auth, campus, id, false);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireVerifiedEmail()
  @RequirePermission('delete calendar event')
  @ApiOperation({ summary: 'Remove an event' })
  @ApiNoContentResponse()
  @ApiErrorResponses(...WRITE_ERRORS)
  async remove(
    @Campus() campus: CampusAccess,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.events.remove(campus.school.id, id);
  }

  private dto(event: CalendarEvent, campus: CampusAccess): EventDto {
    const timezone = campus.school.timezone;
    const audiences = event.audiences ?? [];
    return {
      id: event.id,
      title: event.title,
      type: event.type,
      description: event.description,
      location: event.location,
      isAllDay: event.isAllDay,
      isPublished: event.isPublished,
      startsAt: wallTime(event.startsAt, timezone),
      endsAt: wallTime(event.endsAt, timezone),
      academicYearId: event.academicYearId,
      academicPeriodId: event.academicPeriodId,
      sectionIds: audiences.flatMap((a) =>
        a.academicCycleSectionId ? [a.academicCycleSectionId] : [],
      ),
      userIds: audiences.flatMap((a) => (a.userId ? [a.userId] : [])),
      createdAt: event.createdAt,
    };
  }

  private async detail(
    auth: AuthContext,
    campus: CampusAccess,
    id: string,
    // Write routes answer with what they changed; reads check visibility.
    checkVisibility = true,
  ): Promise<EventDetailDto> {
    const event = checkVisibility
      ? await this.events.find(campus.school, id, reader(auth, campus))
      : await this.events.load(campus.school.id, id);
    const audiences = await this.events.audiences(event.id);
    event.audiences = audiences;
    return {
      ...this.dto(event, campus),
      sections: audiences.flatMap((a) =>
        a.academicCycleSection
          ? [
              {
                id: a.academicCycleSection.id,
                name: a.academicCycleSection.name,
                academicLevelId: a.academicCycleSection.academicLevelId,
              },
            ]
          : [],
      ),
      people: audiences.flatMap((a) =>
        a.user ? [{ id: a.user.id, name: a.user.name }] : [],
      ),
    };
  }
}
