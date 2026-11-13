import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidateIf,
  ValidateNested,
  type ValidationOptions,
} from 'class-validator';
import { isCalendarDay } from '../common/clock/dates.js';
import { PaginationQueryDto } from '../common/pagination/pagination.js';
import {
  ACADEMIC_STATUSES,
  INSTRUCTIONAL_MODELS,
  PERIOD_TYPES,
  ROSTER_MODES,
} from './academic.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });
const present = (_object: object, value: unknown) =>
  value !== null && value !== undefined;
const sent = (_object: object, value: unknown) => value !== undefined;

export function IsCalendarDay(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isCalendarDay',
      validator: {
        validate: (value) => isCalendarDay(value),
        defaultMessage: (args) =>
          `The ${args?.property} field must be a date in the format Y-m-d.`,
      },
    },
    options,
  );
}

function OptionalReason(): PropertyDecorator {
  return (target, key) => {
    Transform(blankToNull)(target, key);
    ValidateIf(present)(target, key);
    IsString()(target, key);
    MaxLength(500)(target, key);
  };
}

// ---------- Years and periods: responses ----------

export class PeriodDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) academicYearId: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  parentId: string | null;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String }) label: string | null;
  @ApiProperty({ description: 'The label when set, else the name' })
  displayName: string;
  @ApiProperty({ enum: PERIOD_TYPES }) type: string;
  @ApiProperty() position: number;
  @ApiProperty({ format: 'date', nullable: true, type: String })
  startsOn: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String })
  endsOn: string | null;
  @ApiProperty({ enum: ACADEMIC_STATUSES }) status: string;
  @ApiProperty({ type: () => [PeriodDto] }) children: PeriodDto[];
}

export class YearDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: '2026–27' }) name: string;
  @ApiProperty() startYear: number;
  @ApiProperty() stopYear: number;
  @ApiProperty({ format: 'date', nullable: true, type: String })
  startsOn: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String })
  endsOn: string | null;
  @ApiProperty({ enum: ACADEMIC_STATUSES }) status: string;
  @ApiProperty({ description: 'The campus opens in this year by default' })
  isCampusDefault: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class YearDetailDto extends YearDto {
  @ApiProperty({
    type: [PeriodDto],
    description:
      'Top-level periods in calendar order, each with its sub-periods',
  })
  periods: PeriodDto[];
}

export class StatusHistoryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ACADEMIC_STATUSES }) fromStatus: string;
  @ApiProperty({ enum: ACADEMIC_STATUSES }) toStatus: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  changedById: string | null;
  @ApiProperty({ nullable: true, type: String }) reason: string | null;
  @ApiProperty({
    nullable: true,
    description: 'Closure-readiness findings a close was made on',
  })
  checklist: unknown[] | null;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class ClosureFindingDto {
  @ApiProperty({ example: 'open_periods' }) key: string;
  @ApiProperty() summary: string;
  @ApiProperty() count: number;
  @ApiProperty({ description: 'Refuses the close unless it is forced' })
  blocking: boolean;
}

export class ClosureReadinessDto {
  @ApiProperty({ description: 'No blocking finding' }) ready: boolean;
  @ApiProperty({ type: [ClosureFindingDto] }) findings: ClosureFindingDto[];
}

export class YearListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ACADEMIC_STATUSES })
  @IsOptional()
  @IsIn(ACADEMIC_STATUSES)
  status?: (typeof ACADEMIC_STATUSES)[number];
}

// ---------- Years and periods: requests ----------

export class CalendarPeriodInputDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'An existing period of this calendar, to keep it',
  })
  @IsOptional()
  @IsUUID('all')
  id?: string;

  @ApiProperty({ maxLength: 100, example: 'First term' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: ['term', 'semester', 'trimester', 'quarter', 'other'] })
  @IsIn(PERIOD_TYPES)
  type: (typeof PERIOD_TYPES)[number];

  @ApiProperty({ format: 'date' })
  @IsCalendarDay()
  startsOn: string;

  @ApiProperty({ format: 'date' })
  @IsCalendarDay()
  endsOn: string;
}

// Reference AcademicCalendarForm: the year's dates and up to eight
// top-level periods.
export class SaveCalendarDto {
  @ApiProperty({ format: 'date', example: '2026-09-07' })
  @IsCalendarDay()
  startsOn: string;

  @ApiProperty({ format: 'date', example: '2027-07-16' })
  @IsCalendarDay()
  endsOn: string;

  @ApiProperty({ type: [CalendarPeriodInputDto] })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Add at least one reporting period to the school calendar.',
  })
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => CalendarPeriodInputDto)
  periods: CalendarPeriodInputDto[];
}

