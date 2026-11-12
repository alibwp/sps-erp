import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { redisOptions } from '../redis/redis.module.js';
import {
  producerConnection,
  setWorkerConnection,
} from './queue-connections.js';
import { queueErrorListener } from './queue-errors.js';

// The background queues. Later stages add their workers to these.
export const QUEUES = {
  mail: 'mail',
  notices: 'notices',
  reports: 'reports',
  imports: 'imports',
  maintenance: 'maintenance',
} as const;

const DAY_SECONDS = 24 * 60 * 60;

// Queues get the fail-fast connection; workers get the waiting one through
// WORKER_OPTIONS (queue-connections.ts).
export function bullOptions(config: ConfigService) {
  const connection = redisOptions(config);
  setWorkerConnection(connection);
  return {
    connection: producerConnection(connection),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      // Finished jobs are kept a day for inspection; failed ones 14 days.
      // Mail overrides this and drops a job as soon as it is sent.
      removeOnComplete: { age: DAY_SECONDS, count: 1000 },
      removeOnFail: { age: 14 * DAY_SECONDS },
    },
  };
}

@Injectable()
class QueueErrorLogging implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  onModuleInit(): void {
    for (const name of Object.values(QUEUES)) {
      const queue = this.moduleRef.get<Queue>(getQueueToken(name), {
        strict: false,
      });
      queue.on('error', queueErrorListener(`Queue ${name}`));
    }
  }
}

@Global()
@Module({
  providers: [QueueErrorLogging],
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: bullOptions,
    }),
    BullModule.registerQueue(
      ...Object.values(QUEUES).map((name) => ({ name })),
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
