import { Public } from '../../src/identity/auth/auth-context.js';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  PeriodClosed,
  RuleViolation,
} from '../../src/common/errors/api-exception.js';
import { PaginationQueryDto } from '../../src/common/pagination/pagination.js';

class ProbeAddressDto {
  @IsString()
  city: string;
}

export class ProbeBodyDto {
  @IsEmail()
  email: string;

  @IsInt()
  @Min(1)
  seats: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => ProbeAddressDto)
  address?: ProbeAddressDto;
}

// Routes that exist only in e2e tests, to exercise the global validation
// pipe and error filter. Stage 0 has no business endpoint that takes input.
@Public()
@Controller('test-probe')
export class ProbeController {
  @Post('echo')
  echo(@Body() body: ProbeBodyDto): ProbeBodyDto {
    return body;
  }

  @Get('list')
  list(@Query() query: PaginationQueryDto): PaginationQueryDto {
    return query;
  }

  @Get('rule-violation')
  ruleViolation(): never {
    throw new RuleViolation('The academic year is closed for changes.');
  }

  @Get('period-closed')
  periodClosed(): never {
    throw new PeriodClosed('This academic period is closed.');
  }

  @Get('crash')
  crash(): never {
    throw new Error('connection string postgresql://sps:secret@db');
  }
}
