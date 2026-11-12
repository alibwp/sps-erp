import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The Redis database e2e tests use. Never 0, which development uses.
const TEST_REDIS_DB = '15';

// The frontend address in e2e runs: links in emails point here, and it is
// the one allowed CORS origin, so tests do not depend on the CORS_ORIGIN or
// FRONTEND_PORT of the machine running them.
export const TEST_FRONTEND_ORIGIN = 'http://frontend.test';

// Settings for e2e runs. The database is DATABASE_URL's with "_test" added
// (sps_erp -> sps_erp_test) unless TEST_DATABASE_URL names one; Redis is
// database 15 of REDIS_URL unless TEST_REDIS_URL names one. A database
// whose name does not end in "_test" is refused, so tests never touch
// development data.
export function testEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const database = new URL(
    env.TEST_DATABASE_URL ??
      env.DATABASE_URL ??
      'postgresql://sps:sps_password@localhost:5433/sps_erp',
  );
  const name = database.pathname.slice(1);
  if (!env.TEST_DATABASE_URL && !name.endsWith('_test'))
    database.pathname = `/${name}_test`;
  if (!database.pathname.endsWith('_test')) {
    throw new Error(
      `Refusing to run e2e tests on "${database.pathname.slice(1)}": the name must end in _test`,
    );
  }

  const redis = new URL(
    env.TEST_REDIS_URL ?? env.REDIS_URL ?? 'redis://localhost:6379',
  );
  if (!env.TEST_REDIS_URL) redis.pathname = `/${TEST_REDIS_DB}`;
  if (['', '/', '/0'].includes(redis.pathname)) {
    throw new Error('Refusing to run e2e tests on Redis database 0');
  }

  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: database.toString(),
    DB_SYNCHRONIZE: 'false',
    REDIS_URL: redis.toString(),
    STORAGE_DRIVER: 'local',
    STORAGE_LOCAL_ROOT: join(tmpdir(), 'sps-erp-e2e-storage'),
    STORAGE_SIGNING_SECRET: 'e2e-signing-secret',
    APP_URL: 'http://localhost:5000',
    // Nothing listens here: a test that sends mail swaps in a fake transport.
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '2',
    OPENAPI_ENABLED: 'true',
    JWT_SECRET: 'e2e-jwt-secret-at-least-thirty-two-characters',
    APP_KEY: `base64:${Buffer.alloc(32, 42).toString('base64')}`,
    FRONTEND_URL: TEST_FRONTEND_ORIGIN,
    CORS_ORIGIN: TEST_FRONTEND_ORIGIN,
    CHECK_EMAIL_DOMAINS: 'false',
    // Tests give each client its own X-Forwarded-For address (support/identity.ts).
    TRUST_PROXY: '1',
  };
}

export function applyTestEnvironment(): void {
  Object.assign(process.env, testEnvironment());
}
