import { Public } from '../identity/auth/auth-context.js';
import { Controller, Get, Res, VERSION_NEUTRAL } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { HealthResponseDto } from './health.dto.js';
import { HealthReport, HealthService } from './health.service.js';

// GET /api/health (not versioned). Load balancers and uptime monitors poll
// it, so it is not rate limited.
@ApiTags('Health')
@SkipThrottle()
@Public()
@Controller({ path: 'api/health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Check the database, Redis, queue worker, storage and scheduler',
  })
  @ApiOkResponse({ type: HealthResponseDto, description: 'Every check is ok' })
  @ApiServiceUnavailableResponse({
    type: HealthResponseDto,
    description: 'At least one check failed',
  })
  async getHealth(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthReport> {
    const report = await this.health.report();
    // The 503 still carries the full report, as the reference does.
    res.status(report.status === 'ok' ? 200 : 503);
    res.setHeader('Cache-Control', 'no-store');
    return report;
  }
}
