import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { HeartbeatService } from './heartbeat.service.js';

@Module({
  controllers: [HealthController],
  providers: [HealthService, HeartbeatService],
  exports: [HeartbeatService],
})
export class HealthModule {}
