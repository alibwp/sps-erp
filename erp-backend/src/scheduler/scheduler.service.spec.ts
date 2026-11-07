import { getQueueToken } from '@nestjs/bullmq';
import { QUEUES } from '../queue/queue.module.js';
import { MaintenanceProcessor } from './maintenance.processor.js';
import {
  PRUNE_INVITATIONS_JOB,
  QUEUE_HEARTBEAT_JOB,
  SCHEDULED_JOBS,
} from './scheduled-jobs.js';
import { SchedulerService } from './scheduler.service.js';

// Queues that remember which schedulers exist, like Redis does.
function fakeQueues(existing: Record<string, string[]> = {}) {
  const queues = new Map(
    Object.values(QUEUES).map((name) => {
      const ids = new Set(existing[name] ?? []);
      return [
        name,
        {
          ids,
          upsertJobScheduler: vi.fn(async (id: string) => {
            ids.add(id);
          }),
          getJobScheduler: vi.fn(async (id: string) =>
            ids.has(id) ? { key: id, name: id } : undefined,
          ),
          getJobSchedulers: vi.fn(async () =>
            [...ids].map((key) => ({ key, name: key })),
          ),
          removeJobScheduler: vi.fn(async (id: string) => ids.delete(id)),
        },
      ];
    }),
  );
  const moduleRef = {
    get: (token: string) => {
      const name = [...queues.keys()].find(
        (queue) => getQueueToken(queue) === token,
      );
      return queues.get(name as never);
    },
  };
  return { queues, moduleRef };
}

// Every listed job lives on the maintenance queue.
const JOB_IDS = SCHEDULED_JOBS.map((job) => job.id);
const JOB_COUNT = JOB_IDS.length;

