import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { ProvisionAccountDto } from '../accounts/accounts.dto.js';

export class UpdatePersonDto extends PartialType(ProvisionAccountDto) {}

export class LinkChildDto {
  @ApiProperty({
    format: 'uuid',
    description: 'An enrollment (student id) at this campus, in any state',
  })
  @IsUUID('all')
  studentId: string;
}
