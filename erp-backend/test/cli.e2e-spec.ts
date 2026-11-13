import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CliError,
  createPlatformAdmin,
} from '../src/identity/cli/create-platform-admin.js';
import { MailService } from '../src/mail/mail.service.js';
import {
  ALREADY_INSTALLED,
  install,
} from '../src/organizations/cli/install.js';
import { auditEvents } from './support/campus.js';
import { api, fakeMail } from './support/identity.js';
import { createTestApp } from './support/test-app.js';
import { truncateAllTables } from './support/test-database.js';

const INSTALL = {
  organization: 'Sunrise Schools',
  campus: 'Main Campus',
  timezone: 'Africa/Lagos',
  adminEmail: 'Head@Sunrise.test',
  adminName: 'Ada Head',
};

describe('Backend commands (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  const mail = fakeMail();

  const globalRoles = async (userId: string) =>
    (
      await dataSource.query(
        'SELECT r.name FROM model_has_roles a JOIN roles r ON r.id = a.role_id WHERE a.user_id = $1 AND a.school_id IS NULL',
        [userId],
      )
    ).map((row: { name: string }) => row.name);

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: MailService, useValue: mail.service }],
    });
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('install', () => {
    beforeAll(async () => {
      await truncateAllTables();
    });

    it('creates the organization, first campus and platform administrator on an empty database', async () => {
      const result = await install(app, INSTALL);
      expect(result.link).toMatch(
        /^http:\/\/frontend\.test\/invitations\/[A-Za-z0-9_-]{64}$/,
      );
      expect(mail.sent).toHaveLength(0);

      const [organization] = await dataSource.query(
        'SELECT id, name, code FROM organizations',
      );
      expect(organization).toMatchObject({
        id: result.organizationId,
        name: 'Sunrise Schools',
      });
      expect(organization.code).toMatch(/^[A-Z0-9]{12}$/);
      const [school] = await dataSource.query(
        'SELECT id, name, timezone, organization_id FROM schools',
      );
      expect(school).toEqual({
        id: result.schoolId,
        name: 'Main Campus',
        timezone: 'Africa/Lagos',
        organization_id: result.organizationId,
      });
      const [admin] = await dataSource.query(
        'SELECT id, email, name, account_status, password_hash FROM users',
      );
      expect(admin).toEqual({
        id: result.userId,
        email: 'head@sunrise.test',
        name: 'Ada Head',
        account_status: 'invited',
        password_hash: null,
      });
      expect(await globalRoles(result.userId)).toEqual(['platform-admin']);
      const [membership] = await dataSource.query(
        'SELECT school_id, status, is_primary FROM school_memberships WHERE user_id = $1',
        [result.userId],
      );
      expect(membership).toEqual({
        school_id: result.schoolId,
        status: 'active',
        is_primary: true,
      });
      const [profile] = await dataSource.query(
        'SELECT preset FROM school_operating_profiles WHERE school_id = $1',
        [result.schoolId],
      );
      expect(profile.preset).toBe('home_sections');

      const [event] = await auditEvents(app, 'installation.completed');
      expect(event).toMatchObject({
        schoolId: result.schoolId,
        actorId: null,
        context: {
          organization_id: result.organizationId,
          school_id: result.schoolId,
        },
      });

      // The link works: the administrator sets a password and signs in.
      const token = result.link.split('/').pop();
      await api(app)
        .post(`/api/v1/invitations/${token}/accept`)
        .send({
          password: 'a long new password',
          passwordConfirmation: 'a long new password',
        })
        .expect(204);
    });

    it('refuses to run when data already exists', async () => {
      await expect(
        install(app, { ...INSTALL, adminEmail: 'second@sunrise.test' }),
      ).rejects.toThrow(new CliError(ALREADY_INSTALLED));
      const [{ n }] = await dataSource.query(
        'SELECT count(*)::int AS n FROM organizations',
      );
      expect(n).toBe(1);
    });

    it('checks its input', async () => {
      await expect(
        install(app, { ...INSTALL, timezone: 'Lagos' }),
      ).rejects.toThrow(
        '--timezone must be an IANA time zone, for example Africa/Lagos.',
      );
      await expect(
        install(app, { ...INSTALL, organization: ' ' }),
      ).rejects.toThrow('--organization is required (at most 100 characters).');
      await expect(
        install(app, { ...INSTALL, adminEmail: 'nope' }),
      ).rejects.toThrow('--admin-email must be a valid email address.');
    });
  });

  describe('create-platform-admin', () => {
    it('grants the global platform-admin role, once', async () => {
      const email = `root.${Date.now()}@school.test`;
      const first = await createPlatformAdmin(app, { name: 'Root', email });
      expect(await globalRoles(first.userId)).toEqual(['platform-admin']);
      const again = await createPlatformAdmin(app, { name: 'Root', email });
      expect(again.userId).toBe(first.userId);
      expect(await globalRoles(first.userId)).toEqual(['platform-admin']);
      const attached = await auditEvents(app, 'role.attached', first.userId);
      expect(attached).toHaveLength(1);
      expect(attached[0]).toMatchObject({
        actorId: null,
        schoolId: null,
        context: { role: 'platform-admin' },
      });
    });
  });
});
