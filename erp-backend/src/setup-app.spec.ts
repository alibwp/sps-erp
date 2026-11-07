import { ConfigService } from '@nestjs/config';
import { corsOrigins, openApiEnabled, trustProxy } from './setup-app.js';

describe('corsOrigins', () => {
  it('allows the local frontend on localhost and 127.0.0.1 by default', () => {
    expect(corsOrigins(new ConfigService({}))).toEqual([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ]);
  });

  it('reads a comma-separated CORS_ORIGIN', () => {
    const config = new ConfigService({
      CORS_ORIGIN: 'https://erp.example.com, https://admin.example.com',
    });

    expect(corsOrigins(config)).toEqual([
      'https://erp.example.com',
      'https://admin.example.com',
    ]);
  });
});

describe('trustProxy', () => {
  it.each([
    [undefined, false],
    ['0', false],
    ['1', 1],
    ['2', 2],
    ['true', true],
    ['yes', false],
    ['-1', false],
  ])('TRUST_PROXY=%s gives %s', (value, expected) => {
    const env: Record<string, string> =
      value === undefined ? {} : { TRUST_PROXY: value };
    expect(trustProxy(new ConfigService(env))).toBe(expected);
  });
});

describe('openApiEnabled', () => {
  it('is on outside production and off in production by default', () => {
    expect(openApiEnabled(new ConfigService({ NODE_ENV: 'development' }))).toBe(
      true,
    );
    expect(openApiEnabled(new ConfigService({ NODE_ENV: 'production' }))).toBe(
      false,
    );
  });

  it('follows OPENAPI_ENABLED when set', () => {
    expect(
      openApiEnabled(
        new ConfigService({ NODE_ENV: 'production', OPENAPI_ENABLED: 'true' }),
      ),
    ).toBe(true);
    expect(
      openApiEnabled(
        new ConfigService({
          NODE_ENV: 'development',
          OPENAPI_ENABLED: 'false',
        }),
      ),
    ).toBe(false);
  });
});