describe('SchedulerService', () => {
  it('registers the heartbeat job by its fixed id, once a minute', async () => {
    const { queues, moduleRef } = fakeQueues();
    const service = new SchedulerService(
      moduleRef as never,
      { record: vi.fn() } as never,
    );

    await service.registerJobs(SCHEDULED_JOBS);

    expect(
      queues.get(QUEUES.maintenance)?.upsertJobScheduler,
    ).toHaveBeenCalledWith(
      QUEUE_HEARTBEAT_JOB,
      { every: 60_000 },
      { name: QUEUE_HEARTBEAT_JOB },
    );
    expect(queues.get(QUEUES.mail)?.upsertJobScheduler).not.toHaveBeenCalled();
  });

  it('registers the invitation prune hourly by its fixed id', async () => {
    const { queues, moduleRef } = fakeQueues();
    const service = new SchedulerService(
      moduleRef as never,
      { record: vi.fn() } as never,
    );

    await service.registerJobs(SCHEDULED_JOBS);

    expect(
      queues.get(QUEUES.maintenance)?.upsertJobScheduler,
    ).toHaveBeenCalledWith(
      PRUNE_INVITATIONS_JOB,
      { pattern: '0 * * * *', tz: 'UTC' },
      { name: PRUNE_INVITATIONS_JOB },
    );
  });

  it('registers cron jobs in UTC unless a time zone is given', async () => {
    const { queues, moduleRef } = fakeQueues();
    const service = new SchedulerService(
      moduleRef as never,
      { record: vi.fn() } as never,
    );

    await service.registerJobs([
      { id: 'prune', queue: QUEUES.maintenance, pattern: '0 3 * * *' },
    ]);

    expect(
      queues.get(QUEUES.maintenance)?.upsertJobScheduler,
    ).toHaveBeenCalledWith(
      'prune',
      { pattern: '0 3 * * *', tz: 'UTC' },
      { name: 'prune' },
    );
  });

  it('removes schedulers that are no longer listed', async () => {
    const { queues, moduleRef } = fakeQueues({
      [QUEUES.maintenance]: [QUEUE_HEARTBEAT_JOB, 'old-job'],
    });
    const service = new SchedulerService(
      moduleRef as never,
      { record: vi.fn() } as never,
    );

    await service.registerJobs(SCHEDULED_JOBS);

    const maintenance = queues.get(QUEUES.maintenance);
    expect(maintenance?.removeJobScheduler).toHaveBeenCalledTimes(1);
    expect(maintenance?.removeJobScheduler).toHaveBeenCalledWith('old-job');
  });

  it('each tick records the scheduler heartbeat and registers until it succeeds', async () => {
    const { queues, moduleRef } = fakeQueues();
    const upsert = queues.get(QUEUES.maintenance)!.upsertJobScheduler;
    upsert.mockRejectedValueOnce(new Error('Redis down'));
    const heartbeats = { record: vi.fn().mockResolvedValue(undefined) };
    const service = new SchedulerService(
      moduleRef as never,
      heartbeats as never,
    );

    await service.tick(); // registration fails, heartbeat still written
    await service.tick(); // registration succeeds
    await service.tick(); // nothing left to register

    expect(upsert).toHaveBeenCalledTimes(1 + JOB_COUNT);
    expect(heartbeats.record).toHaveBeenCalledTimes(3);
    expect(heartbeats.record).toHaveBeenCalledWith('scheduler');
  });

  it('a later tick puts back a job that disappeared from Redis, exactly once', async () => {
    const { queues, moduleRef } = fakeQueues();
    const maintenance = queues.get(QUEUES.maintenance)!;
    const service = new SchedulerService(
      moduleRef as never,
      {
        record: vi.fn().mockResolvedValue(undefined),
      } as never,
    );

    await service.tick(); // first registration
    maintenance.ids.clear(); // Redis lost its data
    await service.tick(); // put back
    await service.tick(); // present: left alone

    expect(maintenance.upsertJobScheduler).toHaveBeenCalledTimes(2 * JOB_COUNT);
    expect([...maintenance.ids].sort()).toEqual([...JOB_IDS].sort());
  });

  it('a later tick leaves present jobs alone', async () => {
    const { queues, moduleRef } = fakeQueues();
    const maintenance = queues.get(QUEUES.maintenance)!;
    const service = new SchedulerService(
      moduleRef as never,
      {
        record: vi.fn().mockResolvedValue(undefined),
      } as never,
    );

    await service.tick();
    await service.tick();
    await service.tick();

    expect(maintenance.upsertJobScheduler).toHaveBeenCalledTimes(JOB_COUNT);
    expect(maintenance.getJobScheduler).toHaveBeenCalledTimes(2 * JOB_COUNT);
  });

  it('a failed heartbeat write does not throw', async () => {
    const { moduleRef } = fakeQueues();
    const service = new SchedulerService(
      moduleRef as never,
      {
        record: vi.fn().mockRejectedValue(new Error('Redis down')),
      } as never,
    );
    await expect(service.tick()).resolves.toBeUndefined();
  });
});

describe('MaintenanceProcessor', () => {
  const identity = { pruneExpired: vi.fn().mockResolvedValue({}) };

  it('records the queue heartbeat when a worker takes the heartbeat job', async () => {
    const heartbeats = { record: vi.fn().mockResolvedValue(undefined) };
    await new MaintenanceProcessor(
      heartbeats as never,
      identity as never,
    ).process({
      name: QUEUE_HEARTBEAT_JOB,
    } as never);
    expect(heartbeats.record).toHaveBeenCalledWith('queue');
  });

  it('ignores unknown jobs', async () => {
    const heartbeats = { record: vi.fn() };
    await new MaintenanceProcessor(
      heartbeats as never,
      identity as never,
    ).process({
      name: 'other',
    } as never);
    expect(heartbeats.record).not.toHaveBeenCalled();
  });

  it('runs the hourly identity clean-up', async () => {
    await new MaintenanceProcessor(
      { record: vi.fn() } as never,
      identity as never,
    ).process({
      name: PRUNE_INVITATIONS_JOB,
    } as never);
    expect(identity.pruneExpired).toHaveBeenCalledOnce();
  });
});
