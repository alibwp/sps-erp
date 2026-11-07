import { parseAppKey } from '../common/crypto/app-crypto.service.js';

export const MIN_JWT_SECRET_LENGTH = 32;

// The values docker-compose.yml and .env.example use for local work.
// Production refuses them.
export const DEVELOPMENT_SECRETS = [
  'local-development-jwt-secret-not-for-production',
  'base64:c3BzLWVycC1sb2NhbC1kZXYtYXBwLWtleS0wMDAwMDA=',
];

// Checks the environment once at start-up, so a missing or malformed setting
// stops the backend with a clear message instead of failing on first use.
export function validateEnvironment(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const problems: string[] = [];
  const get = (key: string): string | undefined => {
    const value = env[key];
    return typeof value === 'string' && value.trim() !== ''
      ? value.trim()
      : undefined;
  };
  const requireUrl = (key: string, protocols: string[], required: boolean) => {
    const value = get(key);
    if (!value) {
      if (required) problems.push(`${key} is required`);
      return;
    }
    try {
      const url = new URL(value);
      if (!protocols.includes(url.protocol)) {
        problems.push(`${key} must start with ${protocols.join(' or ')}//`);
      }
    } catch {
      problems.push(`${key} is not a valid URL`);
    }
  };
  const oneOf = (key: string, allowed: string[]) => {
    const value = get(key);
    if (value && !allowed.includes(value)) {
      problems.push(`${key} must be one of: ${allowed.join(', ')}`);
    }
  };

  const production = get('NODE_ENV') === 'production';

  requireUrl('DATABASE_URL', ['postgres:', 'postgresql:'], true);
  requireUrl('REDIS_URL', ['redis:', 'rediss:'], production);
  requireUrl('APP_URL', ['http:', 'https:'], false);

  const port = get('PORT');
  if (port && !/^\d{1,5}$/.test(port)) problems.push('PORT must be a number');
  const smtpPort = get('SMTP_PORT');
  if (smtpPort && !/^\d{1,5}$/.test(smtpPort))
    problems.push('SMTP_PORT must be a number');

  oneOf('STORAGE_DRIVER', ['local', 's3']);
  oneOf('LOG_LEVEL', [
    'fatal',
    'error',
    'warn',
    'info',
    'debug',
    'trace',
    'silent',
  ]);

  if (get('STORAGE_DRIVER') === 's3') {
    if (!get('S3_BUCKET'))
      problems.push('S3_BUCKET is required when STORAGE_DRIVER=s3');
    if (!get('AWS_REGION'))
      problems.push('AWS_REGION is required when STORAGE_DRIVER=s3');
  } else if (production && !get('STORAGE_SIGNING_SECRET')) {
    problems.push(
      'STORAGE_SIGNING_SECRET is required for local storage in production',
    );
  }
  if (production && !get('SMTP_HOST'))
    problems.push('SMTP_HOST is required in production');

  // Identity (Stage 1).
  const jwtSecret = get('JWT_SECRET');
  if (!jwtSecret) problems.push('JWT_SECRET is required');
  else if (jwtSecret.length < MIN_JWT_SECRET_LENGTH)
    problems.push(
      `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`,
    );

  const appKey = get('APP_KEY');
  if (!appKey) problems.push('APP_KEY is required');
  else if (!parseAppKey(appKey))
    problems.push('APP_KEY must be 32 random bytes, base64-encoded');

  if (production) {
    for (const [key, value] of [
      ['JWT_SECRET', jwtSecret],
      ['APP_KEY', appKey],
    ] as const) {
      if (value && DEVELOPMENT_SECRETS.includes(value))
        problems.push(`${key} is the development default; set a real secret`);
    }
  }
  requireUrl('FRONTEND_URL', ['http:', 'https:'], production);

  const expiryHours = get('ACCOUNT_INVITATION_EXPIRY_HOURS');
  if (expiryHours && !/^[1-9]\d{0,4}$/.test(expiryHours))
    problems.push(
      'ACCOUNT_INVITATION_EXPIRY_HOURS must be a whole number of hours',
    );
  oneOf('CHECK_EMAIL_DOMAINS', ['true', 'false']);

  if (problems.length) {
    throw new Error(`Invalid environment:\n- ${problems.join('\n- ')}`);
  }
  return env;
}
