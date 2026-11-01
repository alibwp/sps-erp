import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { corsOrigins, setupApp } from './../src/setup-app.js';

// Needs a reachable PostgreSQL at DATABASE_URL. Easiest is inside Docker:
// `docker compose exec backend npm run test:e2e` from the sps-erp folder.
describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupApp(app);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect((res) => {
        expect(res.body.message).toBe('SPS ERP backend server is active');
      });
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect((res) => {
        expect(res.body.message).toBe('SPS ERP backend server is active');
      });
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({ server: 'up', database: 'up' });
      });
  });

  // The origins come from CORS_ORIGIN, so this also holds with a custom
  // FRONTEND_PORT in Docker Compose.
  it('allows every configured frontend origin', async () => {
    for (const origin of corsOrigins(app.get(ConfigService))) {
      await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', origin)
        .expect('Access-Control-Allow-Origin', origin);
    }
  });

  it('refuses an unknown origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'https://unknown.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  afterEach(async () => {
    await app.close();
  });
});
