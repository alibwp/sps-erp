import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/setup-app.js';

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

  it('allows the frontend on both localhost and 127.0.0.1', async () => {
    for (const origin of ['http://localhost:3000', 'http://127.0.0.1:3000']) {
      await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', origin)
        .expect('Access-Control-Allow-Origin', origin);
    }
  });

  afterEach(async () => {
    await app.close();
  });
});
