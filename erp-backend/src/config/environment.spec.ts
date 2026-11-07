import { DEVELOPMENT_SECRETS, validateEnvironment } from './environment.js';

const local = {
  DATABASE_URL: 'postgresql://sps:pw@db:5432/sps_erp',
  JWT_SECRET: DEVELOPMENT_SECRETS[0],
  APP_KEY: DEVELOPMENT_SECRETS[1],
};

// Real-looking production secrets (never the development defaults).
const productionSecrets = {
  JWT_SECRET: 'x'.repeat(48),
  APP_KEY: Buffer.alloc(32, 7).toString('base64'),
  FRONTEND_URL: 'https://erp.example.com',
};

describe('validateEnvironment', () => {
  it('accepts the local defaults', () => {
    expect(validateEnvironment(local)).toBe(local);
  });

  it('requires a valid DATABASE_URL', () => {
    expect(() => validateEnvironment({})).toThrow('DATABASE_URL is required');
    expect(() => validateEnvironment({ DATABASE_URL: 'mysql://x' })).toThrow(
      'DATABASE_URL must start with',
    );
    expect(() => validateEnvironment({ DATABASE_URL: 'not a url' })).toThrow(
      'DATABASE_URL is not a valid URL',
    );
  });

  it('checks values that have a fixed set of options', () => {
    expect(() =>
      validateEnvironment({ ...local, STORAGE_DRIVER: 'ftp' }),
    ).toThrow('STORAGE_DRIVER must be one of');
    expect(() => validateEnvironment({ ...local, LOG_LEVEL: 'loud' })).toThrow(
      'LOG_LEVEL must be one of',
    );
    expect(() => validateEnvironment({ ...local, PORT: 'eighty' })).toThrow(
      'PORT must be a number',
    );
    expect(() =>
      validateEnvironment({ ...local, REDIS_URL: 'http://redis' }),
    ).toThrow('REDIS_URL must start with');
  });

  it('requires the bucket and Region for S3 storage', () => {
    expect(() =>
      validateEnvironment({ ...local, STORAGE_DRIVER: 's3' }),
    ).toThrow(/S3_BUCKET is required[\s\S]*AWS_REGION is required/);
  });

  it('requires production secrets and services', () => {
    expect(() =>
      validateEnvironment({ ...local, NODE_ENV: 'production' }),
    ).toThrow(
      /REDIS_URL is required[\s\S]*STORAGE_SIGNING_SECRET is required[\s\S]*SMTP_HOST is required/,
    );
    expect(
      validateEnvironment({
        ...local,
        NODE_ENV: 'production',
        REDIS_URL: 'rediss://cache.example.com:6379',
        STORAGE_DRIVER: 's3',
        S3_BUCKET: 'sps-files',
        AWS_REGION: 'eu-west-2',
        SMTP_HOST: 'email-smtp.eu-west-2.amazonaws.com',
        ...productionSecrets,
      }),
    ).toBeTruthy();
  });

  it('always requires a well-formed JWT_SECRET and APP_KEY', () => {
    const { JWT_SECRET: _jwt, APP_KEY: _key, ...withoutSecrets } = local;
    expect(() => validateEnvironment(withoutSecrets)).toThrow(
      /JWT_SECRET is required[\s\S]*APP_KEY is required/,
    );
    expect(() =>
      validateEnvironment({ ...local, JWT_SECRET: 'short' }),
    ).toThrow('JWT_SECRET must be at least 32 characters');
    for (const appKey of [
      'not base64!',
      Buffer.alloc(16).toString('base64'),
      'base64:',
    ]) {
      expect(() => validateEnvironment({ ...local, APP_KEY: appKey })).toThrow(
        'APP_KEY must be 32 random bytes, base64-encoded',
      );
    }
    expect(
      validateEnvironment({
        ...local,
        APP_KEY: 'base64:' + Buffer.alloc(32, 1).toString('base64'),
      }),
    ).toBeTruthy();
  });

  it('refuses the development secrets and requires FRONTEND_URL in production', () => {
    const production = {
      ...local,
      NODE_ENV: 'production',
      REDIS_URL: 'rediss://cache.example.com:6379',
      STORAGE_SIGNING_SECRET: 's'.repeat(40),
      SMTP_HOST: 'smtp.example.com',
    };
    expect(() => validateEnvironment(production)).toThrow(
      /JWT_SECRET is the development default[\s\S]*APP_KEY is the development default[\s\S]*FRONTEND_URL is required/,
    );
    expect(
      validateEnvironment({ ...production, ...productionSecrets }),
    ).toBeTruthy();
    expect(() =>
      validateEnvironment({
        ...production,
        ...productionSecrets,
        FRONTEND_URL: 'ftp://x',
      }),
    ).toThrow('FRONTEND_URL must start with');
  });

  it('checks the invitation expiry and the email-domain switch', () => {
    expect(() =>
      validateEnvironment({ ...local, ACCOUNT_INVITATION_EXPIRY_HOURS: '0' }),
    ).toThrow(
      'ACCOUNT_INVITATION_EXPIRY_HOURS must be a whole number of hours',
    );
    expect(() =>
      validateEnvironment({ ...local, CHECK_EMAIL_DOMAINS: 'yes' }),
    ).toThrow('CHECK_EMAIL_DOMAINS must be one of');
    expect(
      validateEnvironment({
        ...local,
        ACCOUNT_INVITATION_EXPIRY_HOURS: '48',
        CHECK_EMAIL_DOMAINS: 'false',
      }),
    ).toBeTruthy();
  });
});
