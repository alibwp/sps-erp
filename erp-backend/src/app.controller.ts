import { Public } from './identity/auth/auth-context.js';
import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import type { ServerStatus } from './app.service.js';

@ApiTags('Health')
@Public()
@Controller({ version: VERSION_NEUTRAL })
export class AppController {
  constructor(private readonly appService: AppService) {}

  // GET / and GET /api. The health check is HealthController (/api/health).
  @Get(['/', 'api'])
  @ApiOperation({ summary: 'Server status message' })
  @ApiOkResponse({ description: 'The server is running' })
  getStatus(): ServerStatus {
    return this.appService.getStatus();
  }
}
