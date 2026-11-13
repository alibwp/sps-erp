import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateBy,
  ValidateIf,
  ValidateNested,
  type ValidationOptions,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DELEGABLE_ORGANIZATION_PERMISSIONS } from '../access/access.constants.js';
import { PaginationQueryDto } from '../common/pagination/pagination.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
// An empty optional field is stored as null, as the reference's forms do.
const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });

const present = (_object: object, value: unknown) =>
  value !== null && value !== undefined;
const sent = (_object: object, value: unknown) => value !== undefined;

// An IANA time zone such as "Africa/Lagos" or "UTC" (Laravel's
// timezone:all). Offsets like "+05:00" are not time zones.
export function isTimeZone(value: unknown): boolean {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function IsTimeZone(options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'isTimeZone',
      validator: {
        validate: (value) => isTimeZone(value),
        defaultMessage: () => 'The time zone field must be a valid time zone.',
      },
    },
    options,
  );
}

// ---------- Organizations ----------

export class CreateOrganizationDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    maxLength: 50,
    description:
      'Letters, numbers, dashes and underscores; generated when empty',
  })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message:
      'The code field must only contain letters, numbers, dashes, and underscores.',
  })
  code?: string | null;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(1000)
  address?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsEmail({}, { message: 'The email field must be a valid email address.' })
  @MaxLength(100)
  email?: string | null;

  @ApiPropertyOptional({ maxLength: 50, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(50)
  phone?: string | null;
}

// Only the fields sent change. The code cannot be cleared once set.
export class UpdateOrganizationDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @ValidateIf(sent)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @Transform(trim)
  @ValidateIf(sent)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message:
      'The code field must only contain letters, numbers, dashes, and underscores.',
  })
  code?: string;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(1000)
  address?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsEmail({}, { message: 'The email field must be a valid email address.' })
  @MaxLength(100)
  email?: string | null;

  @ApiPropertyOptional({ maxLength: 50, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(50)
  phone?: string | null;
}

export class OrganizationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() code: string;
  @ApiProperty({ nullable: true, type: String }) address: string | null;
  @ApiProperty({ nullable: true, type: String }) email: string | null;
  @ApiProperty({ nullable: true, type: String }) phone: string | null;
  @ApiProperty({
    type: [String],
    description: 'The organization permissions you hold here',
  })
  yourPermissions: string[];
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

// ---------- Campuses ----------

const PHONE = /^[0-9\s\-+()]*$/;
const PHONE_MESSAGE =
  'Use only digits, spaces, and the signs + - ( ) in the phone number.';

// The campus details form (reference EditsSchoolDetails). Only the fields
// sent change; a campus opened through the API needs the required ones.
export class UpdateCampusDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @ValidateIf(sent)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    maxLength: 10,
    nullable: true,
    type: String,
    description: 'Short name used in admission and invoice numbers',
  })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(10)
  initials?: string | null;

  @ApiPropertyOptional({
    minLength: 5,
    maxLength: 100,
    nullable: true,
    type: String,
  })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  @Matches(PHONE, { message: PHONE_MESSAGE })
  phone?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsEmail({}, { message: 'The email field must be a valid email address.' })
  @MaxLength(100)
  email?: string | null;

  @ApiPropertyOptional({ minLength: 8, maxLength: 255 })
  @Transform(trim)
  @ValidateIf(sent)
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @ValidateIf(sent)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @ValidateIf(sent)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @Transform(trim)
  @ValidateIf(sent)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @Transform(trim)
  @ValidateIf(sent)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  postalCode?: string;

  @ApiPropertyOptional({
    example: 'Africa/Lagos',
    description: 'IANA time zone',
  })
  @Transform(trim)
  @ValidateIf(sent)
  @IsTimeZone()
  timezone?: string;
}

