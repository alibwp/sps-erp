import { ApiProperty } from '@nestjs/swagger';

const RESULT = { enum: ['ok', 'failed'] } as const;

export class HealthChecksDto {
  @ApiProperty(RESULT) database: 'ok' | 'failed';
  @ApiProperty(RESULT) redis: 'ok' | 'failed';
  @ApiProperty({
    ...RESULT,
    description: 'A queue worker took the heartbeat job in the last 5 minutes',
  })
  queue: 'ok' | 'failed';
  @ApiProperty({ ...RESULT, description: 'Files can be written' })
  storage: 'ok' | 'failed';
  @ApiProperty({
    ...RESULT,
    description: 'The scheduler recorded its heartbeat in the last 5 minutes',
  })
  scheduler: 'ok' | 'failed';
}

export class HealthResponseDto {
  @ApiProperty(RESULT) status: 'ok' | 'failed';
  @ApiProperty({ type: HealthChecksDto }) checks: HealthChecksDto;
  @ApiProperty({ format: 'date-time' }) time: string;
  @ApiProperty({ enum: ['up'], description: 'Kept for existing clients' })
  server: 'up';
  @ApiProperty({
    enum: ['up', 'down'],
    description: 'Kept for existing clients; same as checks.database',
  })
  database: 'up' | 'down';
  @ApiProperty() uptimeSeconds: number;
}
