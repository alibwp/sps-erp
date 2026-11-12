import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock/clock.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { StorageService } from '../storage/storage.service.js';
import { HeartbeatService } from './heartbeat.service.js';

export type CheckResult = 'ok' | 'failed';

export interface HealthChecks {
  database: CheckResult;
  redis: CheckResult;
  queue: CheckResult;
  storage: CheckResult;
  scheduler: CheckResult;
}

export interface HealthReport {
  status: 'ok' | 'failed';
  checks: HealthChecks;
  time: string;
  // Kept for the frontend's current status card.
  server: 'up';
  database: 'up' | 'down';
  uptimeSeconds: number;
}

// A hung dependency must not hang the health check.
const CHECK_TIMEOUT_MS = 2000;

// Same checks as the reference's HealthController. The answer says only
// "ok" or "failed" per check; the reason goes to the log, because this
// endpoint is open to load balancers.
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly storage: StorageService,
    private readonly heartbeats: HeartbeatService,
    private readonly clock: Clock,
  ) {}

  async report(): Promise<HealthReport> {
    const [database, redis, queue, storage, scheduler] = await Promise.all([
      this.check('database', async () => {
        await this.dataSource.query('SELECT 1');
        return true;
      }),
      this.check('redis', async () => (await this.redis.ping()) === 'PONG'),
      this.check('queue', () => this.heartbeats.isFresh('queue')),
      this.check('storage', () => this.storage.isWritable()),
      this.check('scheduler', () => this.heartbeats.isFresh('scheduler')),
    ]);
    const checks: HealthChecks = { database, redis, queue, storage, scheduler };
    const healthy = Object.values(checks).every((result) => result === 'ok');

    return {
      status: healthy ? 'ok' : 'failed',
      checks,
      time: this.clock.now().toISOString(),
      server: 'up',
      database: database === 'ok' ? 'up' : 'down',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  private async check(
    name: string,
    probe: () => Promise<boolean>,
  ): Promise<CheckResult> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('timed out')),
        CHECK_TIMEOUT_MS,
      );
    });
    try {
      if (await Promise.race([probe(), timeout])) return 'ok';
      this.logger.warn(`Health check "${name}" failed`);
    } catch (error) {
      this.logger.warn(
        `Health check "${name}" failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    return 'failed';
  }
}
