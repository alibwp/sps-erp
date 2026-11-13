import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  DEMO_ACCOUNTS,
  removeDemoUsers,
  seedDemoUsers,
} from '../src/demo/seed-demo-users.js';
import { InvitationService } from '../src/identity/invitations/invitation.service.js';
import { MailService } from '../src/mail/mail.service.js';
import {
  PASSWORD,
  api,
  bearer,
  fakeMail,
  refreshCookie,
  signIn,
} from './support/identity.js';
import { createTestApp } from './support/test-app.js';
import { truncateAllTables } from './support/test-database.js';

const TEACHER = 'teacher@gmail.com';

describe('Demo accounts (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let schoolId: string;
  const mail = fakeMail();

  const count = async (table: string) =>
    (await dataSource.query(`SELECT count(*)::int AS n FROM ${table}`))[0]
      .n as number;

  const rolesOf = (email: string) =>
    dataSource.query(
      `SELECT r.name, a.school_id IS NULL AS global
         FROM model_has_roles a
         JOIN roles r ON r.id = a.role_id
         JOIN users u ON u.id = a.user_id
        WHERE u.email = $1
        ORDER BY r.name`,
      [email],
    );

  const userRow = async (email: string) =>
    (
      await dataSource.query(
        `SELECT account_status, demo_account, email_verified_at IS NOT NULL AS verified,
                password_change_required_at, two_factor_secret,
                two_factor_recovery_codes, two_factor_confirmed_at
           FROM users WHERE email = $1`,
        [email],
      )
    )[0];

  const SIGN_IN_ONLY = {
    account_status: 'active',
    demo_account: true,
    verified: true,
    password_change_required_at: null,
    two_factor_secret: null,
    two_factor_recovery_codes: null,
    two_factor_confirmed_at: null,
  };

  beforeAll(async () => {
    await truncateAllTables();
    app = await createTestApp({
      overrides: [{ provide: MailService, useValue: mail.service }],
    });
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('makes the campus and one account per role on an empty database', async () => {
    const result = await seedDemoUsers(app, { password: PASSWORD });
    schoolId = result.schoolId;
    expect(result.accounts).toEqual(
      DEMO_ACCOUNTS.map(({ email, name }) => ({ email, name, created: true })),
    );

    const [school] = await dataSource.query(
      `SELECT s.id, s.name, s.timezone, o.name AS organization
         FROM schools s JOIN organizations o ON o.id = s.organization_id`,
    );
    expect(school).toEqual({
      id: schoolId,
      name: 'Main Campus',
      timezone: 'Asia/Karachi',
      organization: 'SPS',
    });
    expect(await count('users')).toBe(DEMO_ACCOUNTS.length);
    for (const { email } of DEMO_ACCOUNTS) {
      expect(await userRow(email)).toEqual(SIGN_IN_ONLY);
    }

    expect(await rolesOf('platformadministrator@gmail.com')).toEqual([
      { name: 'platform-admin', global: true },
    ]);
    expect(await rolesOf('organizationadministrator@gmail.com')).toEqual([
      { name: 'organization-admin', global: true },
    ]);
    expect(await rolesOf('schooladministrator@gmail.com')).toEqual([
      { name: 'admin', global: false },
    ]);
    expect(await rolesOf(TEACHER)).toEqual([
      { name: 'teacher', global: false },
    ]);
    expect(await rolesOf('accountant@gmail.com')).toEqual([
      { name: 'accountant', global: false },
    ]);
    expect(await rolesOf('librarian@gmail.com')).toEqual([
      { name: 'librarian', global: false },
    ]);
    expect(await rolesOf('student@gmail.com')).toEqual([
      { name: 'student', global: false },
    ]);
    expect(
      await dataSource.query(
        'SELECT status, permissions FROM organization_memberships',
      ),
    ).toEqual([{ status: 'active', permissions: null }]);
    // Everybody but the platform administrator works at the campus.
    expect(await count('school_memberships')).toBe(DEMO_ACCOUNTS.length - 1);

    expect(
      await dataSource.query(
        `SELECT e.status, s.name AS section, s.status AS section_status,
                l.name AS level, y.status AS year
           FROM student_records e
           JOIN academic_cycle_sections s ON s.id = e.academic_cycle_section_id
           JOIN academic_levels l ON l.id = s.academic_level_id
           JOIN academic_years y ON y.id = s.academic_year_id`,
      ),
    ).toEqual([
      {
        status: 'active',
        section: 'A',
        section_status: 'active',
        level: 'Class 1',
        year: 'open',
      },
    ]);
    expect(await count('account_invitations')).toBe(0);
    expect(mail.sent).toHaveLength(0);
  });

  it('signs every account in with email and password alone', async () => {
    for (const { email } of DEMO_ACCOUNTS) {
      const res = await api(app)
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
    }
    // The email is verified, so an admin route answers.
    const admin = await signIn(app, 'schooladministrator@gmail.com');
    await admin.client
      .get('/api/v1/students')
      .set('Authorization', bearer(admin.accessToken))
      .set('X-School-Id', schoolId)
      .expect(200);
  });

  it('runs again without duplicates and puts sign-in back', async () => {
    const teacher = await dataSource.query(
      'SELECT id FROM users WHERE email = $1',
      [TEACHER],
    );
    await app
      .get(InvitationService)
      .send(teacher[0].id, { invitedById: null, notify: false });
    await dataSource.query(
      `UPDATE users SET password_hash = 'changed', account_status = 'suspended',
              email_verified_at = NULL, password_change_required_at = now(),
              two_factor_secret = 'secret', two_factor_recovery_codes = '["code"]',
              two_factor_confirmed_at = now()
        WHERE email = $1`,
      [TEACHER],
    );
    await dataSource.query('DELETE FROM model_has_roles WHERE user_id = $1', [
      teacher[0].id,
    ]);
    const before = {
      users: await count('users'),
      schools: await count('schools'),
      organizations: await count('organizations'),
      years: await count('academic_years'),
      levels: await count('academic_levels'),
      sections: await count('academic_cycle_sections'),
      enrollments: await count('student_records'),
      memberships: await count('school_memberships'),
    };

    const again = await seedDemoUsers(app, { password: PASSWORD });

    expect(again.schoolId).toBe(schoolId);
    expect(again.accounts.every((account) => !account.created)).toBe(true);
    expect({
      users: await count('users'),
      schools: await count('schools'),
      organizations: await count('organizations'),
      years: await count('academic_years'),
      levels: await count('academic_levels'),
      sections: await count('academic_cycle_sections'),
      enrollments: await count('student_records'),
      memberships: await count('school_memberships'),
    }).toEqual(before);
    expect(await userRow(TEACHER)).toEqual(SIGN_IN_ONLY);
    expect(await rolesOf(TEACHER)).toEqual([
      { name: 'teacher', global: false },
    ]);
    expect(
      await dataSource.query(
        `SELECT count(*)::int AS n FROM account_invitations
          WHERE accepted_at IS NULL AND revoked_at IS NULL`,
      ),
    ).toEqual([{ n: 0 }]);
    await signIn(app, TEACHER);
    expect(mail.sent).toHaveLength(0);
  });

  it('never emails a demo account, though forgot-password answers as usual', async () => {
    await api(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: TEACHER })
      .expect(202);
    expect(mail.sent).toHaveLength(0);
    expect(await count('password_reset_tokens')).toBe(0);
  });

  it('never takes over an account that is not a demo account', async () => {
    await dataSource.query(
      'UPDATE users SET demo_account = false WHERE email = $1',
      ['librarian@gmail.com'],
    );
    await expect(
      seedDemoUsers(app, { password: 'another password' }),
    ).rejects.toThrow(
      'These addresses belong to accounts that are not demo accounts: librarian@gmail.com. Nothing was changed.',
    );
    await signIn(app, TEACHER);
    await dataSource.query(
      'UPDATE users SET demo_account = true WHERE email = $1',
      ['librarian@gmail.com'],
    );
  });

  it('checks the password', async () => {
    await expect(seedDemoUsers(app, { password: 'short' })).rejects.toThrow(
      '--password must be at least 8 characters.',
    );
  });

  it('--remove archives every demo account and ends its sessions', async () => {
    const teacher = await signIn(app, TEACHER);

    expect(await removeDemoUsers(app)).toBe(DEMO_ACCOUNTS.length);

    expect(
      await dataSource.query(
        'SELECT DISTINCT account_status FROM users WHERE demo_account',
      ),
    ).toEqual([{ account_status: 'archived' }]);
    expect(
      await dataSource.query(
        `SELECT count(*)::int AS n FROM auth_sessions s
           JOIN users u ON u.id = s.user_id
          WHERE u.demo_account AND s.revoked_at IS NULL`,
      ),
    ).toEqual([{ n: 0 }]);
    await teacher.client
      .get('/api/v1/me')
      .set('Authorization', bearer(teacher.accessToken))
      .expect(401);
    const refused = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: TEACHER, password: PASSWORD });
    expect(refused.status).toBe(403);
    expect(refreshCookie(refused)).toBeUndefined();

    // Seeding again switches them back on.
    await seedDemoUsers(app, { password: PASSWORD });
    await signIn(app, TEACHER);
  });
});