export class CreatePeriodDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(100)
  label?: string | null;

  @ApiProperty({
    enum: PERIOD_TYPES,
    description:
      'Top level: term, semester, trimester, quarter or other. Inside a period: exam_window, holiday or reporting_period.',
  })
  @IsIn(PERIOD_TYPES)
  type: (typeof PERIOD_TYPES)[number];

  @ApiProperty({ format: 'date' })
  @IsCalendarDay()
  startsOn: string;

  @ApiProperty({ format: 'date' })
  @IsCalendarDay()
  endsOn: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'A top-level period of the same year to sit inside',
  })
  @IsOptional()
  @IsUUID('all')
  parentId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 99 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  position?: number;
}

export class UpdatePeriodDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @ValidateIf(sent)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(100)
  label?: string | null;

  @ApiPropertyOptional({ enum: PERIOD_TYPES })
  @IsOptional()
  @IsIn(PERIOD_TYPES)
  type?: (typeof PERIOD_TYPES)[number];

  @ApiPropertyOptional({ minimum: 1, maximum: 99 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  position?: number;
}

export class ChangeDatesDto {
  @ApiProperty({ format: 'date' })
  @IsCalendarDay()
  startsOn: string;

  @ApiProperty({ format: 'date' })
  @IsCalendarDay()
  endsOn: string;

  @ApiPropertyOptional({
    maxLength: 500,
    nullable: true,
    type: String,
    description: 'Required while the period is open or closing',
  })
  @OptionalReason()
  reason?: string | null;
}

export class StatusChangeRequestDto {
  @ApiProperty({ enum: ACADEMIC_STATUSES })
  @IsIn(ACADEMIC_STATUSES)
  to: (typeof ACADEMIC_STATUSES)[number];

  @ApiPropertyOptional({
    maxLength: 500,
    nullable: true,
    type: String,
    description: 'Required when leaving closed for an open state',
  })
  @OptionalReason()
  reason?: string | null;

  @ApiPropertyOptional({
    description:
      'Close despite blocking readiness findings (holders of "close academic period")',
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class RollForwardRequestDto {
  @ApiProperty({ format: 'uuid', description: 'The year to copy from' })
  @IsUUID('all')
  sourceYearId: string;
}

export class RollForwardItemDto {
  @ApiProperty({ enum: ['instructional_model', 'academic_periods'] })
  key: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty({ type: [String] }) details: string[];
  @ApiProperty() count: number;
  @ApiProperty() willCreate: boolean;
}

export class RollForwardPreviewDto {
  @ApiProperty({ type: [RollForwardItemDto] }) items: RollForwardItemDto[];
  @ApiProperty() createCount: number;
}

export class RollForwardResultDto {
  @ApiProperty() instructionalModel: boolean;
  @ApiProperty() academicPeriods: number;
}

// ---------- Instructional model ----------

export class SetInstructionalModelDto {
  @ApiProperty({ enum: INSTRUCTIONAL_MODELS })
  @IsIn(INSTRUCTIONAL_MODELS)
  model: (typeof INSTRUCTIONAL_MODELS)[number];

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @OptionalReason()
  reason?: string | null;
}

export class MigrateInstructionalModelDto {
  @ApiProperty({ enum: INSTRUCTIONAL_MODELS })
  @IsIn(INSTRUCTIONAL_MODELS)
  model: (typeof INSTRUCTIONAL_MODELS)[number];

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  reason: string;
}

export class ModelMigrationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: INSTRUCTIONAL_MODELS, nullable: true, type: String })
  fromModel: string | null;
  @ApiProperty({ enum: INSTRUCTIONAL_MODELS }) toModel: string;
  @ApiProperty() reason: string;
  @ApiProperty({ nullable: true }) impact: Record<string, unknown> | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  migratedById: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class InstructionalModelDto {
  @ApiProperty({ format: 'uuid' }) academicYearId: string;
  @ApiProperty({ enum: INSTRUCTIONAL_MODELS }) model: string;
  @ApiProperty() label: string;
  @ApiProperty({ description: 'false: nothing saved yet, the default applies' })
  chosen: boolean;
  @ApiProperty({ enum: ROSTER_MODES, isArray: true }) rosterModes: string[];
  @ApiProperty({ description: 'The year has not started: set it directly' })
  canSet: boolean;
  @ApiProperty({ description: 'The year is running: migrate with a reason' })
  canMigrate: boolean;
  @ApiProperty({ type: [ModelMigrationDto] }) migrations: ModelMigrationDto[];
}

// ---------- Setup ----------

export class SetupStepDto {
  @ApiProperty() value: string;
  @ApiProperty() label: string;
  @ApiProperty() description: string;
  @ApiProperty() complete: boolean;
  @ApiProperty() required: boolean;
}

export class SetupProgressDto {
  @ApiProperty({ type: [SetupStepDto] }) steps: SetupStepDto[];
  @ApiProperty({ description: 'The first step not done' }) current: string;
}

export class YearSetupDto extends SetupProgressDto {
  @ApiProperty({ format: 'uuid' }) academicYearId: string;
}

export class ChecklistItemDto {
  @ApiProperty() key: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty({ description: 'Why it is not done; empty when done' })
  reason: string;
  @ApiProperty() complete: boolean;
  @ApiProperty() required: boolean;
  @ApiProperty() group: string;
}

export class SetupPhaseDto {
  @ApiProperty() key: string;
  @ApiProperty({ enum: ['in_progress', 'ready', 'acknowledged'] })
  status: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  completedAt: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  acknowledgedAt: Date | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  acknowledgedById: string | null;
}

export class SchoolSetupDto {
  @ApiProperty({ type: SetupProgressDto }) progress: SetupProgressDto;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  academicYearId: string | null;
  @ApiProperty({
    example: {
      academicLevels: 0,
      academicPeriods: 3,
      cycleSections: 0,
      courseOfferings: 0,
      gradingScales: 0,
      teachers: 2,
      students: 0,
    },
  })
  counts: Record<string, number>;
  @ApiProperty({ type: [ChecklistItemDto] }) items: ChecklistItemDto[];
  @ApiProperty() completed: number;
  @ApiProperty() total: number;
  @ApiProperty() requiredRemaining: number;
  @ApiProperty({ nullable: true, type: String }) next: string | null;
  @ApiProperty({ type: SetupPhaseDto }) phase: SetupPhaseDto;
  @ApiProperty() showReadyNotice: boolean;
}

// ---------- Working context ----------

export class SetWorkingContextDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Needs "set academic year". A published year of the campus.',
  })
  @ValidateIf((object: SetWorkingContextDto) => !object.academicPeriodId)
  @IsUUID('all', { message: 'Send academicYearId, academicPeriodId or both.' })
  academicYearId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Needs "set academic period". A top-level period of the working year.',
  })
  @ValidateIf((object: SetWorkingContextDto) => !object.academicYearId)
  @IsUUID('all', { message: 'Send academicYearId, academicPeriodId or both.' })
  academicPeriodId?: string;
}

