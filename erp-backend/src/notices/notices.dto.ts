import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { IsCalendarDay } from '../academic/academic.dto.js';
import {
  AUDIENCE_SCOPES,
  type AudienceScope,
  NOTICE_STATUSES,
  type NoticeStatus,
  RECIPIENT_STATES,
  type RecipientState,
} from './notices.constants.js';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

function IdList(description: string): PropertyDecorator {
  return (target, key) => {
    ApiPropertyOptional({ type: [String], format: 'uuid', description })(
      target,
      key,
    );
    IsOptional()(target, key);
    IsArray()(target, key);
    ArrayMaxSize(500)(target, key);
    IsUUID('all', { each: true })(target, key);
  };
}

// ---------- Requests ----------

export class NoticeAudienceDto {
  @ApiProperty({
    enum: AUDIENCE_SCOPES,
    description:
      'school: every learner and staff member here (unless people are named); class, section, offering: the learners of the chosen ones',
  })
  @IsIn(AUDIENCE_SCOPES)
  scope: AudienceScope;

  @IdList('Levels, for the class scope (with the levels below them)')
  academicLevelIds?: string[];

  @IdList('Sections, for the section scope')
  sectionIds?: string[];

  @IdList('Course offerings, for the offering scope')
  courseOfferingIds?: string[];

  @IdList('Enrollments named one by one')
  studentIds?: string[];

  @IdList('People named one by one; only members of this campus count')
  userIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Keeps only the people holding one of these roles here',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  roles?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  includeGuardians?: boolean;
}

export class CreateNoticeDto {
  @ApiProperty({ maxLength: 255 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({
    maxLength: 65000,
    description:
      'Plain text or HTML. Only p, br, hr, strong, em, s, a (http, https, mailto, a path or #), ul, ol, li, h1, h2, blockquote, pre and code are kept.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Write the message.' })
  @MaxLength(65000)
  content: string;

  @ApiProperty({ format: 'date', description: 'Shown from this day' })
  @IsCalendarDay()
  startDate: string;

  @ApiProperty({ format: 'date', description: 'Expires after this day' })
  @IsCalendarDay()
  stopDate: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @ApiProperty({ type: NoticeAudienceDto })
  @ValidateNested()
  @Type(() => NoticeAudienceDto)
  audience: NoticeAudienceDto;
}

export class UpdateNoticeDto {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ maxLength: 65000 })
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Write the message.' })
  @MaxLength(65000)
  content?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsCalendarDay()
  startDate?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsCalendarDay()
  stopDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @ApiPropertyOptional({ type: NoticeAudienceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NoticeAudienceDto)
  audience?: NoticeAudienceDto;
}

export class ScheduleNoticeDto {
  @ApiProperty({ format: 'date-time', description: 'A time after now' })
  @IsDateString(
    { strict: true },
    { message: 'The scheduled for field must be a valid date.' },
  )
  scheduledFor: string;
}

export class NoticeQueryDto {
  @ApiPropertyOptional({ enum: NOTICE_STATUSES })
  @IsOptional()
  @IsIn(NOTICE_STATUSES)
  status?: NoticeStatus;
}

export class MyNoticesQueryDto {
  @ApiPropertyOptional({ description: 'Also the ones you dismissed' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeDismissed?: boolean;
}

export class NoticePreferenceDto {
  @ApiProperty({ description: 'Notice emails from this campus' })
  @IsBoolean()
  emailEnabled: boolean;
}

// ---------- Responses ----------

export class NoticeAttachmentDto {
  @ApiProperty() name: string;
  @ApiProperty() mimeType: string;
  @ApiProperty({ description: 'Bytes' }) size: number;
}

export class NoticeDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() title: string;
  @ApiProperty({ description: 'Sanitised HTML' }) content: string;
  @ApiProperty({ enum: NOTICE_STATUSES }) status: NoticeStatus;
  @ApiProperty({ format: 'date' }) startDate: string;
  @ApiProperty({ format: 'date' }) stopDate: string;
  @ApiProperty() sendEmail: boolean;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  scheduledFor: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  publishedAt: Date | null;
  @ApiProperty() revision: number;
  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  revisionOfId: string | null;
  @ApiProperty({ type: NoticeAttachmentDto, nullable: true })
  attachment: NoticeAttachmentDto | null;
  @ApiProperty({
    type: NoticeAudienceDto,
    nullable: true,
    description: 'Only for "update notice" or "delete notice"',
  })
  audience: NoticeAudienceDto | null;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class NoticeRecipientDto {
  @ApiProperty({ format: 'uuid' }) userId: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: RECIPIENT_STATES }) state: RecipientState;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  deliveredAt: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  readAt: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  dismissedAt: Date | null;
  @ApiProperty({ nullable: true, type: String })
  failureReason: string | null;
}

export class MyNoticeDto extends NoticeDto {
  @ApiProperty({ enum: RECIPIENT_STATES }) state: RecipientState;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  readAt: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  dismissedAt: Date | null;
}
