import { getQueueToken } from '@nestjs/bullmq';
import {
  BeforeApplicationShutdown,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Queue } from 'bullmq';
import { HeartbeatService } from '../health/heartbeat.service.js';
import { QUEUES } from '../queue/queue.module.js';
import { SCHEDULED_JOBS, ScheduledJob } from './scheduled-jobs.js';

const TICK_MS = 60_000;

// Registers the recurring jobs in Redis (BullMQ job schedulers) and records
// the scheduler heartbeat once a minute.
@Injectable()
export class SchedulerService
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(SchedulerService.name);
  private timer?: NodeJS.Timeout;
  private registered = false;
  private running: Promise<void> = Promise.resolve();
  private started: Promise<void> = Promise.resolve();

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly heartbeats: HeartbeatService,
  ) {}

  onApplicationBootstrap(): void {
    // Not awaited: an unreachable Redis must not stop the API from starting.
    // The next tick tries again.
    this.started = this.runTick();
    this.timer = setInterval(() => void this.runTick(), TICK_MS);
    this.timer.unref();
  }

  // Runs before the queues close, so a registration in progress finishes
  // instead of being cut off.
  async beforeApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  // Resolves once the first tick (registration + heartbeat) has finished.
  whenStarted(): Promise<void> {
    return this.started;
  }

  private runTick(): Promise<void> {
    this.running = this.tick();
    return this.running;
  }

  async tick(): Promise<void> {
    try {
      if (!this.registered) {
        await this.registerJobs(SCHEDULED_JOBS);
        this.registered = true;
      } else {
        // Redis can lose its data (flush, failover, new container). Put back
        // any listed job that is gone, so scheduled work does not stop until
        // the next restart.
        await this.restoreMissingJobs(SCHEDULED_JOBS);
      }
    } catch (error) {
      this.logger.error(`Could not register scheduled jobs: ${message(error)}`);
    }
    try {
      await this.heartbeats.record('scheduler');
    } catch (error) {
      this.logger.warn(
        `Could not record the scheduler heartbeat: ${message(error)}`,
      );
    }
  }

  // Upserts every job by its fixed id and removes schedulers no longer in
  // the list.
  async registerJobs(jobs: ScheduledJob[]): Promise<void> {
    for (const name of Object.values(QUEUES)) {
      const queue = this.queue(name);
      const wanted = jobs.filter((job) => job.queue === name);

      for (const job of wanted) {
        await this.upsert(queue, job);
      }

      const existing = await queue.getJobSchedulers();
      for (const scheduler of existing) {
        const id = scheduler.key;
        if (!wanted.some((job) => job.id === id)) {
          await queue.removeJobScheduler(id);
          this.logger.log(`Removed retired scheduled job ${name}:${id}`);
        }
      }
    }
  }

  // Registers only the listed jobs that are missing. An existing job is left
  // alone, so its schedule does not shift and it does not run an extra time.
  async restoreMissingJobs(jobs: ScheduledJob[]): Promise<void> {
    for (const job of jobs) {
      const queue = this.queue(job.queue);
      if (await queue.getJobScheduler(job.id)) continue;
      await this.upsert(queue, job);
      this.logger.warn(
        `Scheduled job ${job.queue}:${job.id} was missing and is registered again`,
      );
    }
  }

  private upsert(queue: Queue, job: ScheduledJob) {
    return queue.upsertJobScheduler(
      job.id,
      job.every
        ? { every: job.every }
        : { pattern: job.pattern, tz: job.tz ?? 'UTC' },
      { name: job.id },
    );
  }

  private queue(name: string): Queue {
    return this.moduleRef.get<Queue>(getQueueToken(name), { strict: false });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
