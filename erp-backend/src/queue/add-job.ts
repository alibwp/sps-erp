import { HttpStatus } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import { ApiException } from '../common/errors/api-exception.js';

// Longest a request waits for Redis to accept a job.
export const ADD_JOB_TIMEOUT_MS = 1500;

// 503: the job was not queued. Thrown from an after-commit step it is only
// logged; the committed data stays.
export class QueueUnavailable extends ApiException {
  constructor(queue: string, reason: string) {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      'service_unavailable',
      'Background work is unavailable right now. Please try again shortly.',
    );
    this.cause = new Error(`Queue ${queue}: ${reason}`);
  }
}

// Adds a job or fails within ADD_JOB_TIMEOUT_MS.
//
// The queue must be connected before add() is called: a queue that has not
// connected yet would hold the add and send it once Redis is reachable, so
// a job reported as failed would still run. Waiting for the connection and
// the add share one time limit. Once connected, the queue refuses at once
// while Redis is down (see producerConnection).
//
// Known limit: if Redis takes the command but answers after the time limit,
// the job can still be added although this reported a failure.
export async function addJob<T>(
  queue: Queue,
  name: string,
  data: T,
  options?: JobsOptions,
): Promise<string | undefined> {
  let waitingFor = 'not connected to Redis';
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new QueueUnavailable(
            queue.name,
            `${waitingFor} within ${ADD_JOB_TIMEOUT_MS} ms`,
          ),
        ),
      ADD_JOB_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([queue.waitUntilReady(), timeout]);
    waitingFor = 'no answer';
    const job = await Promise.race([queue.add(name, data, options), timeout]);
    return job.id;
  } catch (error) {
    if (error instanceof QueueUnavailable) throw error;
    throw new QueueUnavailable(
      queue.name,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timer);
  }
}
