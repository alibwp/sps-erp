import type { RedisOptions } from 'ioredis';

// Queues (the side that adds jobs) refuse a command at once while Redis is
// disconnected, instead of holding it until Redis returns: a request must
// never wait for Redis. A refused command is not kept in memory, so it is
// not sent later. This covers a queue that was connected before; addJob()
// handles one that has not connected yet, and states the remaining limit.
export function producerConnection(base: RedisOptions): RedisOptions {
  return { ...base, enableOfflineQueue: false };
}

let workerConnection: RedisOptions | undefined;

// Set by QueueModule from REDIS_URL before any worker starts.
export function setWorkerConnection(base: RedisOptions): void {
  workerConnection = base;
}

// Pass to every @Processor. Workers keep the default connection, which
// waits and reconnects while Redis is down. @nestjs/bullmq would otherwise
// give a worker its queue's (fail-fast) connection. The getter is read when
// the worker is created, after QueueModule has set the connection.
export const WORKER_OPTIONS = {
  get connection(): RedisOptions {
    if (!workerConnection) {
      throw new Error('Worker Redis connection is not configured yet');
    }
    return workerConnection;
  },
};
