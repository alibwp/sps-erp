import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { HEARTBEAT_KEYS } from '../src/health/heartbeat.service.js';
import { QUEUES } from '../src/queue/queue.module.js';
import { redisOptions } from '../src/redis/redis.module.js';
import {
  PRUNE_INVITATIONS_JOB,
  QUEUE_HEARTBEAT_JOB,
  SCHEDULED_JOBS,
} from '../src/scheduler/scheduled-jobs.js';

const JOB_IDS = SCHEDULED_JOBS.map((job) => job.id);
import { SchedulerService } from '../src/scheduler/scheduler.service.js';
import { flushTestRedis, testRedis } from './support/test-database.js';
import { createTestApp, waitFor } from './support/test-app.js';

describe('Scheduler and queue worker (e2e)', () => {
  let maintenance: Queue;
  const redis = testRedis();

  beforeAll(async () => {
    await flushTestRedis();
    maintenance = new Queue(QUEUES.maintenance, {
      connection: redisOptions(new ConfigService()),
    });
  });

  afterAll(async () => {
    await maintenance.close();
    redis.disconnect();
  });

  it('registers the heartbeat job once, however many times the app starts', async () => {
    // Two instances running at the same time, then a restart of one.
    const first = await createTestApp();
    const second = await createTestApp();
    await waitFor(async () => (await maintenance.getJobSchedulersCount()) > 0);
    await second.close();
    const restarted = await createTestApp();
    await waitFor(async () => redis.get(HEARTBEAT_KEYS.queue));

    const schedulers = await maintenance.getJobSchedulers();
    // Each listed job exactly once.
    expect(schedulers.map((s) => s.key).sort()).toEqual([...JOB_IDS].sort());
    expect(schedulers.find((s) => s.key === QUEUE_HEARTBEAT_JOB)).toMatchObject(
      {
        every: 60_000,
      },
    );
    expect(
      schedulers.find((s) => s.key === PRUNE_INVITATIONS_JOB),
    ).toMatchObject({
      pattern: '0 * * * *',
    });

    await first.close();
    await restarted.close();
  });

  it('a worker takes the heartbeat job and records the queue heartbeat', async () => {
    const app = await createTestApp();
    await waitFor(async () => (await maintenance.getJobSchedulersCount()) > 0);
    await redis.del(HEARTBEAT_KEYS.queue);

    await maintenance.add(QUEUE_HEARTBEAT_JOB, {});
    const recorded = await waitFor(async () => redis.get(HEARTBEAT_KEYS.queue));

    expect(Math.abs(Date.now() - Date.parse(recorded))).toBeLessThan(10_000);
    await app.close();
  });

  it('the scheduler records its heartbeat when the app starts', async () => {
    await redis.del(HEARTBEAT_KEYS.scheduler);
    const app = await createTestApp();

    await waitFor(async () => redis.get(HEARTBEAT_KEYS.scheduler));
    await app.close();
  });

  it('puts the heartbeat job back, exactly once, after Redis loses its data', async () => {
    const app = await createTestApp();
    expect(await maintenance.getJobSchedulersCount()).toBe(JOB_IDS.length);

    // Redis loses everything (flush, failover, new container).
    await redis.flushdb();
    expect(await maintenance.getJobSchedulersCount()).toBe(0);

    await app.get(SchedulerService).tick();

    const schedulers = await maintenance.getJobSchedulers();
    // Each listed job exactly once.
    expect(schedulers.map((s) => s.key).sort()).toEqual([...JOB_IDS].sort());
    expect(schedulers.find((s) => s.key === QUEUE_HEARTBEAT_JOB)).toMatchObject(
      {
        every: 60_000,
      },
    );
    expect(
      schedulers.find((s) => s.key === PRUNE_INVITATIONS_JOB),
    ).toMatchObject({
      pattern: '0 * * * *',
    });
    // The restored job runs and a worker records the queue heartbeat again.
    await waitFor(async () => redis.get(HEARTBEAT_KEYS.queue));

    // A further tick finds it present and leaves it alone.
    await app.get(SchedulerService).tick();
    expect(await maintenance.getJobSchedulersCount()).toBe(JOB_IDS.length);
    await app.close();
  });
});
