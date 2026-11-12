import { Writable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import { pino, type LoggerOptions } from 'pino';
import { loggerOptions, redactUrl, requestId } from './logging.js';

function fakeExchange(headers: Record<string, string> = {}) {
  const responseHeaders: Record<string, string> = {};
  const req = { headers } as never;
  const res = {
    setHeader: (name: string, value: string) => {
      responseHeaders[name] = value;
    },
  } as never;
  return { req, res, responseHeaders };
}

describe('requestId', () => {
  it('keeps a safe incoming X-Request-Id and echoes it', () => {
    const { req, res, responseHeaders } = fakeExchange({
      'x-request-id': 'lb-1234.abc',
    });
    expect(requestId(req, res)).toBe('lb-1234.abc');
    expect(responseHeaders['X-Request-Id']).toBe('lb-1234.abc');
  });

  it.each(['', 'has space', 'x'.repeat(129), 'line\nbreak'])(
    'replaces an unsafe id %j',
    (incoming) => {
      const { req, res } = fakeExchange({ 'x-request-id': incoming });
      expect(requestId(req, res)).toMatch(/^[0-9a-f-]{36}$/);
    },
  );

  it('makes an id when none is sent', () => {
    const { req, res } = fakeExchange();
    expect(requestId(req, res)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('redactUrl', () => {
  it('hides signatures and tokens in the query string', () => {
    expect(
      redactUrl('/api/v1/storage/files?key=a.pdf&expires=1&signature=abc'),
    ).toBe(
      '/api/v1/storage/files?key=a.pdf&expires=1&signature=%5Bredacted%5D',
    );
    expect(redactUrl('/x?token=t')).toBe('/x?token=%5Bredacted%5D');
  });

  it('hides the invitation token in the path', () => {
    expect(redactUrl('/api/v1/invitations/abcDEF123_-')).toBe(
      '/api/v1/invitations/[redacted]',
    );
    expect(redactUrl('/api/v1/invitations/abcDEF123_-/accept')).toBe(
      '/api/v1/invitations/[redacted]/accept',
    );
    expect(redactUrl('/api/v1/invitations/abc?x=1')).toBe(
      '/api/v1/invitations/[redacted]?x=1',
    );
  });

  it('leaves other URLs alone', () => {
    expect(redactUrl('/api/health')).toBe('/api/health');
    expect(redactUrl('/api/v1/x?page=2')).toBe('/api/v1/x?page=2');
    expect(redactUrl(undefined)).toBeUndefined();
  });
});

describe('loggerOptions', () => {
  function capture() {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const { level, redact, serializers } = loggerOptions(
      new ConfigService({ LOG_LEVEL: 'info' }),
    ).pinoHttp as LoggerOptions;
    return { logger: pino({ level, redact, serializers }, stream), lines };
  }

  it('writes JSON with the request id and never the Authorization header or cookies', () => {
    const { logger, lines } = capture();

    logger.info(
      {
        req: {
          id: 'req-1',
          method: 'GET',
          url: '/api/v1/storage/files?key=a&signature=abc',
          headers: {
            authorization: 'Bearer super-secret-token',
            cookie: 'refresh=r1',
          },
        },
      },
      'request completed',
    );

    const line = JSON.parse(lines[0]);
    expect(line).toMatchObject({
      msg: 'request completed',
      req: {
        id: 'req-1',
        method: 'GET',
        url: '/api/v1/storage/files?key=a&signature=%5Bredacted%5D',
      },
    });
    expect(lines[0]).not.toContain('super-secret-token');
    expect(lines[0]).not.toContain('refresh=r1');
  });

  it('redacts passwords and tokens in logged objects', () => {
    const { logger, lines } = capture();

    logger.warn({
      password: 'p1',
      user: { password: 'p2', token: 't1' },
      body: { input: { refreshToken: 'r' } },
    });

    expect(lines[0]).not.toMatch(/"p1"|"p2"|"t1"|"r"/);
    expect(JSON.parse(lines[0]).user.password).toBe('[redacted]');
  });

  it('logs at the configured level', () => {
    expect(
      loggerOptions(new ConfigService({ LOG_LEVEL: 'silent' })).pinoHttp,
    ).toMatchObject({
      level: 'silent',
    });
  });
});
