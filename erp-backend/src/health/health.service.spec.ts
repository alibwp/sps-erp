import { FixedClock } from '../common/clock/clock.js';
import {
  HEARTBEAT_FRESH_MS,
  HEARTBEAT_KEYS,
  HeartbeatService,
} from './heartbeat.service.js';
import { HealthService } from './health.service.js';

function fakeRedis(values: Record<string, string> = {}) {
  return {
    ping: vi.fn().mockResolvedValue('PONG'),
    get: vi.fn(async (key: string) => values[key] ?? null),
    set: vi.fn(async (key: string, value: string) => {
      values[key] = value;
      return 'OK';
    }),
  };
}

const NOW = new Date('2026-11-05T10:00:00Z');

function setup(
  overrides: {
    redis?: ReturnType<typeof fakeRedis>;
    query?: () => Promise<unknown>;
    writable?: () => Promise<boolean>;
  } = {},
) {
  const clock = new FixedClock(NOW);
  const fresh = new Date(NOW.getTime() - 60_000).toISOString();
  const redis =
    overrides.redis ??
    fakeRedis({
      [HEARTBEAT_KEYS.queue]: fresh,
      [HEARTBEAT_KEYS.scheduler]: fresh,
    });
  const heartbeats = new HeartbeatService(redis as never, clock);
  const service = new HealthService(
    { query: overrides.query ?? (async () => [{ '?column?': 1 }]) } as never,
    redis as never,
    { isWritable: overrides.writable ?? (async () => true) } as never,
    heartbeats,
    clock,
  );
  return { service, redis, clock };
}

describe('HealthService', () => {
  it('reports ok when every check passes, plus the fields the frontend reads', async () => {
    const report = await setup().service.report();

    expect(report).toMatchObject({
      status: 'ok',
      checks: {
        database: 'ok',
        redis: 'ok',
        queue: 'ok',
        storage: 'ok',
        scheduler: 'ok',
      },
      time: NOW.toISOString(),
      server: 'up',
      database: 'up',
    });
  });

  it('names Redis (and the heartbeats it holds) when Redis is unreachable', async () => {
    const redis = fakeRedis();
    redis.ping.mockRejectedValue(new Error("Stream isn't writeable"));
    redis.get.mockRejectedValue(new Error("Stream isn't writeable"));

    const report = await setup({ redis }).service.report();

    expect(report.status).toBe('failed');
    expect(report.checks).toEqual({
      database: 'ok',
      redis: 'failed',
      queue: 'failed',
      storage: 'ok',
      scheduler: 'failed',
    });
  });

  it('reports the database down without failing the request', async () => {
    const report = await setup({
      query: async () => Promise.reject(new Error('ECONNREFUSED')),
    }).service.report();
    expect(report.checks.database).toBe('failed');
    expect(report.database).toBe('down');
  });

  it('fails storage when it cannot be written', async () => {
    const report = await setup({
      writable: async () => Promise.reject(new Error('EACCES')),
    }).service.report();
    expect(report.checks.storage).toBe('failed');
  });

  it('fails a check that hangs instead of hanging the request', async () => {
    vi.useFakeTimers();
    try {
      const pending = setup({
        query: () => new Promise(() => undefined),
      }).service.report();
      await vi.advanceTimersByTimeAsync(2001);
      expect((await pending).checks.database).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('HeartbeatService', () => {
  it('records the time and reads it back as fresh', async () => {
    const redis = fakeRedis();
    const clock = new FixedClock(NOW);
    const heartbeats = new HeartbeatService(redis as never, clock);

    await heartbeats.record('queue');

    expect(redis.set).toHaveBeenCalledWith(
      HEARTBEAT_KEYS.queue,
      NOW.toISOString(),
    );
    expect(await heartbeats.isFresh('queue')).toBe(true);
  });

  it('is fresh for 5 minutes, then stale', async () => {
    const redis = fakeRedis({ [HEARTBEAT_KEYS.scheduler]: NOW.toISOString() });
    const clock = new FixedClock(new Date(NOW.getTime() + HEARTBEAT_FRESH_MS));
    const heartbeats = new HeartbeatService(redis as never, clock);

    expect(await heartbeats.isFresh('scheduler')).toBe(true);
    clock.set(new Date(NOW.getTime() + HEARTBEAT_FRESH_MS + 1000));
    expect(await heartbeats.isFresh('scheduler')).toBe(false);
  });

  it('treats a missing or unreadable heartbeat as stale', async () => {
    const heartbeats = new HeartbeatService(
      fakeRedis({ [HEARTBEAT_KEYS.queue]: 'garbage' }) as never,
      new FixedClock(NOW),
    );
    expect(await heartbeats.isFresh('scheduler')).toBe(false);
    expect(await heartbeats.isFresh('queue')).toBe(false);
  });
});
