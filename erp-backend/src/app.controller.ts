import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service.js';
import type { HealthStatus, ServerStatus } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // GET /api
  @Get()
  getStatus(): ServerStatus {
    return this.appService.getStatus();
  }

  // GET /api/health — 503 when the database is unreachable, so load
  // balancers and uptime monitors can detect it.
  @Get('health')
  async getHealth(): Promise<HealthStatus> {
    const health = await this.appService.getHealth();
    if (health.database === 'down') {
      throw new ServiceUnavailableException(health);
    }
    return health;
  }
}
