import { ConfigService } from '@nestjs/config';
import { redisOptions } from './redis.module.js';

const optionsFor = (url?: string) =>
  redisOptions(new ConfigService(url ? { REDIS_URL: url } : {}));

describe('redisOptions', () => {
  it('reads host, port and database from REDIS_URL', () => {
    expect(optionsFor('redis://redis:6379/15')).toMatchObject({
      host: 'redis',
      port: 6379,
      db: 15,
    });
  });

  it('defaults to localhost:6379 database 0', () => {
    // ConfigService falls back to process.env, which Docker Compose fills.
    const saved = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      expect(optionsFor()).toMatchObject({
        host: 'localhost',
        port: 6379,
        db: 0,
        tls: undefined,
      });
    } finally {
      if (saved !== undefined) process.env.REDIS_URL = saved;
    }
  });

  it('reads credentials and turns on TLS for rediss://', () => {
    expect(
      optionsFor('rediss://default:p%40ss@cache.example.com:6380'),
    ).toMatchObject({
      host: 'cache.example.com',
      port: 6380,
      username: 'default',
      password: 'p@ss',
      tls: {},
    });
  });

  it('refuses a database that is not a number', () => {
    expect(() => optionsFor('redis://redis:6379/main')).toThrow(
      'invalid database number',
    );
  });
});
