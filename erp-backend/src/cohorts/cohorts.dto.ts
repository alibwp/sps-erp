import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDay } from '../academic/academic.dto.js';
import { PersonDto } from '../curriculum/curriculum.dto.js';
import { OptionalReason } from '../enrollments/students.dto.js';
import {
  COHORT_TYPES,
  type CohortType,
  PARTICIPATION_STATUSES,
  PROGRAM_TYPES,
  type ParticipationStatus,
  type ProgramType,
} from './cohorts.constants.js';

const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;
const present = (_object: object, value: unknown) =>
  value !== null && value !== undefined;
const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

function OptionalText(max: number): PropertyDecorator {
  return (target, key) => {
    Transform(blankToNull)(target, key);
    ValidateIf(present)(target, key);
    IsString()(target, key);
    MaxLength(max)(target, key);
  };
}

// ---------- Requests ----------

export class CohortQueryDto {
  @ApiPropertyOptional({ enum: COHORT_TYPES })
  @IsOptional()
  @IsIn(COHORT_TYPES)
  type?: CohortType;

  @ApiPropertyOptional({ description: 'Only active cohorts' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  activeOnly?: boolean;
}

export class CreateCohortDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    enum: COHORT_TYPES,
    description: 'A watchlist is always restricted',
  })
  @IsIn(COHORT_TYPES)
  type: CohortType;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @OptionalText(500)
  description?: string | null;

  @ApiPropertyOptional({
    description: 'Set or cleared only with "read restricted cohort"',
  })
  @IsOptional()
  @IsBoolean()
  isRestricted?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'A school year of this campus; the working year when left out',
  })
  @IsOptional()
  @ValidateIf(present)
  @IsUUID('all')
  academicYearId?: string | null;
}

export class UpdateCohortDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: COHORT_TYPES })
  @IsOptional()
  @IsIn(COHORT_TYPES)
  type?: CohortType;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @OptionalText(500)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRestricted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @ValidateIf(present)
  @IsUUID('all')
  academicYearId?: string | null;
}

export class MembersQueryDto {
  @ApiPropertyOptional({ description: 'Only the current members' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  currentOnly?: boolean;
}

export class JoinCohortDto {
  @ApiProperty({ format: 'uuid', description: 'An enrollment at this campus' })
  @IsUUID('all')
  studentId: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Campus today when left out; never a later day',
  })
  @IsOptional()
  @IsCalendarDay()
  joinedOn?: string;
}

export class LeaveCohortDto {
  @ApiPropertyOptional({
    format: 'date',
    description:
      'Campus today when left out; a day before joining moves to the joining day',
  })
  @IsOptional()
  @IsCalendarDay()
  leftOn?: string;
}

export class ProgramQueryDto {
  @ApiPropertyOptional({ enum: PROGRAM_TYPES })
  @IsOptional()
  @IsIn(PROGRAM_TYPES)
  type?: ProgramType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  activeOnly?: boolean;
}

export class CreateProgramDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: PROGRAM_TYPES })
  @IsIn(PROGRAM_TYPES)
  type: ProgramType;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @OptionalText(500)
  description?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProgramDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: PROGRAM_TYPES })
  @IsOptional()
  @IsIn(PROGRAM_TYPES)
  type?: ProgramType;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @OptionalText(500)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PlacesQueryDto {
  @ApiPropertyOptional({ enum: PARTICIPATION_STATUSES })
  @IsOptional()
  @IsIn(PARTICIPATION_STATUSES)
  status?: ParticipationStatus;
}

export class JoinProgramDto {
  @ApiProperty({
    format: 'uuid',
    description: 'An active enrollment at this campus',
  })
  @IsUUID('all')
  studentId: string;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Campus today when left out',
  })
  @IsOptional()
  @IsCalendarDay()
  startsOn?: string;

  @ApiPropertyOptional({ maxLength: 255, nullable: true, type: String })
  @OptionalText(255)
  schedule?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'A member of staff at this campus',
  })
  @IsOptional()
  @ValidateIf(present)
  @IsUUID('all')
  staffId?: string | null;
}

export class MovePlaceDto {
  @ApiProperty({ enum: PARTICIPATION_STATUSES })
  @IsIn(PARTICIPATION_STATUSES)
  status: ParticipationStatus;

  @ApiProperty({
    enum: PARTICIPATION_STATUSES,
    description: 'The status you saw; a place changed meanwhile is refused',
  })
  @IsIn(PARTICIPATION_STATUSES)
  seen: ParticipationStatus;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @OptionalReason()
  note?: string | null;
}

// ---------- Responses ----------

export class CohortDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: COHORT_TYPES }) type: CohortType;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty() isRestricted: boolean;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  academicYearId: string | null;
  @ApiProperty() currentMembers: number;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class LearnerBriefDto extends PersonDto {
  @ApiProperty({ format: 'uuid', description: 'The enrollment' })
  studentId: string;
  @ApiProperty() admissionNumber: string;
}

export class CohortMemberDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: LearnerBriefDto }) learner: LearnerBriefDto;
  @ApiProperty({ format: 'date' }) joinedOn: string;
  @ApiProperty({ format: 'date', nullable: true, type: String })
  leftOn: string | null;
  @ApiProperty({ type: PersonDto, nullable: true }) addedBy: PersonDto | null;
}

export class ProgramDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: PROGRAM_TYPES }) type: ProgramType;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty() isActive: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class PlaceDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: LearnerBriefDto }) learner: LearnerBriefDto;
  @ApiProperty({ enum: PARTICIPATION_STATUSES }) status: ParticipationStatus;
  @ApiProperty({ format: 'date', nullable: true, type: String })
  startsOn: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String })
  endsOn: string | null;
  @ApiProperty({ nullable: true, type: String }) schedule: string | null;
  @ApiProperty({ nullable: true, type: String }) note: string | null;
  @ApiProperty({ type: PersonDto, nullable: true }) staff: PersonDto | null;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  academicYearId: string | null;
}
