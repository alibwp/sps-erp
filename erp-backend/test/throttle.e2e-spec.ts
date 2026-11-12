import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './support/test-app.js';

// Its own file: the limit is counted per app instance and per IP.
describe('Rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows 60 requests a minute per IP, then answers 429 in the error shape', async () => {
    for (let i = 1; i <= 60; i++) {
      await request(app.getHttpServer()).get('/api').expect(200);
    }

    const res = await request(app.getHttpServer()).get('/api').expect(429);

    expect(res.body).toEqual({
      error: {
        code: 'too_many_requests',
        message: 'Too many requests. Please wait a moment and try again.',
      },
    });
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});
