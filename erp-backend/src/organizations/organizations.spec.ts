import {
  DELEGABLE_ORGANIZATION_PERMISSIONS,
  ORGANIZATION_PERMISSIONS,
  isBuiltInRole,
  isSystemScopedRole,
} from '../access/access.constants.js';
import { invitationStatus } from '../accounts/account-queries.service.js';
import { FEATURES, FEATURE_INFO } from '../features/features.js';
import {
  grantedPermissions,
  membershipGrants,
} from './organization-access.service.js';
import { isTimeZone } from './organizations.dto.js';
import { randomCode } from './organizations.service.js';

describe('isTimeZone', () => {
  it.each([
    'UTC',
    'Africa/Lagos',
    'Asia/Karachi',
    'America/Argentina/Buenos_Aires',
  ])('accepts %s', (zone) => expect(isTimeZone(zone)).toBe(true));

  it.each(['', '+05:00', 'GMT+5 ', 'Mars/Olympus', 'Lagos', 42, null])(
    'refuses %s',
    (zone) => expect(isTimeZone(zone)).toBe(false),
  );
});

describe('randomCode', () => {
  it('is upper-case letters and digits of the asked length', () => {
    expect(randomCode(12)).toMatch(/^[A-Z0-9]{12}$/);
    expect(randomCode(10)).toMatch(/^[A-Z0-9]{10}$/);
    expect(new Set(Array.from({ length: 50 }, () => randomCode(12))).size).toBe(
      50,
    );
  });
});

describe('organization permissions', () => {
  it('null on a membership means every permission, in the reference order', () => {
    expect(grantedPermissions({ permissions: null })).toEqual([
      'read organization',
      'manage organization',
      'manage organization members',
      'manage organization campuses',
      'move students between campuses',
      'read organization reports',
    ]);
    expect(
      grantedPermissions({
        permissions: [
          'manage organization members',
          'read organization',
          'bogus',
        ],
      }),
    ).toEqual(['read organization', 'manage organization members']);
  });

  it('an ended or suspended membership grants nothing', () => {
    for (const status of ['ended', 'suspended'] as const) {
      expect(
        membershipGrants({ permissions: null, status }, 'read organization'),
      ).toBe(false);
    }
    expect(
      membershipGrants(
        { permissions: null, status: 'active' },
        'manage organization',
      ),
    ).toBe(true);
  });

  it('read is never delegated on its own', () => {
    expect(DELEGABLE_ORGANIZATION_PERMISSIONS).toEqual(
      ORGANIZATION_PERMISSIONS.filter((p) => p !== 'read organization'),
    );
  });
});

describe('built-in roles', () => {
  it('six are built in; librarian and accountant are shared but changeable', () => {
    for (const name of [
      'platform-admin',
      'organization-admin',
      'admin',
      'teacher',
      'student',
      'parent',
    ]) {
      expect(isBuiltInRole(name)).toBe(true);
    }
    expect(isBuiltInRole('librarian')).toBe(false);
    expect(isBuiltInRole('accountant')).toBe(false);
    expect(isSystemScopedRole('platform-admin')).toBe(true);
    expect(isSystemScopedRole('organization-admin')).toBe(true);
    expect(isSystemScopedRole('admin')).toBe(false);
  });
});

describe('invitationStatus', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const later = new Date('2026-11-11T12:00:00Z');
  const earlier = new Date('2026-11-09T12:00:00Z');

  it('accepted wins over revoked, and revoked over expired', () => {
    expect(
      invitationStatus(
        { acceptedAt: earlier, revokedAt: earlier, expiresAt: earlier },
        now,
      ),
    ).toBe('accepted');
    expect(
      invitationStatus(
        { acceptedAt: null, revokedAt: earlier, expiresAt: earlier },
        now,
      ),
    ).toBe('revoked');
    expect(
      invitationStatus(
        { acceptedAt: null, revokedAt: null, expiresAt: now },
        now,
      ),
    ).toBe('expired');
    expect(
      invitationStatus(
        { acceptedAt: null, revokedAt: null, expiresAt: later },
        now,
      ),
    ).toBe('pending');
  });
});

describe('features', () => {
  it('are the reference’s twelve, with ranking, boarding and library off by default', () => {
    expect(FEATURES).toHaveLength(12);
    expect(
      FEATURES.filter((feature) => !FEATURE_INFO[feature].defaultEnabled),
    ).toEqual(['ranking', 'boarding', 'library']);
  });
});
