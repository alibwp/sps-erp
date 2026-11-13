import {
  LIVE_DEMO_PASSWORD_HASH,
  LIVE_RAILWAY_DOMAIN,
  startLiveDemoAccounts,
} from './live-demo-accounts.js';

describe('demo accounts on the live start-up', () => {
  const logger = () => ({ log: vi.fn(), error: vi.fn() });

  it('stores only an argon2id hash of the password', () => {
    expect(LIVE_DEMO_PASSWORD_HASH).toMatch(/^\$argon2id\$v=19\$/);
  });

  it('does nothing off the live Railway domain', () => {
    const app = { get: vi.fn() };
    for (const domain of [undefined, '', 'sps-erp-staging.up.railway.app']) {
      startLiveDemoAccounts(app as never, domain, logger());
    }
    expect(app.get).not.toHaveBeenCalled();
  });

  it('logs a failure and never throws', async () => {
    const log = logger();
    const app = {
      get: () => ({
        query: () => Promise.reject(new Error('database is down')),
      }),
    };

    expect(() =>
      startLiveDemoAccounts(app as never, LIVE_RAILWAY_DOMAIN, log),
    ).not.toThrow();

    await vi.waitFor(() =>
      expect(log.error).toHaveBeenCalledWith(
        'Demo accounts not made: database is down',
        'DemoAccounts',
      ),
    );
    expect(log.log).not.toHaveBeenCalled();
  });
});