// Opening a campus needs the full details form.
export class OpenCampusDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ maxLength: 10, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MaxLength(10)
  initials?: string | null;

  @ApiPropertyOptional({
    minLength: 5,
    maxLength: 100,
    nullable: true,
    type: String,
  })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsString()
  @MinLength(5)
  @MaxLength(100)
  @Matches(PHONE, { message: PHONE_MESSAGE })
  phone?: string | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsEmail({}, { message: 'The email field must be a valid email address.' })
  @MaxLength(100)
  email?: string | null;

  @ApiProperty({ minLength: 8, maxLength: 255 })
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  address: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiProperty({ maxLength: 30 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  postalCode: string;

  @ApiProperty({ example: 'Africa/Lagos', description: 'IANA time zone' })
  @Transform(trim)
  @IsTimeZone()
  timezone: string;
}

export class OperatingProfileDto {
  @ApiProperty({ enum: ['home_sections', 'subject_schedule', 'hybrid'] })
  preset: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: {
      academic_year: 'Academic year',
      class_level: 'Class',
      section: 'Section',
      period: 'Term',
      course: 'Subject',
      fee: 'School fees',
      homeroom_teacher: 'Class teacher',
    },
  })
  labels: Record<string, string>;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  setupCompletedAt: Date | null;
}

export class CampusDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) organizationId: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  billingGroupId: string | null;
  @ApiProperty() name: string;
  @ApiProperty() code: string;
  @ApiProperty({ nullable: true, type: String }) initials: string | null;
  @ApiProperty({ nullable: true, type: String }) address: string | null;
  @ApiProperty({ nullable: true, type: String }) city: string | null;
  @ApiProperty({ nullable: true, type: String }) state: string | null;
  @ApiProperty({ nullable: true, type: String }) postalCode: string | null;
  @ApiProperty({ nullable: true, type: String }) country: string | null;
  @ApiProperty() timezone: string;
  @ApiProperty({ nullable: true, type: String }) phone: string | null;
  @ApiProperty({ nullable: true, type: String }) email: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Signed link, valid 15 minutes',
  })
  logoUrl: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  setupDetailsCompletedAt: Date | null;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class CampusListQueryDto extends PaginationQueryDto {}

export class LabelsDto {
  @ApiProperty({ maxLength: 40 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  academic_year: string;
  @ApiProperty({ maxLength: 40 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  class_level: string;
  @ApiProperty({ maxLength: 40 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  section: string;
  @ApiProperty({ maxLength: 40 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  period: string;
  @ApiProperty({ maxLength: 40 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  course: string;
  @ApiProperty({ maxLength: 40 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  fee: string;
  @ApiProperty({ maxLength: 40 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  homeroom_teacher: string;
}

// Reference EditSchoolLanguage: a preset and every one of its words.
export class SetOperatingProfileDto {
  @ApiProperty({ enum: ['home_sections', 'subject_schedule', 'hybrid'] })
  @IsIn(['home_sections', 'subject_schedule', 'hybrid'])
  preset: string;

  @ApiProperty({ type: LabelsDto })
  @IsObject()
  @ValidateNested()
  @Type(() => LabelsDto)
  labels: LabelsDto;
}

// ---------- Billing groups ----------

export class BillingGroupDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'Campuses in the group',
  })
  schoolIds: string[];
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class CreateBillingGroupDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class PlaceCampusDto {
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'null: the campus bills on its own',
  })
  @ValidateIf((_object, value) => value !== null)
  @IsUUID('all', { message: 'The billing group id must be a UUID.' })
  billingGroupId: string | null;
}

// ---------- Organization members ----------

export class OrganizationMemberDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty({
    description: 'null permissions: every organization permission',
  })
  fullAuthority: boolean;
  @ApiProperty({ type: [String] }) permissions: string[];
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  joinedAt: Date | null;
}

export class GrantOrganizationMemberDto {
  @ApiProperty({ example: 'head@school.test' })
  @Transform(trim)
  @IsEmail({}, { message: 'The email field must be a valid email address.' })
  @MaxLength(100)
  email: string;
}

export class SetMemberPermissionsDto {
  @ApiProperty({
    type: [String],
    nullable: true,
    enum: DELEGABLE_ORGANIZATION_PERMISSIONS,
    description:
      'null: every organization permission. "read organization" is always kept.',
  })
  @ValidateIf(present)
  @IsArray()
  @ArrayMaxSize(10)
  @IsIn(DELEGABLE_ORGANIZATION_PERMISSIONS, { each: true })
  permissions: string[] | null;
}
