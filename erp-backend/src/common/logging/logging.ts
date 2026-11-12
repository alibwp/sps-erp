import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';

export const REQUEST_ID_HEADER = 'x-request-id';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

// Keeps a caller's X-Request-Id when it looks safe, otherwise makes one.
// The id is sent back on the response and appears on every log line.
export function requestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

const SECRET_KEYS = [
  'password',
  'passwordConfirmation',
  'currentPassword',
  'token',
  'accessToken',
  'refreshToken',
  'challengeToken',
  'secret',
  'recoveryCodes',
];

// Header and field paths never written to the log.
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...SECRET_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
];

const SECRET_QUERY_PARAMS = new Set(['signature', 'token']);

// Paths whose next segment is a secret token (the invitation link).
const SECRET_PATH_SEGMENT = /^(\/api\/v\d+\/invitations\/)[^/]+/;

// Removes secrets carried in the URL: tokens in the path and signatures or
// tokens in the query string.
export function redactUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const [rawPath, query] = url.split('?', 2);
  const path = rawPath.replace(SECRET_PATH_SEGMENT, '$1[redacted]');
  if (query === undefined) return path;
  const params = new URLSearchParams(query);
  for (const key of params.keys()) {
    if (SECRET_QUERY_PARAMS.has(key)) params.set(key, '[redacted]');
  }
  return `${path}?${params.toString()}`;
}

export function loggerOptions(config: ConfigService): Params {
  return {
    pinoHttp: {
      level: config.get<string>('LOG_LEVEL', 'info'),
      genReqId: requestId,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      serializers: {
        req: (req: { id: unknown; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: redactUrl(req.url),
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    },
  };
}
