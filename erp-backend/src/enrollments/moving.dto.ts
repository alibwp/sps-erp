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
import { WAITLIST_STATUSES, type WaitlistStatus } from './moving.constants.js';
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

export class JoinWaitlistDto {
  @ApiProperty({
    format: 'uuid',
    description: 'A full section of this campus with a capacity',
  })
  @IsUUID('all')
  academicCycleSectionId: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'The candidate: a member of this campus, not enrolled here and not staff',
  })
  @IsUUID('all')
  userId: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 9999,
    default: 0,
    description: 'Higher goes first',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  priority?: number;
}

export class OfferWaitlistDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  academicCycleSectionId: string;
}

export class WaitlistQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all')
  academicCycleSectionId?: string;

  @ApiPropertyOptional({ enum: WAITLIST_STATUSES })
  @IsOptional()
  @IsIn(WAITLIST_STATUSES)
  status?: WaitlistStatus;
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

export class CandidateDto extends PersonDto {
  @ApiProperty() email: string;
}

export class WaitlistEntryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) academicYearId: string;
  @ApiProperty({ type: SectionBriefDto }) section: SectionBriefDto;
  @ApiProperty({ type: CandidateDto }) candidate: CandidateDto;
  @ApiProperty({ enum: WAITLIST_STATUSES }) status: WaitlistStatus;
  @ApiProperty() priority: number;
  @ApiProperty() position: number;
  @ApiProperty({
    description: 'The entry an offer would go to now in its section',
  })
  next: boolean;
  @ApiProperty({ nullable: true, type: String }) decisionReason: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  offeredAt: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  decidedAt: Date | null;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class WaitlistSectionDto extends SectionBriefDto {
  @ApiProperty({ format: 'uuid' }) academicYearId: string;
  @ApiProperty() capacity: number;
  @ApiProperty({ description: 'Placed learners plus open offers' })
  seatsTaken: number;
}

export class WaitlistOfferDto {
  @ApiProperty({
    type: WaitlistEntryDto,
    nullable: true,
    description: 'The entry offered the seat; null when none was',
  })
  entry: WaitlistEntryDto | null;
  @ApiProperty({ nullable: true, type: String }) message: string | null;
}
