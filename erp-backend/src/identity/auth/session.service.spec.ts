import { FixedClock } from '../../common/clock/clock.js';
import { sha256 } from '../../common/crypto/app-crypto.service.js';
import { AuthSession } from '../entities/auth-session.entity.js';
import { User } from '../entities/user.entity.js';
import {
  REFRESH_GRACE_MS,
  SessionService,
  parseRefreshToken,
} from './session.service.js';

const SESSION_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const CURRENT = 'C'.repeat(43);
const PREVIOUS = 'P'.repeat(43);
const client = { ipAddress: '10.0.0.9', userAgent: 'Tests' };

function setup(
  overrides: Partial<AuthSession> = {},
  status: User['accountStatus'] = 'active',
) {
  const clock = new FixedClock(new Date('2026-11-06T10:00:00Z'));
  const session = Object.assign(new AuthSession(), {
    id: SESSION_ID,
    userId: 'user-1',
    refreshTokenHash: sha256(CURRENT),
    previousRefreshTokenHash: sha256(PREVIOUS),
    rotatedAt: new Date(clock.now().getTime() - 10_000),
    revokedAt: null,
    expiresAt: new Date(clock.now().getTime() + 86_400_000),
    ...overrides,
  });
  const user = Object.assign(new User(), {
    id: 'user-1',
    accountStatus: status,
  });
  const manager = {
    findOne: vi.fn(async () => user),
    save: vi.fn(async (entity: unknown) => entity),
  };
  const transactions = {
    run: vi.fn(async (work: (tx: unknown) => unknown) =>
      work({
        manager,
        lockOne: vi.fn(async () => session),
        afterCommit: vi.fn(),
      }),
    ),
  };
  const service = new SessionService({} as never, transactions as never, clock);
  return { service, session, clock };
}

describe('SessionService.refresh', () => {
  it('rotates the current token: a new secret, the old one kept as previous', async () => {
    const { service, session, clock } = setup();
    const outcome = await service.refresh(`${SESSION_ID}.${CURRENT}`, client);

    expect(outcome.kind).toBe('rotated');
    const refreshToken = (outcome as { refreshToken: string }).refreshToken;
    const secret = parseRefreshToken(refreshToken)!.secret;
    expect(secret).not.toBe(CURRENT);
    expect(session.refreshTokenHash).toBe(sha256(secret));
    expect(session.previousRefreshTokenHash).toBe(sha256(CURRENT));
    expect(session.rotatedAt).toEqual(clock.now());
    expect(session.revokedAt).toBeNull();
  });

  it('rotation keeps the expiry set at sign-in', async () => {
    const { service, session } = setup();
    const signedInUntil = session.expiresAt;

    await service.refresh(`${SESSION_ID}.${CURRENT}`, client);

    expect(session.expiresAt).toBe(signedInUntil);
  });

  it('the previous token within 30 seconds: access only, nothing rotated', async () => {
    const { service, session } = setup();
    const outcome = await service.refresh(`${SESSION_ID}.${PREVIOUS}`, client);

    expect(outcome.kind).toBe('grace');
    expect(session.refreshTokenHash).toBe(sha256(CURRENT));
    expect(session.previousRefreshTokenHash).toBe(sha256(PREVIOUS));
  });

  it('the previous token after 30 seconds revokes the session (reuse)', async () => {
    const { service, session, clock } = setup();
    session.rotatedAt = new Date(clock.now().getTime() - REFRESH_GRACE_MS - 1);

    expect(
      (await service.refresh(`${SESSION_ID}.${PREVIOUS}`, client)).kind,
    ).toBe('refused');
    expect(session.revokedAt).toEqual(clock.now());
  });

  it('an unknown secret for the session revokes it', async () => {
    const { service, session } = setup();
    expect(
      (await service.refresh(`${SESSION_ID}.${'X'.repeat(43)}`, client)).kind,
    ).toBe('refused');
    expect(session.revokedAt).not.toBeNull();
  });

  it('refuses a revoked, expired or pending session without changing it', async () => {
    for (const overrides of [
      { revokedAt: new Date('2026-11-06T09:00:00Z') },
      { expiresAt: new Date('2026-11-06T09:59:59Z') },
      { refreshTokenHash: null },
    ]) {
      const { service, session } = setup(overrides);
      const before = { ...session };
      expect(
        (await service.refresh(`${SESSION_ID}.${CURRENT}`, client)).kind,
      ).toBe('refused');
      expect(session.refreshTokenHash).toBe(before.refreshTokenHash);
    }
  });

  it('an account that is no longer active ends the session', async () => {
    const { service, session } = setup({}, 'suspended');
    expect(
      (await service.refresh(`${SESSION_ID}.${CURRENT}`, client)).kind,
    ).toBe('inactive');
    expect(session.revokedAt).not.toBeNull();
  });

  it('refuses a malformed token without a database lookup', async () => {
    const { service } = setup();
    expect((await service.refresh('garbage', client)).kind).toBe('refused');
    expect((await service.refresh(undefined, client)).kind).toBe('refused');
  });
});
