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
import {
  CAMPUS_MOVE_STATUSES,
  type CampusMoveStatus,
  WAITLIST_STATUSES,
  type WaitlistStatus,
} from './moving.constants.js';
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

export class MoveCampusDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'An active section of the current school year of another campus of this organization',
  })
  @IsUUID('all')
  academicCycleSectionId: string;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @OptionalReason()
  reason?: string | null;

  @ApiPropertyOptional({
    format: 'date',
    description: 'From when; defaults to the campus’s today, never later',
  })
  @IsOptional()
  @IsCalendarDay()
  effectiveOn?: string;
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

export class CampusBriefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class CampusSectionDto extends SectionBriefDto {
  @ApiProperty({ type: CampusBriefDto }) campus: CampusBriefDto;
}

export class CampusMoveRequestDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid', description: 'The enrollment' })
  studentId: string;
  @ApiProperty({ type: PersonDto, nullable: true }) learner: PersonDto | null;
  @ApiProperty() admissionNumber: string;
  @ApiProperty({ type: CampusBriefDto }) from: CampusBriefDto;
  @ApiProperty({ type: CampusBriefDto }) to: CampusBriefDto;
  @ApiProperty({ format: 'uuid' }) academicCycleSectionId: string;
  @ApiProperty({ enum: CAMPUS_MOVE_STATUSES }) status: CampusMoveStatus;
  @ApiProperty({ nullable: true, type: String }) reason: string | null;
  @ApiProperty({ format: 'date' }) effectiveOn: string;
  @ApiProperty({ type: PersonDto, nullable: true })
  requestedBy: PersonDto | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  decidedAt: Date | null;
  @ApiProperty({ nullable: true, type: String }) decisionNote: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class CampusMovesDto {
  @ApiProperty({
    type: [CampusMoveRequestDto],
    description: 'Open requests for this campus to decide',
  })
  incoming: CampusMoveRequestDto[];
  @ApiProperty({
    type: [CampusMoveRequestDto],
    description: 'Open requests this campus sent',
  })
  outgoing: CampusMoveRequestDto[];
}

export class CampusMoveOutcomeDto {
  @ApiProperty({
    description:
      'True when the learner moved now; false when the receiving campus was asked',
  })
  moved: boolean;
  @ApiProperty({ type: StudentDto, nullable: true }) student: StudentDto | null;
  @ApiProperty({ type: CampusMoveRequestDto, nullable: true })
  request: CampusMoveRequestDto | null;
}