// ---------- Calendar templates ----------

export class TemplatePeriodInputDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(100)
  label?: string | null;

  @ApiProperty({ enum: PERIOD_TYPES })
  @IsIn(PERIOD_TYPES)
  type: (typeof PERIOD_TYPES)[number];

  @ApiProperty({ minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  position: number;

  @ApiProperty({
    minimum: 0,
    maximum: 3660,
    description: 'Days after the cycle start',
  })
  @IsInt()
  @Min(0)
  @Max(3660)
  startOffsetDays: number;

  @ApiProperty({ minimum: 1, maximum: 3660 })
  @IsInt()
  @Min(1)
  @Max(3660)
  lengthDays: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 12,
    nullable: true,
    type: Number,
    description: 'The 1-based row number of an earlier row: its parent',
  })
  @ValidateIf(present)
  @IsInt()
  @Min(1)
  @Max(12)
  parentIndex?: number | null;
}

// Reference CalendarTemplateForm.
export class SaveTemplateDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiProperty({ minimum: 1, maximum: 3660, example: 365 })
  @IsInt()
  @Min(1)
  @Max(3660)
  cycleLengthDays: number;

  @ApiPropertyOptional({ description: 'The organization default' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({
    description: 'Open scheduled years and periods on their start date',
  })
  @IsOptional()
  @IsBoolean()
  autoOpen?: boolean;

  @ApiProperty({ minimum: 0, maximum: 104, description: '0: never' })
  @IsInt()
  @Min(0)
  @Max(104)
  generateAheadWeeks: number;

  @ApiProperty({ minimum: 0, maximum: 90, description: '0: no reminders' })
  @IsInt()
  @Min(0)
  @Max(90)
  remindDaysBefore: number;

  @ApiProperty({ type: [TemplatePeriodInputDto] })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Add at least one period to the calendar template.',
  })
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => TemplatePeriodInputDto)
  periods: TemplatePeriodInputDto[];
}

export class TemplatePeriodDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  parentId: string | null;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String }) label: string | null;
  @ApiProperty({ enum: PERIOD_TYPES }) type: string;
  @ApiProperty() position: number;
  @ApiProperty() startOffsetDays: number;
  @ApiProperty() lengthDays: number;
}

export class TemplateDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) organizationId: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty() isDefault: boolean;
  @ApiProperty() cycleLengthDays: number;
  @ApiProperty() autoOpen: boolean;
  @ApiProperty() generateAheadWeeks: number;
  @ApiProperty() remindDaysBefore: number;
  @ApiProperty({ type: [TemplatePeriodDto] }) periods: TemplatePeriodDto[];
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class CampusTemplateDto {
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'null: follow the organization default again',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsUUID('all', { message: 'The calendar template id must be a UUID.' })
  calendarTemplateId: string | null;

  @ApiPropertyOptional({
    maxLength: 500,
    nullable: true,
    type: String,
    description: 'Required for a template of the campus’s own',
  })
  @OptionalReason()
  reason?: string | null;
}

export class GenerateCycleDto {
  @ApiProperty({ format: 'date', description: 'The first day of the cycle' })
  @IsCalendarDay()
  startsOn: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Defaults to the template the campus follows',
  })
  @IsOptional()
  @IsUUID('all')
  calendarTemplateId?: string;
}
