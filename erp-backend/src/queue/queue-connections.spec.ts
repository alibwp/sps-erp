import { ConfigService } from '@nestjs/config';
import { ADD_JOB_TIMEOUT_MS, QueueUnavailable, addJob } from './add-job.js';
import { WORKER_OPTIONS } from './queue-connections.js';
import { bullOptions } from './queue.module.js';

describe('queue connections', () => {
  const config = new ConfigService({ REDIS_URL: 'redis://redis:6379/3' });

  it('queues fail fast while Redis is down; workers keep waiting and reconnecting', () => {
    const options = bullOptions(config);

    expect(options.connection).toMatchObject({
      host: 'redis',
      db: 3,
      enableOfflineQueue: false,
    });
    expect(WORKER_OPTIONS.connection).toMatchObject({ host: 'redis', db: 3 });
    expect(WORKER_OPTIONS.connection).not.toHaveProperty('enableOfflineQueue');
  });

  it('keeps finished jobs a day and failed jobs 14 days by default', () => {
    expect(bullOptions(config).defaultJobOptions).toMatchObject({
      removeOnComplete: { age: 86_400 },
      removeOnFail: { age: 14 * 86_400 },
    });
  });
});

describe('addJob', () => {
  // A queue that is already connected.
  const connected = (add: () => Promise<unknown>) => ({
    name: 'mail',
    waitUntilReady: vi.fn().mockResolvedValue({}),
    add: vi.fn(add),
  });

  it('returns the job id', async () => {
    const queue = connected(async () => ({ id: '7' }));
    await expect(addJob(queue as never, 'send', {})).resolves.toBe('7');
  });

  it('turns a refused add into QueueUnavailable', async () => {
    const queue = connected(async () => {
      throw new Error('Connection is closed.');
    });
    const error = await addJob(queue as never, 'send', {}).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(QueueUnavailable);
    expect((error as QueueUnavailable).cause).toEqual(
      new Error('Queue mail: Connection is closed.'),
    );
  });

  it(`gives up after ${ADD_JOB_TIMEOUT_MS} ms when Redis does not answer`, async () => {
    vi.useFakeTimers();
    try {
      const queue = connected(() => new Promise(() => undefined));
      const pending = addJob(queue as never, 'send', {}).catch(
        (e: unknown) => e,
      );

      await vi.advanceTimersByTimeAsync(ADD_JOB_TIMEOUT_MS);

      expect(await pending).toBeInstanceOf(QueueUnavailable);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never calls add() when the queue does not connect in time', async () => {
    vi.useFakeTimers();
    try {
      let connect: (value: unknown) => void = () => undefined;
      const queue = {
        name: 'mail',
        waitUntilReady: vi.fn(
          () => new Promise((resolve) => (connect = resolve)),
        ),
        add: vi.fn().mockResolvedValue({ id: '1' }),
      };
      const pending = addJob(queue as never, 'send', {}).catch(
        (e: unknown) => e,
      );

      await vi.advanceTimersByTimeAsync(ADD_JOB_TIMEOUT_MS);
      const error = await pending;
      // Redis becomes reachable after the caller was told it failed.
      connect({});
      await vi.advanceTimersByTimeAsync(10);

      expect(error).toBeInstanceOf(QueueUnavailable);
      expect((error as QueueUnavailable).cause).toEqual(
        new Error(
          `Queue mail: not connected to Redis within ${ADD_JOB_TIMEOUT_MS} ms`,
        ),
      );
      expect(queue.add).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
