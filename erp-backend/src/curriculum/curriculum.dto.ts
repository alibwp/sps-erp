import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
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
} from 'class-validator';
import {
  ROSTER_MODES,
  type RosterMode,
} from '../academic/academic.constants.js';
import { IsCalendarDay } from '../academic/academic.dto.js';
import { PaginationQueryDto } from '../common/pagination/pagination.js';
import {
  STRUCTURE_STATUSES,
  type StructureStatus,
  TEACHING_ROLES,
  type TeachingRole,
} from './curriculum.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });
const present = (_object: object, value: unknown) =>
  value !== null && value !== undefined;
const sent = (_object: object, value: unknown) => value !== undefined;

// A period id, or "all": every teaching period of the year.
function IsPeriodChoice() {
  return ValidateBy({
    name: 'isPeriodChoice',
    validator: {
      validate: (value) =>
        value === 'all' ||
        (typeof value === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            value,
          )),
      defaultMessage: () => 'Choose a period of this year.',
    },
  });
}

// An optional short text that may be cleared with null or "".
function OptionalText(max = 100): PropertyDecorator {
  return (target, key) => {
    Transform(blankToNull)(target, key);
    ValidateIf(present)(target, key);
    IsString()(target, key);
    MaxLength(max)(target, key);
  };
}

const SECTION_IDS = () => (target: object, key: string | symbol) => {
  IsOptional()(target, key);
  IsArray()(target, key);
  ArrayMaxSize(50)(target, key);
  ArrayUnique()(target, key);
  IsUUID('all', { each: true })(target, key);
};

const LEARNER_IDS = () => (target: object, key: string | symbol) => {
  IsOptional()(target, key);
  IsArray()(target, key);
  ArrayMaxSize(500)(target, key);
  ArrayUnique()(target, key);
  IsUUID('all', { each: true })(target, key);
};

// ---------- Shared ----------

export class StatusChangeDto {
  @ApiProperty({ enum: STRUCTURE_STATUSES })
  @IsIn(STRUCTURE_STATUSES)
  status: StructureStatus;
}

export class MoveDto {
  @ApiProperty({ enum: ['up', 'down'] })
  @IsIn(['up', 'down'])
  direction: 'up' | 'down';
}

export class MovedDto {
  @ApiProperty({ description: 'false: nothing to swap with' }) moved: boolean;
}

export class PersonDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

// ---------- Levels ----------

export class LevelDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  parentId: string | null;
  @ApiProperty({ description: 'A group teaches through its child levels' })
  isGroup: boolean;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String }) code: string | null;
  @ApiProperty() position: number;
  @ApiProperty({ enum: STRUCTURE_STATUSES }) status: string;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt: Date;
}

export class LevelListQueryDto {
  @ApiPropertyOptional({ enum: STRUCTURE_STATUSES })
  @IsOptional()
  @IsIn(STRUCTURE_STATUSES)
  status?: StructureStatus;
}

export class CreateLevelDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText()
  code?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'An active level group',
  })
  @ValidateIf(present)
  @IsUUID('all')
  parentId?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isGroup?: boolean;
}

export class UpdateLevelDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf(sent)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText()
  code?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'null: a top-level level',
  })
  @ValidateIf(present)
  @IsUUID('all')
  parentId?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isGroup?: boolean;
}

// ---------- Sections ----------

export class SectionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) academicYearId: string;
  @ApiProperty({ format: 'uuid' }) academicLevelId: string;
  @ApiProperty({ type: PersonDto, nullable: true })
  homeroomTeacher: PersonDto | null;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String }) label: string | null;
  @ApiProperty({ nullable: true, type: String }) stream: string | null;
  @ApiProperty({ nullable: true, type: String }) shift: string | null;
  @ApiProperty({ nullable: true, type: String }) language: string | null;
  @ApiProperty({ nullable: true, type: String }) room: string | null;
  @ApiProperty({ nullable: true, type: Number }) capacity: number | null;
  @ApiProperty() position: number;
  @ApiProperty({ enum: STRUCTURE_STATUSES }) status: string;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt: Date;
}

export class SectionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  academicYearId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  academicLevelId?: string;

  @ApiPropertyOptional({ enum: STRUCTURE_STATUSES })
  @IsOptional()
  @IsIn(STRUCTURE_STATUSES)
  status?: StructureStatus;
}

class SectionFieldsDto {
  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText()
  label?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText()
  stream?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText()
  shift?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText()
  language?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText()
  room?: string | null;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 999,
    nullable: true,
    type: Number,
  })
  @ValidateIf(present)
  @IsInt()
  @Min(1)
  @Max(999)
  capacity?: number | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 9999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  position?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'A teacher of the campus; null: none',
  })
  @ValidateIf(present)
  @IsUUID('all')
  homeroomTeacherId?: string | null;
}

export class CreateSectionDto extends SectionFieldsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  academicYearId: string;

  @ApiProperty({ format: 'uuid', description: 'An active, teachable level' })
  @IsUUID('all')
  academicLevelId: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class UpdateSectionDto extends SectionFieldsDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf(sent)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;
}

