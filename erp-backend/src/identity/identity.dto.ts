import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateBy,
  ValidateIf,
  type ValidationOptions,
} from 'class-validator';
import { ACCOUNT_STATUSES, GENDERS } from './account-status.js';

// Laravel's `confirmed` rule: the field must equal another field.
export function MatchesField(other: string, options?: ValidationOptions) {
  return ValidateBy(
    {
      name: 'matchesField',
      constraints: [other],
      validator: {
        validate: (value, args) => {
          const object = args?.object as Record<string, unknown> | undefined;
          return object !== undefined && value === object[other];
        },
        defaultMessage: () => `The ${other} field confirmation does not match.`,
      },
    },
    options,
  );
}

// Fortify's password rule: at least 8 characters, confirmed.
export class NewPasswordDto {
  @ApiProperty({ minLength: 8, format: 'password' })
  @IsString()
  @MinLength(8, {
    message: 'The password field must be at least 8 characters.',
  })
  password: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @MatchesField('password')
  passwordConfirmation: string;
}

// ---------- Sign-in ----------

export class LoginDto {
  @ApiProperty({ example: 'head@school.test' })
  @IsEmail()
  @MaxLength(100)
  email: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class AccessTokenDto {
  @ApiProperty() accessToken: string;
  @ApiProperty({ enum: ['Bearer'] }) tokenType: 'Bearer';
  @ApiProperty({
    example: 900,
    description: 'Seconds until the access token expires',
  })
  expiresIn: number;
}

export class TwoFactorRequiredDto {
  @ApiProperty({ enum: [true] }) twoFactorRequired: true;
  @ApiProperty({ description: 'Single use, valid 5 minutes' })
  challengeToken: string;
}

export class TwoFactorChallengeDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  challengeToken: string;

  @ApiPropertyOptional({
    description: 'Six-digit code from the authenticator app',
    example: '123456',
  })
  @ValidateIf((o: TwoFactorChallengeDto) => o.recoveryCode === undefined)
  @IsString()
  @IsNotEmpty({
    message: 'Enter the code from your authenticator app or a recovery code.',
  })
  code?: string;

  @ApiPropertyOptional({
    description: 'An unused recovery code, instead of a code',
  })
  @ValidateIf((o: TwoFactorChallengeDto) => o.code === undefined)
  @IsString()
  @IsNotEmpty({
    message: 'Enter the code from your authenticator app or a recovery code.',
  })
  recoveryCode?: string;
}

export class ConfirmPasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(100)
  email: string;
}

export class ResetPasswordDto extends NewPasswordDto {
  @ApiProperty({ description: 'From the reset link' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class VerifyEmailDto {
  @ApiProperty({ description: 'From the verification link' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class SessionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ nullable: true, type: String }) userAgent: string | null;
  @ApiProperty({ nullable: true, type: String }) ipAddress: string | null;
  @ApiProperty({ format: 'date-time' }) lastUsedAt: Date;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
  @ApiProperty({ description: 'The session making this request' })
  current: boolean;
}

export class RevokedSessionsDto {
  @ApiProperty() revoked: number;
}

// ---------- Two-factor ----------

export class TwoFactorStatusDto {
  @ApiProperty() enabled: boolean;
  @ApiProperty({ description: 'Sign-in asks for a code only once confirmed' })
  confirmed: boolean;
  @ApiProperty() recoveryCodesRemaining: number;
}

export class TwoFactorSetupDto {
  @ApiProperty({ description: 'Base32 secret; shown only now' }) secret: string;
  @ApiProperty({ description: 'otpauth:// URL for a QR code; shown only now' })
  otpauthUrl: string;
  @ApiProperty({ type: [String], description: 'Shown only now' })
  recoveryCodes: string[];
}

export class RecoveryCodesDto {
  @ApiProperty({ type: [String], description: 'Shown only now' })
  recoveryCodes: string[];
}

export class TwoFactorCodeDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  code: string;
}

// ---------- Invitations ----------

export class InvitationDto {
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty({ format: 'date-time' }) expiresAt: Date;
}

export class AcceptInvitationDto extends NewPasswordDto {}

// ---------- Own profile ----------

const optionalText = (max: number) => [
  IsOptional(),
  IsString(),
  MaxLength(max),
];
function OptionalText(max: number): PropertyDecorator {
  return (target, key) =>
    optionalText(max).forEach((decorator) => decorator(target, key));
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf((o: UpdateProfileDto) => o.name !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'A new address must be verified again',
  })
  @ValidateIf((o: UpdateProfileDto) => o.email !== undefined)
  @IsEmail({}, { message: 'The email field must be a valid email address.' })
  @MaxLength(100)
  email?: string;

  @ApiPropertyOptional({ format: 'date', nullable: true, type: String })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'The birthday field must match the format Y-m-d.',
  })
  @IsISO8601(
    { strict: true },
    { message: 'The birthday field must be a valid date.' },
  )
  birthday?: string | null;

  @ApiPropertyOptional({ enum: GENDERS, nullable: true })
  @IsOptional()
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

export class ChangePasswordDto extends NewPasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;
}

export class MeDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  emailVerifiedAt: Date | null;
  @ApiProperty({ enum: ACCOUNT_STATUSES }) accountStatus: string;
  @ApiProperty() passwordChangeRequired: boolean;
  @ApiProperty() twoFactorEnabled: boolean;
  @ApiProperty({ format: 'date', nullable: true, type: String }) birthday:
    string | null;
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
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}
