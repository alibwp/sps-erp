import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { HeldRoleDto } from '../access/access.dto.js';
import { PaginationQueryDto } from '../common/pagination/pagination.js';
import { ACCOUNT_STATUSES, GENDERS } from '../identity/account-status.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });
const present = (_object: object, value: unknown) =>
  value !== null && value !== undefined;

function OptionalText(max: number): PropertyDecorator {
  return (target, key) => {
    Transform(blankToNull)(target, key);
    ValidateIf(present)(target, key);
    IsString()(target, key);
    MaxLength(max)(target, key);
  };
}

// Reference ProvisionAccount's rules. An existing person of the
// organization keeps what is already filled in; only blank fields are set.
export class ProvisionAccountDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsEmail({}, { message: 'The email field must be a valid email address.' })
  @MaxLength(100)
  email: string;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf(present)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'The birthday field must match the format Y-m-d.',
  })
  @IsISO8601(
    { strict: true },
    { message: 'The birthday field must be a valid date.' },
  )
  birthday?: string | null;

  @ApiPropertyOptional({ enum: GENDERS, nullable: true })
  @Transform(blankToNull)
  @ValidateIf(present)
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number] | null;

  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText(100)
  phone?: string | null;
  @ApiPropertyOptional({ maxLength: 255, nullable: true, type: String })
  @OptionalText(255)
  address?: string | null;
  @ApiPropertyOptional({ maxLength: 255, nullable: true, type: String })
  @OptionalText(255)
  addressLine2?: string | null;
  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText(100)
  city?: string | null;
  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText(100)
  state?: string | null;
  @ApiPropertyOptional({ maxLength: 30, nullable: true, type: String })
  @OptionalText(30)
  postalCode?: string | null;
  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText(100)
  country?: string | null;
  @ApiPropertyOptional({ maxLength: 100, nullable: true, type: String })
  @OptionalText(100)
  nationality?: string | null;
}

export class AccountListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ACCOUNT_STATUSES })
  @IsOptional()
  @IsIn(ACCOUNT_STATUSES)
  accountStatus?: (typeof ACCOUNT_STATUSES)[number];
}

export class CampusMembershipDto {
  @ApiProperty() isPrimary: boolean;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  joinedAt: Date | null;
}

export class AccountDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: ACCOUNT_STATUSES }) accountStatus: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  emailVerifiedAt: Date | null;
  @ApiProperty() twoFactorEnabled: boolean;
  @ApiProperty({ type: CampusMembershipDto }) membership: CampusMembershipDto;
  @ApiProperty({
    type: [HeldRoleDto],
    description: 'Roles held at this campus, and global roles',
  })
  roles: HeldRoleDto[];
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}

export class AccountDetailDto extends AccountDto {
  @ApiProperty({ format: 'date', nullable: true, type: String })
  birthday: string | null;
  @ApiProperty({ enum: GENDERS, nullable: true }) gender: string | null;
  @ApiProperty({ nullable: true, type: String }) phone: string | null;
  @ApiProperty({ nullable: true, type: String }) address: string | null;
  @ApiProperty({ nullable: true, type: String }) addressLine2: string | null;
  @ApiProperty({ nullable: true, type: String }) city: string | null;
  @ApiProperty({ nullable: true, type: String }) state: string | null;
  @ApiProperty({ nullable: true, type: String }) postalCode: string | null;
  @ApiProperty({ nullable: true, type: String }) country: string | null;
  @ApiProperty({ nullable: true, type: String }) nationality: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Signed link, valid 15 minutes',
  })
  profilePhotoUrl: string | null;
}

export const STATUS_ACTIONS = ['suspend', 'reinstate', 'archive'] as const;
export type StatusAction = (typeof STATUS_ACTIONS)[number];

export class StatusChangeDto {
  @ApiProperty({
    enum: STATUS_ACTIONS,
    description:
      'reinstate: back to active, or to invited when no password was ever set',
  })
  @IsIn(STATUS_ACTIONS)
  action: StatusAction;

  @ApiPropertyOptional({ maxLength: 255, nullable: true, type: String })
  @OptionalText(255)
  reason?: string | null;
}

export class AssignRoleDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all', { message: 'The role id must be a UUID.' })
  roleId: string;
}

export class HeldRolesDto {
  @ApiProperty({ type: [HeldRoleDto] }) roles: HeldRoleDto[];
}

export class InvitationSentDto {
  @ApiProperty({ format: 'date-time' }) expiresAt: Date;
}

export const INVITATION_STATUSES = [
  'pending',
  'accepted',
  'expired',
  'revoked',
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export class InvitationListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: INVITATION_STATUSES })
  @IsOptional()
  @IsIn(INVITATION_STATUSES)
  status?: InvitationStatus;
}

class InvitationPersonDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
}

class InviterDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class AccountInvitationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({
    enum: INVITATION_STATUSES,
    description:
      'Accepted wins over revoked, and revoked over expired. Expired links are marked revoked by the hourly clean-up.',
  })
  status: InvitationStatus;
  @ApiProperty({ type: InvitationPersonDto }) user: InvitationPersonDto;
  @ApiProperty({ type: InviterDto, nullable: true })
  invitedBy: InviterDto | null;
  @ApiProperty({ format: 'date-time' }) expiresAt: Date;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  acceptedAt: Date | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  revokedAt: Date | null;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}