export class SectionBriefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ format: 'uuid' }) academicLevelId: string;
}

export class SectionRollForwardPreviewDto {
  @ApiProperty({ type: [SectionBriefDto] }) copies: SectionBriefDto[];
  @ApiProperty({
    type: [SectionBriefDto],
    description: 'The target year has a section of that name already',
  })
  skips: SectionBriefDto[];
  @ApiProperty({
    type: [SectionBriefDto],
    description: 'Archived, or of a level that is not an active teachable one',
  })
  leftBehind: SectionBriefDto[];
}

export class SectionRollForwardResultDto {
  @ApiProperty({ type: [SectionDto] }) created: SectionDto[];
}

// ---------- Subjects ----------

export class SubjectDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() shortName: string;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt: Date;
}

export class CreateSubjectDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  shortName: string;
}

export class UpdateSubjectDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf(sent)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf(sent)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  shortName?: string;
}

// ---------- Course offerings ----------

export class SubjectBriefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() shortName: string;
}

export class OfferingDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) academicYearId: string;
  @ApiProperty({ format: 'uuid' }) academicPeriodId: string;
  @ApiProperty({ type: SubjectBriefDto }) subject: SubjectBriefDto;
  @ApiProperty({ format: 'uuid' }) academicLevelId: string;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Tells two offerings of one subject apart (Algebra A)',
  })
  name: string | null;
  @ApiProperty({ enum: ROSTER_MODES }) rosterMode: string;
  @ApiProperty({ enum: STRUCTURE_STATUSES }) status: string;
  @ApiProperty({ nullable: true, type: Number })
  plannedPeriodsPerWeek: number | null;
  @ApiProperty({ nullable: true, type: Number }) capacity: number | null;
  @ApiProperty({ type: [String], format: 'uuid' })
  academicCycleSectionIds: string[];
  @ApiProperty({ type: [String], format: 'uuid' })
  studentRecordIds: string[];
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt: Date;
}

export class OfferingListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  academicYearId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  academicPeriodId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  academicLevelId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  subjectId?: string;

  @ApiPropertyOptional({ enum: STRUCTURE_STATUSES })
  @IsOptional()
  @IsIn(STRUCTURE_STATUSES)
  status?: StructureStatus;

  @ApiPropertyOptional({ enum: ROSTER_MODES })
  @IsOptional()
  @IsIn(ROSTER_MODES)
  rosterMode?: RosterMode;
}

export class CreateOfferingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  subjectId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  academicYearId: string;

  @ApiProperty({
    description:
      'A top-level period of the year, or "all" for every term, semester, trimester, quarter or custom period',
    example: 'all',
  })
  @IsPeriodChoice()
  academicPeriodId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  academicLevelId: string;

  @ApiProperty({ enum: ROSTER_MODES })
  @IsIn(ROSTER_MODES)
  rosterMode: RosterMode;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'One section, or two or more combined',
  })
  @SECTION_IDS()
  academicCycleSectionIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Named learners: active learners of the level this year',
  })
  @LEARNER_IDS()
  studentRecordIds?: string[];

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 80,
    nullable: true,
    type: Number,
  })
  @ValidateIf(present)
  @IsInt()
  @Min(1)
  @Max(80)
  plannedPeriodsPerWeek?: number | null;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 5000,
    nullable: true,
    type: Number,
  })
  @ValidateIf(present)
  @IsInt()
  @Min(1)
  @Max(5000)
  capacity?: number | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(1000)
  name?: string | null;
}

export class RenameOfferingDto {
  @ApiProperty({
    maxLength: 100,
    nullable: true,
    type: String,
    description: 'null or "": no name of its own',
  })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(1000)
  name: string | null;
}

export class UpdateRosterDto {
  @ApiProperty({ enum: ROSTER_MODES })
  @IsIn(ROSTER_MODES)
  rosterMode: RosterMode;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @SECTION_IDS()
  academicCycleSectionIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Named learners: active learners of the level this year',
  })
  @LEARNER_IDS()
  studentRecordIds?: string[];
}

export class BulkLevelDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  academicLevelId: string;

  @ApiProperty({ enum: ROSTER_MODES })
  @IsIn(ROSTER_MODES)
  rosterMode: RosterMode;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'With one section: one offering per section',
  })
  @SECTION_IDS()
  academicCycleSectionIds?: string[];

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 80,
    nullable: true,
    type: Number,
  })
  @ValidateIf(present)
  @IsInt()
  @Min(1)
  @Max(80)
  plannedPeriodsPerWeek?: number | null;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 5000,
    nullable: true,
    type: Number,
  })
  @ValidateIf(present)
  @IsInt()
  @Min(1)
  @Max(5000)
  capacity?: number | null;
}

