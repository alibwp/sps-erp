import { queueErrorListener } from './queue-errors.js';

describe('queueErrorListener', () => {
  it('logs each message once a minute at most, through the app logger', () => {
    const logger = { warn: vi.fn() };
    let now = 0;
    const listen = queueErrorListener('Queue mail', logger as never, () => now);

    listen(new Error('getaddrinfo ENOTFOUND redis'));
    now = 30_000;
    listen(new Error('getaddrinfo ENOTFOUND redis'));
    listen(new Error('connect ECONNREFUSED'));
    now = 61_000;
    listen(new Error('getaddrinfo ENOTFOUND redis'));

    expect(logger.warn.mock.calls).toEqual([
      ['Queue mail: getaddrinfo ENOTFOUND redis'],
      ['Queue mail: connect ECONNREFUSED'],
      ['Queue mail: getaddrinfo ENOTFOUND redis'],
    ]);
  });
});
