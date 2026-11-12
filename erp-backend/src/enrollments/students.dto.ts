import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDay } from '../academic/academic.dto.js';
import { ProvisionAccountDto } from '../accounts/accounts.dto.js';
import { PaginationQueryDto } from '../common/pagination/pagination.js';
import { PersonDto, SectionBriefDto } from '../curriculum/curriculum.dto.js';
import {
  ENROLLMENT_STATUSES,
  type EnrollmentStatus,
} from './enrollment.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });
const present = (_object: object, value: unknown) =>
  value !== null && value !== undefined;

function OptionalReason(): PropertyDecorator {
  return (target, key) => {
    Transform(blankToNull)(target, key);
    ValidateIf(present)(target, key);
    IsString()(target, key);
    MaxLength(500)(target, key);
  };
}

// ---------- Requests ----------

export class AdmitStudentDto extends ProvisionAccountDto {
  @ApiProperty({
    format: 'uuid',
    description: 'An active section of the working school year',
  })
  @IsUUID('all')
  academicCycleSectionId: string;

  @ApiPropertyOptional({
    maxLength: 100,
    nullable: true,
    type: String,
    description:
      'Unique at the campus. Left out: {campus initials}/{two-digit year}/{six digits}',
  })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(100)
  admissionNumber?: string | null;

  @ApiPropertyOptional({
    format: 'date',
    description: 'Defaults to the campus’s today; never later',
  })
  @IsOptional()
  @IsCalendarDay()
  admissionDate?: string;
}

export class UpdateStudentDto extends PartialType(ProvisionAccountDto) {}

export class StudentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ENROLLMENT_STATUSES })
  @IsOptional()
  @IsIn(ENROLLMENT_STATUSES)
  status?: EnrollmentStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Learners placed in that year',
  })
  @IsOptional()
  @IsUUID('all')
  academicYearId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Learners whose section is of that level',
  })
  @IsOptional()
  @IsUUID('all')
  academicLevelId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Learners in it now' })
  @IsOptional()
  @IsUUID('all')
  academicCycleSectionId?: string;
}

export class PlaceStudentDto {
  @ApiProperty({
    format: 'uuid',
    description: 'An active section of the working school year',
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

export class ChangeEnrollmentStatusDto {
  @ApiProperty({ enum: ENROLLMENT_STATUSES })
  @IsIn(ENROLLMENT_STATUSES)
  status: EnrollmentStatus;

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

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    type: String,
    description:
      'Taking a learner who left back into another section of the campus',
  })
  @ValidateIf(present)
  @IsUUID('all')
  academicCycleSectionId?: string | null;
}

// ---------- Responses ----------

export class StudentSectionDto extends SectionBriefDto {
  @ApiProperty({ format: 'uuid' }) academicYearId: string;
}

export class StudentDto {
  @ApiProperty({ format: 'uuid', description: 'The enrollment' }) id: string;
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty() admissionNumber: string;
  @ApiProperty({ format: 'date' }) admissionDate: string;
  @ApiProperty({ enum: ENROLLMENT_STATUSES }) status: string;
  @ApiProperty() isPrimary: boolean;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  transferredFromId: string | null;
  @ApiProperty({
    type: StudentSectionDto,
    nullable: true,
    description: 'Where they sit now',
  })
  section: StudentSectionDto | null;
  @ApiProperty({ format: 'date', nullable: true, type: String })
  birthday: string | null;
  @ApiProperty({ nullable: true, type: String }) gender: string | null;
  @ApiProperty({ nullable: true, type: String }) phone: string | null;
  @ApiProperty({ nullable: true, type: String }) address: string | null;
  @ApiProperty({ nullable: true, type: String }) addressLine2: string | null;
  @ApiProperty({ nullable: true, type: String }) city: string | null;
  @ApiProperty({ nullable: true, type: String }) state: string | null;
  @ApiProperty({ nullable: true, type: String }) postalCode: string | null;
  @ApiProperty({ nullable: true, type: String }) country: string | null;
  @ApiProperty({ nullable: true, type: String }) nationality: string | null;
  @ApiProperty() accountStatus: string;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class PlacementHistoryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) academicYearId: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  academicPeriodId: string | null;
  @ApiProperty({ type: SectionBriefDto }) section: SectionBriefDto;
  @ApiProperty({ format: 'date' }) effectiveOn: string;
  @ApiProperty({ type: PersonDto, nullable: true }) changedBy: PersonDto | null;
  @ApiProperty({ nullable: true, type: String }) reason: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class EnrollmentStatusHistoryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ENROLLMENT_STATUSES, nullable: true, type: String })
  fromStatus: string | null;
  @ApiProperty({ enum: ENROLLMENT_STATUSES }) toStatus: string;
  @ApiProperty({ format: 'date' }) effectiveOn: string;
  @ApiProperty({ type: PersonDto, nullable: true }) changedBy: PersonDto | null;
  @ApiProperty({ nullable: true, type: String }) reason: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}
