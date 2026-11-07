import {
  Global,
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis, type RedisOptions } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

// Connection settings from REDIS_URL (redis://[user:password@]host:port[/db];
// rediss:// for TLS, as AWS ElastiCache with encryption in transit needs).
export function redisOptions(config: ConfigService): RedisOptions {
  const url = new URL(
    config.get<string>('REDIS_URL', 'redis://localhost:6379'),
  );
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  if (!Number.isInteger(db) || db < 0) {
    throw new Error(
      `REDIS_URL has an invalid database number: ${url.pathname}`,
    );
  }
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    db,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}

// The app's own Redis client (heartbeats, health). Commands fail at once
// while Redis is unreachable instead of waiting in a queue, so the health
// check can report it.
export function createRedisClient(config: ConfigService): Redis {
  const logger = new Logger('Redis');
  const client = new Redis({
    ...redisOptions(config),
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    // Every attempt starts with a DNS lookup; 0.5 s, 1 s, ... up to 5 s
    // keeps an outage from flooding Node's worker threads while still
    // noticing quickly when Redis is back.
    retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
  });
  let lastError = '';
  client.on('error', (error: Error) => {
    // Log each distinct failure once instead of on every reconnect attempt.
    if (error.message !== lastError) {
      lastError = error.message;
      logger.warn(`Redis connection error: ${error.message}`);
    }
  });
  client.on('ready', () => {
    lastError = '';
  });
  return client;
}

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    this.client.disconnect();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: createRedisClient,
    },
    RedisShutdown,
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
