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
import { COHORT_TYPES, type CohortType } from './cohorts.constants.js';

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