export class BulkOfferingsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  subjectId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  academicYearId: string;

  @ApiProperty({ description: 'A top-level period, or "all"' })
  @IsPeriodChoice()
  academicPeriodId: string;

  @ApiProperty({ type: [BulkLevelDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BulkLevelDto)
  levels: BulkLevelDto[];
}

export class BulkSkipDto {
  @ApiProperty({ format: 'uuid' }) academicPeriodId: string;
  @ApiProperty({ format: 'uuid' }) academicLevelId: string;
  @ApiProperty({ enum: ROSTER_MODES }) rosterMode: string;
  @ApiProperty({ type: [String], format: 'uuid' })
  academicCycleSectionIds: string[];
  @ApiProperty() reason: string;
}

export class BulkResultDto {
  @ApiProperty({ type: [OfferingDto] }) created: OfferingDto[];
  @ApiProperty({ type: [BulkSkipDto] }) skipped: BulkSkipDto[];
}

export class OfferingCopyDto {
  @ApiProperty({ type: OfferingDto }) offering: OfferingDto;
  @ApiProperty({ format: 'uuid', description: 'The matching target period' })
  academicPeriodId: string;
  @ApiProperty() periodName: string;
  @ApiProperty() sectionCount: number;
}

export class OfferingProblemDto {
  @ApiProperty({ type: OfferingDto }) offering: OfferingDto;
  @ApiProperty() reason: string;
}

export class OfferingRollForwardPreviewDto {
  @ApiProperty({ type: [OfferingCopyDto] }) copies: OfferingCopyDto[];
  @ApiProperty({ type: [OfferingDto] }) skips: OfferingDto[];
  @ApiProperty({ type: [OfferingProblemDto] }) problems: OfferingProblemDto[];
}

export class OfferingRollForwardResultDto {
  @ApiProperty({ type: [OfferingDto] }) created: OfferingDto[];
}

export class RosterLearnerDto {
  @ApiProperty({ format: 'uuid' }) studentRecordId: string;
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() name: string;
  @ApiProperty() admissionNumber: string;
  @ApiProperty({ format: 'uuid', description: 'Their section on that day' })
  academicCycleSectionId: string;
}

export class RosterQueryDto {
  @ApiPropertyOptional({
    format: 'date',
    description: 'The day; defaults to the campus’s today',
  })
  @IsOptional()
  @IsCalendarDay()
  date?: string;
}

export class RosterDto {
  @ApiProperty({ format: 'uuid' }) courseOfferingId: string;
  @ApiProperty({ format: 'date' }) date: string;
  @ApiProperty({ enum: ROSTER_MODES }) rosterMode: string;
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'The levels whose learners the roster reaches',
  })
  academicLevelIds: string[];
  @ApiProperty({ type: [SectionBriefDto] }) sections: SectionBriefDto[];
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Named learners of a named-learner roster',
  })
  studentRecordIds: string[];
  @ApiProperty({
    description:
      'The reader teaches part of the offering and sees only those sections',
  })
  limitedToSections: boolean;
  @ApiProperty({
    type: [RosterLearnerDto],
    description: 'The enrolled learners the roster includes on that day',
  })
  learners: RosterLearnerDto[];
}

// ---------- Teaching assignments ----------

export class AssignmentDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) courseOfferingId: string;
  @ApiProperty({ type: PersonDto }) teacher: PersonDto;
  @ApiProperty({ enum: TEACHING_ROLES }) role: string;
  @ApiProperty({ type: SectionBriefDto, nullable: true })
  section: SectionBriefDto | null;
  @ApiProperty({ format: 'date' }) startsOn: string;
  @ApiProperty({ format: 'date', nullable: true, type: String })
  endsOn: string | null;
  @ApiProperty({ description: 'Running on the campus’s today' })
  running: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class AssignTeacherDto {
  @ApiProperty({ format: 'uuid', description: 'A teacher of the campus' })
  @IsUUID('all')
  userId: string;

  @ApiPropertyOptional({ enum: TEACHING_ROLES, default: 'lead' })
  @IsOptional()
  @IsIn(TEACHING_ROLES)
  role?: TeachingRole;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Teach only this section’s learners',
  })
  @ValidateIf(present)
  @IsUUID('all')
  academicCycleSectionId?: string | null;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Defaults to the campus’s today',
  })
  @IsOptional()
  @IsCalendarDay()
  startsOn?: string;
}

export class EndAssignmentDto {
  @ApiPropertyOptional({
    format: 'date',
    description: 'The last day; defaults to the campus’s today',
  })
  @IsOptional()
  @IsCalendarDay()
  endsOn?: string;
}

// ---------- Instructional-model exceptions ----------

export class LevelBriefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class ExceptionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) academicYearId: string;
  @ApiProperty({ type: SubjectBriefDto }) subject: SubjectBriefDto;
  @ApiProperty({
    type: LevelBriefDto,
    nullable: true,
    description: 'null: every level',
  })
  academicLevel: LevelBriefDto | null;
  @ApiProperty({ enum: ROSTER_MODES }) rosterMode: string;
  @ApiProperty() reason: string;
  @ApiProperty({ type: PersonDto, nullable: true }) grantedBy: PersonDto | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  revokedAt: Date | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  revokedById: string | null;
  @ApiProperty() running: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class GrantExceptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  subjectId: string;

  @ApiProperty({ enum: ROSTER_MODES })
  @IsIn(ROSTER_MODES)
  rosterMode: RosterMode;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'null: every level',
  })
  @ValidateIf(present)
  @IsUUID('all')
  academicLevelId?: string | null;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  reason: string;
}
