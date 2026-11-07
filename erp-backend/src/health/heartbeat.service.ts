import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Clock } from '../common/clock/clock.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';

// Same keys and freshness window as the reference's HealthController.
export const HEARTBEAT_KEYS = {
  scheduler: 'health:scheduler-last-run',
  queue: 'health:queue-last-run',
} as const;

export type Heartbeat = keyof typeof HEARTBEAT_KEYS;

export const HEARTBEAT_FRESH_MS = 5 * 60 * 1000;

@Injectable()
export class HeartbeatService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly clock: Clock,
  ) {}

  async record(heartbeat: Heartbeat): Promise<void> {
    await this.redis.set(
      HEARTBEAT_KEYS[heartbeat],
      this.clock.now().toISOString(),
    );
  }

  // A missing heartbeat counts as stale: the scheduler or worker never
  // started, which is as broken as having stopped.
  async isFresh(heartbeat: Heartbeat): Promise<boolean> {
    const value = await this.redis.get(HEARTBEAT_KEYS[heartbeat]);
    if (!value) return false;
    const age = Math.abs(this.clock.now().getTime() - Date.parse(value));
    return age <= HEARTBEAT_FRESH_MS;
  }
}
