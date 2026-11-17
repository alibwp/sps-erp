import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDay } from '../academic/academic.dto.js';
import { PersonDto, SectionBriefDto } from '../curriculum/curriculum.dto.js';
import {
  CALENDAR_EVENT_TYPES,
  type CalendarEventType,
} from './calendar.constants.js';

const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;
const present = (_object: object, value: unknown) =>
  value !== null && value !== undefined;
const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;
// "2026-11-10" or "2026-11-10T09:30", in the campus's own time.
const CAMPUS_TIME = /^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?)?$/;

function OptionalText(max: number): PropertyDecorator {
  return (target, key) => {
    Transform(blankToNull)(target, key);
    ValidateIf(present)(target, key);
    IsString()(target, key);
    MaxLength(max)(target, key);
  };
}

// ---------- Requests ----------

export class CalendarQueryDto {
  @ApiProperty({ format: 'date', description: 'First day (campus time)' })
  @IsCalendarDay()
  from: string;

  @ApiProperty({ format: 'date', description: 'Last day (campus time)' })
  @IsCalendarDay()
  to: string;

  @ApiPropertyOptional({ enum: CALENDAR_EVENT_TYPES })
  @IsOptional()
  @IsIn(CALENDAR_EVENT_TYPES)
  type?: CalendarEventType;

  @ApiPropertyOptional({ description: 'Only drafts' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  draftsOnly?: boolean;
}

export class CreateEventDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ enum: CALENDAR_EVENT_TYPES })
  @IsIn(CALENDAR_EVENT_TYPES)
  type: CalendarEventType;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true, type: String })
  @OptionalText(2000)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true, type: String })
  @OptionalText(255)
  location?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @ApiProperty({
    example: '2026-11-10T09:30',
    description:
      'Campus time; a day ("2026-11-10") is enough for an all-day event',
  })
  @Matches(CAMPUS_TIME, {
    message: 'The start field must be a date or a date and time.',
  })
  startsAt: string;

  @ApiProperty({ example: '2026-11-10T11:00' })
  @Matches(CAMPUS_TIME, {
    message: 'The end field must be a date or a date and time.',
  })
  endsAt: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Sections of this campus; none (with no people) means the whole campus',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  sectionIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Members of this campus',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  userIds?: string[];
}

export class UpdateEventDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ enum: CALENDAR_EVENT_TYPES })
  @IsOptional()
  @IsIn(CALENDAR_EVENT_TYPES)
  type?: CalendarEventType;

  @ApiPropertyOptional({ maxLength: 2000, nullable: true, type: String })
  @OptionalText(2000)
  description?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true, type: String })
  @OptionalText(255)
  location?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @ApiPropertyOptional({ example: '2026-11-10T09:30' })
  @IsOptional()
  @Matches(CAMPUS_TIME, {
    message: 'The start field must be a date or a date and time.',
  })
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-11-10T11:00' })
  @IsOptional()
  @Matches(CAMPUS_TIME, {
    message: 'The end field must be a date or a date and time.',
  })
  endsAt?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  sectionIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  userIds?: string[];
}

// ---------- Responses ----------

export class EventDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: CALENDAR_EVENT_TYPES }) type: CalendarEventType;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({ nullable: true, type: String }) location: string | null;
  @ApiProperty() isAllDay: boolean;
  @ApiProperty() isPublished: boolean;
  @ApiProperty({ example: '2026-11-10T09:30', description: 'Campus time' })
  startsAt: string;
  @ApiProperty({ example: '2026-11-10T11:00', description: 'Campus time' })
  endsAt: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  academicYearId: string | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  academicPeriodId: string | null;
  @ApiProperty({ type: [String], format: 'uuid' }) sectionIds: string[];
  @ApiProperty({ type: [String], format: 'uuid' }) userIds: string[];
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class EventDetailDto extends EventDto {
  @ApiProperty({ type: [SectionBriefDto] }) sections: SectionBriefDto[];
  @ApiProperty({ type: [PersonDto] }) people: PersonDto[];
}
