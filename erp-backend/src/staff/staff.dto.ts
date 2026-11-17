import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDay } from '../academic/academic.dto.js';
import { PaginationQueryDto } from '../common/pagination/pagination.js';
import { PersonDto } from '../curriculum/curriculum.dto.js';
import { OptionalReason } from '../enrollments/students.dto.js';
import {
  EMPLOYMENT_TYPES,
  type EmploymentType,
  LEAVE_STATUSES,
  LEAVE_TYPES,
  type LeaveStatus,
  type LeaveType,
  STAFF_STATUSES,
  type StaffStatus,
} from './staff.constants.js';

const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : value;
const present = (_object: object, value: unknown) =>
  value !== null && value !== undefined;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

// A short optional text that may be cleared with null or "".
function OptionalText(max: number): PropertyDecorator {
  return (target, key) => {
    Transform(blankToNull)(target, key);
    ValidateIf(present)(target, key);
    IsString()(target, key);
    MaxLength(max)(target, key);
  };
}

// ---------- Requests ----------

export class StaffProfileQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: STAFF_STATUSES })
  @IsOptional()
  @IsIn(STAFF_STATUSES)
  status?: StaffStatus;
}

export class CreateStaffProfileDto {
  @ApiProperty({ format: 'uuid', description: 'A member of this campus' })
  @IsUUID('all')
  userId: string;

  @ApiPropertyOptional({ maxLength: 30, nullable: true, type: String })
  @OptionalText(30)
  staffNumber?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText(100)
  jobTitle?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText(100)
  department?: string | null;

  @ApiProperty({ enum: EMPLOYMENT_TYPES })
  @IsIn(EMPLOYMENT_TYPES)
  employmentType: EmploymentType;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  @IsOptional()
  @IsCalendarDay()
  joinedOn?: string | null;
}

export class UpdateStaffProfileDto {
  @ApiPropertyOptional({ maxLength: 30, nullable: true, type: String })
  @OptionalText(30)
  staffNumber?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText(100)
  jobTitle?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText(100)
  department?: string | null;

  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPES })
  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({
    enum: STAFF_STATUSES,
    description: '"left" records the last working day (leftOn, or today)',
  })
  @IsOptional()
  @IsIn(STAFF_STATUSES)
  status?: StaffStatus;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  @IsOptional()
  @ValidateIf(present)
  @IsCalendarDay()
  joinedOn?: string | null;

  @ApiPropertyOptional({
    format: 'date',
    nullable: true,
    type: String,
    description: 'The last working day, when the status is "left"',
  })
  @IsOptional()
  @ValidateIf(present)
  @IsCalendarDay()
  leftOn?: string | null;
}

export class CredentialInputDto {
  @ApiProperty({ maxLength: 50, example: 'teaching licence' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  type: string;

  @ApiProperty({ maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiPropertyOptional({ maxLength: 150, nullable: true, type: String })
  @OptionalText(150)
  issuer?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText(100)
  reference?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  @IsOptional()
  @ValidateIf(present)
  @IsCalendarDay()
  issuedOn?: string | null;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  @IsOptional()
  @ValidateIf(present)
  @IsCalendarDay()
  expiresOn?: string | null;
}

export class HoursInputDto {
  @ApiProperty({ minimum: 1, maximum: 7, description: '1 Monday … 7 Sunday' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek: number;

  @ApiProperty({ example: '08:00' })
  @Matches(HH_MM, { message: 'The starts at field must match the format H:i.' })
  startsAt: string;

  @ApiProperty({ example: '13:00' })
  @Matches(HH_MM, { message: 'The ends at field must match the format H:i.' })
  endsAt: string;
}

// ---------- Responses ----------

export class StaffProfileDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty({ nullable: true, type: String }) staffNumber: string | null;
  @ApiProperty({ nullable: true, type: String }) jobTitle: string | null;
  @ApiProperty({ nullable: true, type: String }) department: string | null;
  @ApiProperty({ enum: EMPLOYMENT_TYPES }) employmentType: EmploymentType;
  @ApiProperty({ enum: STAFF_STATUSES }) status: StaffStatus;
  @ApiProperty({ format: 'date', nullable: true, type: String })
  joinedOn: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String })
  leftOn: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class StaffCredentialDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() type: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String }) issuer: string | null;
  @ApiProperty({ nullable: true, type: String }) reference: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String })
  issuedOn: string | null;
  @ApiProperty({ format: 'date', nullable: true, type: String })
  expiresOn: string | null;
  @ApiProperty({ description: 'The expiry day is before campus today' })
  expired: boolean;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  verifiedAt: Date | null;
  @ApiProperty({ type: PersonDto, nullable: true })
  verifiedBy: PersonDto | null;
}

export class StaffHoursDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ description: '1 Monday … 7 Sunday' }) dayOfWeek: number;
  @ApiProperty({ example: '08:00' }) startsAt: string;
  @ApiProperty({ example: '13:00' }) endsAt: string;
}

export class StaffProfileDetailDto extends StaffProfileDto {
  @ApiProperty({ type: [StaffCredentialDto] })
  credentials: StaffCredentialDto[];
  @ApiProperty({ type: [StaffHoursDto] }) availability: StaffHoursDto[];
}
