import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { corsOrigins } from '../src/setup-app.js';
import { ProbeController } from './support/probe.controller.js';
import { createTestApp } from './support/test-app.js';

describe('App (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('status', () => {
    it('GET / answers with the status message and a request id', async () => {
      const res = await http()
        .get('/')
        .set('X-Request-Id', 'root-1')
        .expect(200);
      expect(res.body.message).toBe('SPS ERP backend server is active');
      expect(res.headers['x-request-id']).toBe('root-1');
    });

    it('GET /api answers with the status message (not versioned)', async () => {
      const res = await http().get('/api').expect(200);
      expect(res.body.message).toBe('SPS ERP backend server is active');
    });
  });

  describe('CORS', () => {
    // The origins come from CORS_ORIGIN, so this also holds with a custom
    // FRONTEND_PORT in Docker Compose.
    it('allows every configured frontend origin and exposes the request id', async () => {
      for (const origin of corsOrigins(app.get(ConfigService))) {
        const res = await http()
          .get('/api')
          .set('Origin', origin)
          .expect('Access-Control-Allow-Origin', origin);
        expect(res.headers['access-control-expose-headers']).toContain(
          'X-Request-Id',
        );
      }
    });

    it('refuses an unknown origin', async () => {
      const res = await http()
        .get('/api')
        .set('Origin', 'https://unknown.example.com');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('error shape', () => {
    it('an unknown route answers 404 not_found', async () => {
      const res = await http().get('/api/v1/does-not-exist').expect(404);
      expect(res.body).toEqual({
        error: {
          code: 'not_found',
          message: 'Cannot GET /api/v1/does-not-exist',
        },
      });
    });

    it.each(['/foo', '/v1/test-probe/list', '/apiary', '/favicon.ico'])(
      'a path outside /api (%s) answers 404 in the error shape with a request id',
      async (path) => {
        const res = await http().get(path).expect(404);
        expect(res.headers['content-type']).toContain('application/json');
        expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
        expect(res.body).toEqual({
          error: { code: 'not_found', message: `Cannot GET ${path}` },
        });
      },
    );

    it('any method on an unknown path answers 404 in the error shape', async () => {
      const res = await http().post('/foo').send({ a: 1 }).expect(404);
      expect(res.body.error).toEqual({
        code: 'not_found',
        message: 'Cannot POST /foo',
      });
    });

    it('resources live under /api/v1, not /api', async () => {
      await http().get('/api/v1/test-probe/list').expect(200);
      await http().get('/api/test-probe/list').expect(404);
    });

    it('an invalid body answers 400 validation_failed with every field', async () => {
      const res = await http()
        .post('/api/v1/test-probe/echo')
        .send({
          email: 'not-an-email',
          seats: 0,
          address: { city: 5 },
          admin: true,
        })
        .expect(400);

      expect(res.body.error.code).toBe('validation_failed');
      expect(res.body.error.message).toBe('The given data was invalid.');
      expect(Object.keys(res.body.error.fields).sort()).toEqual([
        'address.city',
        'admin',
        'email',
        'seats',
      ]);
      expect(res.body.error.fields.admin).toEqual([
        'property admin should not exist',
      ]);
    });

    it('a missing body answers 400 with the required fields', async () => {
      const res = await http()
        .post('/api/v1/test-probe/echo')
        .send({})
        .expect(400);
      expect(Object.keys(res.body.error.fields).sort()).toEqual([
        'email',
        'seats',
      ]);
    });

    it('a valid body passes through', async () => {
      const res = await http()
        .post('/api/v1/test-probe/echo')
        .send({ email: 'head@school.test', seats: 3 })
        .expect(201);
      expect(res.body).toEqual({ email: 'head@school.test', seats: 3 });
    });

    it('malformed JSON answers 400 in the error shape', async () => {
      const res = await http()
        .post('/api/v1/test-probe/echo')
        .set('Content-Type', 'application/json')
        .send('{"email": ')
        .expect(400);
      expect(res.body.error.code).toBe('validation_failed');
    });

    it('perPage above 100 and an unknown query parameter are refused', async () => {
      const res = await http()
        .get('/api/v1/test-probe/list?perPage=101&colour=red')
        .expect(400);
      expect(Object.keys(res.body.error.fields).sort()).toEqual([
        'colour',
        'perPage',
      ]);

      const ok = await http()
        .get('/api/v1/test-probe/list?page=2&perPage=100')
        .expect(200);
      expect(ok.body).toMatchObject({ page: 2, perPage: 100 });
    });

    it('a thrown RuleViolation answers 422 rule_violation with its message', async () => {
      const res = await http()
        .get('/api/v1/test-probe/rule-violation')
        .expect(422);
      expect(res.body).toEqual({
        error: {
          code: 'rule_violation',
          message: 'The academic year is closed for changes.',
        },
      });
    });

    it('a thrown PeriodClosed answers 422 period_closed', async () => {
      const res = await http()
        .get('/api/v1/test-probe/period-closed')
        .expect(422);
      expect(res.body.error.code).toBe('period_closed');
    });

    it('an unexpected error answers 500 without internals', async () => {
      const res = await http().get('/api/v1/test-probe/crash').expect(500);
      expect(res.body.error.code).toBe('internal_error');
      expect(JSON.stringify(res.body)).not.toContain('secret');
    });
  });

  describe('request id and security headers', () => {
    it('echoes a safe X-Request-Id and makes one otherwise', async () => {
      const kept = await http().get('/api').set('X-Request-Id', 'trace-123');
      expect(kept.headers['x-request-id']).toBe('trace-123');

      const made = await http()
        .get('/api')
        .set('X-Request-Id', 'bad id with spaces');
      expect(made.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('sends helmet security headers', async () => {
      const res = await http().get('/api');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('OpenAPI', () => {
    it('serves the API reference page', async () => {
      const res = await http().get('/api/docs').expect(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('swagger');
    });

    it('declares the bearer scheme, the campus headers and the error shape', async () => {
      const res = await http().get('/api/docs/openapi.json').expect(200);
      const document = res.body;

      expect(document.info).toMatchObject({
        title: 'SPS ERP API',
        version: '1',
      });
      expect(document.components.securitySchemes.bearer).toMatchObject({
        type: 'http',
        scheme: 'bearer',
      });
      expect(document.components.parameters.SchoolId).toMatchObject({
        name: 'X-School-Id',
        in: 'header',
      });
      expect(document.components.parameters.AcademicPeriodId).toMatchObject({
        name: 'X-Academic-Period-Id',
        in: 'header',
        required: false,
      });
      expect(document.components.schemas.ErrorResponseDto).toBeDefined();
      expect(document.paths['/api/health'].get.responses).toHaveProperty('503');
      expect(
        document.paths['/api/v1/storage/files'].get.responses,
      ).toHaveProperty('404');
    });
  });
});
