import { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import request from 'supertest';
import { HeartbeatService } from '../src/health/heartbeat.service.js';
import { REDIS_CLIENT } from '../src/redis/redis.module.js';
import { createTestApp } from './support/test-app.js';

describe('GET /api/health (e2e)', () => {
  describe('with every dependency up', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('answers 200 with every check ok once the heartbeats are recorded', async () => {
      const heartbeats = app.get(HeartbeatService);
      await heartbeats.record('scheduler');
      await heartbeats.record('queue');

      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(res.body).toMatchObject({
        status: 'ok',
        checks: {
          database: 'ok',
          redis: 'ok',
          queue: 'ok',
          storage: 'ok',
          scheduler: 'ok',
        },
        // Still read by the frontend's status card.
        server: 'up',
        database: 'up',
      });
      expect(typeof res.body.uptimeSeconds).toBe('number');
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('is not rate limited', async () => {
      for (let i = 0; i < 65; i++) {
        const res = await request(app.getHttpServer()).get('/api/health');
        expect(res.status).not.toBe(429);
      }
    });
  });

  describe('with Redis unreachable', () => {
    let app: INestApplication;
    let deadRedis: Redis;

    beforeAll(async () => {
      // Nothing listens on port 1: every command fails at once.
      deadRedis = new Redis({
        host: '127.0.0.1',
        port: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
      });
      deadRedis.on('error', () => undefined);
      app = await createTestApp({
        overrides: [{ provide: REDIS_CLIENT, useValue: deadRedis }],
      });
    });

    afterAll(async () => {
      await app.close();
      deadRedis.disconnect();
    });

    it('answers 503 naming redis, with the full report', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/health')
        .expect(503);

      expect(res.body.status).toBe('failed');
      expect(res.body.checks).toMatchObject({
        database: 'ok',
        redis: 'failed',
        storage: 'ok',
      });
      // The heartbeats live in Redis, so they cannot be confirmed either.
      expect(res.body.checks.queue).toBe('failed');
      expect(res.body.checks.scheduler).toBe('failed');
      expect(res.body.database).toBe('up');
    });
  });
});
