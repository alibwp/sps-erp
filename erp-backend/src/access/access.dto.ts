import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../common/pagination/pagination.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const blankToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });

export class RoleDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty({
    description:
      'A shared role every campus can give out; changing it gives the campus its own copy',
  })
  shared: boolean;
  @ApiProperty({
    description: 'Built into the application: can be given out, never changed',
  })
  builtIn: boolean;
  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  archivedAt: Date | null;
  @ApiProperty({ type: [String] }) permissions: string[];
  @ApiProperty({ description: 'People holding the role at this campus' })
  holders: number;
}

export class RoleHolderDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() email: string;
}

export class RoleDetailDto extends RoleDto {
  @ApiProperty({ type: [RoleHolderDto] }) people: RoleHolderDto[];
}

export class RoleListDto {
  @ApiProperty({ type: [RoleDto] }) data: RoleDto[];
  @ApiProperty({
    example: { page: 1, perPage: 20, total: 8 },
  })
  meta: { page: number; perPage: number; total: number };
}

export class RoleListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'true: archived roles only; false: offered roles only',
  })
  @IsOptional()
  @IsIn(['true', 'false'])
  archived?: 'true' | 'false';
}

export class GrantablePermissionsDto {
  @ApiProperty({
    type: [String],
    description: 'What you may put in a role at this campus',
  })
  permissions: string[];
}

class RolePermissionsInput {
  @ApiProperty({ type: [String], example: ['read student', 'take attendance'] })
  @IsArray()
  @ArrayMaxSize(300)
  @IsString({ each: true })
  permissions: string[];

  @ApiPropertyOptional({ maxLength: 255, nullable: true, type: String })
  @Transform(blankToNull)
  @ValidateIf((_o, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(255)
  description?: string | null;
}

export class CreateRoleDto extends RolePermissionsInput {
  @ApiProperty({ maxLength: 100, example: 'Registrar' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class UpdateRoleDto extends RolePermissionsInput {}

export class CopyRoleDto {
  @ApiProperty({ maxLength: 100, example: 'Senior teacher' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class HeldRoleDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ description: 'A global role, held at every campus' })
  global: boolean;
}

export class MyPermissionsDto {
  @ApiProperty({ format: 'uuid' }) schoolId: string;
  @ApiProperty({ type: [HeldRoleDto] }) roles: HeldRoleDto[];
  @ApiProperty({
    type: [String],
    description:
      'Everything you may do at this campus, including the menu-* and header-* names the frontend uses for navigation',
  })
  permissions: string[];
}
