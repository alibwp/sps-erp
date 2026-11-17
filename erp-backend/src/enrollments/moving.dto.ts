import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { IsCalendarDay } from '../academic/academic.dto.js';
import { PersonDto, SectionBriefDto } from '../curriculum/curriculum.dto.js';
import {} from './moving.constants.js';
import { OptionalReason, StudentDto } from './students.dto.js';

// The most learners one promotion or graduation takes at once.
const MAX_LEARNERS = 500;

// ---------- Requests ----------

export class PromoteStudentsDto {
  @ApiProperty({ format: 'uuid', description: 'Where the learners sit now' })
  @IsUUID('all')
  sourceAcademicCycleSectionId: string;

  @ApiProperty({
    format: 'uuid',
    description: 'A section of this campus, in any school year',
  })
  @IsUUID('all')
  destinationAcademicCycleSectionId: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Enrollments (student ids); those no longer active in the source section are skipped',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_LEARNERS)
  @IsUUID('all', { each: true })
  studentIds: string[];
}

export class PromotionListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  academicYearId?: string;
}

export class GraduateStudentsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  academicCycleSectionId: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'Enrollments (student ids); those who left the section or already graduated are skipped',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_LEARNERS)
  @IsUUID('all', { each: true })
  studentIds: string[];

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @OptionalReason()
  reason?: string | null;
}

export class ReasonDto {
  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @OptionalReason()
  reason?: string | null;
}

export class NoteDto {
  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @OptionalReason()
  note?: string | null;
}

// ---------- Responses ----------

export class PromotionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid', description: 'The destination’s school year' })
  academicYearId: string;
  @ApiProperty({ type: SectionBriefDto }) source: SectionBriefDto;
  @ApiProperty({ type: SectionBriefDto }) destination: SectionBriefDto;
  @ApiProperty({ type: [String], format: 'uuid' }) studentIds: string[];
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class GraduationResultDto {
  @ApiProperty({ description: 'How many learners graduated' })
  graduated: number;
}
