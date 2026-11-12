import { ConfigService } from '@nestjs/config';
import {
  REFRESH_COOKIE,
  clearRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie.js';
import { twoFactorTracker } from './two-factor-attempts.middleware.js';

function fakeResponse() {
  return { cookie: vi.fn(), clearCookie: vi.fn() };
}

describe('refresh cookie', () => {
  const config = new ConfigService({ NODE_ENV: 'production' });
  const now = new Date('2026-11-06T10:00:00Z');

  it('lives exactly as long as the session has left', () => {
    const res = fakeResponse();
    const expiresAt = new Date(now.getTime() + 24 * 3_600_000); // one day left

    setRefreshCookie(res as never, config, 'token', { expiresAt, now });

    expect(res.cookie).toHaveBeenCalledWith(REFRESH_COOKIE, 'token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/api/v1/auth',
      maxAge: 24 * 3_600_000,
    });
  });

  it('never gets a negative lifetime', () => {
    const res = fakeResponse();
    setRefreshCookie(res as never, config, 'token', {
      expiresAt: new Date(now.getTime() - 1000),
      now,
    });
    expect(res.cookie.mock.calls[0][2].maxAge).toBe(0);
  });

  it('is cleared with the same path and flags', () => {
    const res = fakeResponse();
    clearRefreshCookie(
      res as never,
      new ConfigService({ NODE_ENV: 'development' }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api/v1/auth',
    });
  });
});

describe('twoFactorTracker', () => {
  it('counts attempts per account, whatever the sign-in or address', () => {
    expect(
      twoFactorTracker({ twoFactorAccountId: 'user-1', ip: '10.0.0.1' }),
    ).toBe('two-factor:user-1');
    expect(
      twoFactorTracker({ twoFactorAccountId: 'user-1', ip: '10.0.0.2' }),
    ).toBe('two-factor:user-1');
  });

  it('counts an unknown challenge token per IP', () => {
    expect(twoFactorTracker({ twoFactorAccountId: null, ip: '10.0.0.1' })).toBe(
      'two-factor:unknown:10.0.0.1',
    );
  });
});
