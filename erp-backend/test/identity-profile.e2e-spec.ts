import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { EmailDomainChecker } from '../src/common/validation/email-domain.js';
import { User } from '../src/identity/entities/user.entity.js';
import { MailService } from '../src/mail/mail.service.js';
import { StorageService } from '../src/storage/storage.service.js';
import {
  type SignedIn,
  bearer,
  createUser,
  fakeMail,
  signIn,
} from './support/identity.js';
import { createTestApp } from './support/test-app.js';

// The smallest valid PNG (1x1) and a JPEG header.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64, 1),
]);

describe('Own profile (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let storage: StorageService;
  const mail = fakeMail();
  // The shared email-domain rule; "gmial.com" has no mail records.
  const domains = {
    canReceiveMail: vi.fn(
      async (email: string) => !email.endsWith('@gmial.com'),
    ),
  };

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [
        { provide: MailService, useValue: mail.service },
        { provide: EmailDomainChecker, useValue: domains },
      ],
    });
    dataSource = app.get(DataSource);
    storage = app.get(StorageService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function me(): Promise<SignedIn & { user: User; auth: string }> {
    const user = await createUser(app, {
      city: 'Lahore',
      phone: '0300 1234567',
    });
    const signedIn = await signIn(app, user.email);
    return { ...signedIn, user, auth: bearer(signedIn.accessToken) };
  }

  it('GET /me returns the profile and no secrets', async () => {
    const { user, client, auth } = await me();
    const res = await client
      .get('/api/v1/me')
      .set('Authorization', auth)
      .expect(200);

    expect(res.body).toEqual({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerifiedAt: expect.any(String),
      accountStatus: 'active',
      passwordChangeRequired: false,
      twoFactorEnabled: false,
      birthday: null,
      gender: null,
      phone: '0300 1234567',
      address: null,
      addressLine2: null,
      city: 'Lahore',
      state: null,
      postalCode: null,
      country: null,
      nationality: null,
      profilePhotoUrl: null,
      createdAt: expect.any(String),
    });
  });

  it('PATCH changes only the fields sent; null clears an optional field', async () => {
    const { client, auth } = await me();
    const res = await client
      .patch('/api/v1/me')
      .set('Authorization', auth)
      .send({
        name: 'Ayesha Khan',
        gender: 'Female',
        birthday: '2001-04-05',
        addressLine2: 'Block C',
        phone: null,
      })
      .expect(200);

    expect(res.body).toMatchObject({
      name: 'Ayesha Khan',
      gender: 'Female',
      birthday: '2001-04-05',
      addressLine2: 'Block C',
      phone: null,
      city: 'Lahore',
      emailVerifiedAt: expect.any(String),
    });
    expect(mail.service.send).not.toHaveBeenCalled();
  });

  it('validates the fields', async () => {
    const { client, auth } = await me();
    const today = new Date().toISOString().slice(0, 10);

    const bad = await client
      .patch('/api/v1/me')
      .set('Authorization', auth)
      .send({
        name: '',
        gender: 'Robot',
        birthday: '05/04/2001',
        city: 'x'.repeat(101),
        role: 'admin',
      })
      .expect(400);
    expect(Object.keys(bad.body.error.fields).sort()).toEqual([
      'birthday',
      'city',
      'gender',
      'name',
      'role',
    ]);

    const future = await client
      .patch('/api/v1/me')
      .set('Authorization', auth)
      .send({ birthday: today })
      .expect(400);
    expect(future.body.error.fields).toEqual({
      birthday: ['The birthday field must be a date before today.'],
    });
  });

  it('refuses an email that is taken or whose domain cannot receive mail', async () => {
    const { client, auth } = await me();
    const other = await createUser(app);

    const taken = await client
      .patch('/api/v1/me')
      .set('Authorization', auth)
      .send({ email: other.email.toUpperCase() })
      .expect(400);
    expect(taken.body.error.fields).toEqual({
      email: ['The email has already been taken.'],
    });

    const typo = await client
      .patch('/api/v1/me')
      .set('Authorization', auth)
      .send({ email: 'ayesha@gmial.com' })
      .expect(400);
    expect(typo.body.error.fields).toEqual({
      email: ['The email field must be a valid email address.'],
    });
  });

  it('checks the domain only when the address changes', async () => {
    const { user, client, auth } = await me();
    domains.canReceiveMail.mockClear();
    await client
      .patch('/api/v1/me')
      .set('Authorization', auth)
      .send({ email: user.email })
      .expect(200);
    expect(domains.canReceiveMail).not.toHaveBeenCalled();
  });

  describe('photo', () => {
    const upload = (
      signedIn: SignedIn & { auth: string },
      content: Buffer,
      filename: string,
      contentType: string,
    ) =>
      signedIn.client
        .post('/api/v1/me/photo')
        .set('Authorization', signedIn.auth)
        .attach('photo', content, { filename, contentType });

    it('stores a png or jpg checked by content, behind a signed link', async () => {
      const signedIn = await me();
      const res = await upload(signedIn, PNG, 'face.png', 'image/png').expect(
        200,
      );

      const url = new URL(res.body.profilePhotoUrl);
      expect(url.pathname).toBe('/api/v1/storage/files');
      const row = await dataSource.manager.findOneByOrFail(User, {
        id: signedIn.user.id,
      });
      expect(row.profilePhotoPath).toMatch(
        new RegExp(`^users/${signedIn.user.id}/photo-[A-Za-z0-9_-]+\\.png$`),
      );
      const download = await request(app.getHttpServer())
        .get(`${url.pathname}${url.search}`)
        .buffer(true)
        .parse((response, done) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(Buffer.compare(download.body as Buffer, PNG)).toBe(0);

      // A JPEG, even named .png, is stored as .jpg: the content decides.
      await upload(signedIn, JPEG, 'face.png', 'image/png').expect(200);
      const replaced = await dataSource.manager.findOneByOrFail(User, {
        id: signedIn.user.id,
      });
      expect(replaced.profilePhotoPath).toMatch(/\.jpg$/);
      // The old file is deleted.
      expect(await storage.exists(row.profilePhotoPath!)).toBe(false);
      expect(await storage.exists(replaced.profilePhotoPath!)).toBe(true);
    });

    it('refuses a file that is not a jpg or png, whatever its name and declared type', async () => {
      const signedIn = await me();
      const res = await upload(
        signedIn,
        Buffer.from('<svg onload="alert(1)"></svg>'),
        'face.png',
        'image/png',
      ).expect(400);
      expect(res.body.error.fields).toEqual({
        photo: ['The photo field must be a file of type: jpg, jpeg, png.'],
      });
      await signedIn.client
        .post('/api/v1/me/photo')
        .set('Authorization', signedIn.auth)
        .expect(400);
    });

    it('refuses a file larger than 3000 KB', async () => {
      const signedIn = await me();
      const big = Buffer.concat([PNG, Buffer.alloc(3000 * 1024)]);
      const res = await upload(signedIn, big, 'big.png', 'image/png').expect(
        400,
      );
      expect(res.body.error.fields).toEqual({
        photo: ['The photo field must not be greater than 3000 kilobytes.'],
      });
    });

    it('removing the photo deletes the file', async () => {
      const signedIn = await me();
      await upload(signedIn, PNG, 'face.png', 'image/png').expect(200);
      const stored = (
        await dataSource.manager.findOneByOrFail(User, { id: signedIn.user.id })
      ).profilePhotoPath!;

      const res = await signedIn.client
        .delete('/api/v1/me/photo')
        .set('Authorization', signedIn.auth)
        .expect(200);
      expect(res.body.profilePhotoUrl).toBeNull();
      expect(await storage.exists(stored)).toBe(false);
    });
  });

  it('documents the identity endpoints and error codes in OpenAPI', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/docs/openapi.json')
      .expect(200);
    const paths = Object.keys(res.body.paths);
    for (const path of [
      '/api/v1/auth/login',
      '/api/v1/auth/refresh',
      '/api/v1/auth/two-factor',
      '/api/v1/invitations/{token}/accept',
      '/api/v1/me',
      '/api/v1/me/photo',
    ]) {
      expect(paths).toContain(path);
    }
    const revokeOthers =
      res.body.paths['/api/v1/auth/sessions/revoke-others'].post.responses;
    expect(revokeOthers['423'].description).toContain(
      'password_confirmation_required',
    );
    expect(
      res.body.paths['/api/v1/auth/login'].post.responses['401'].description,
    ).toContain('invalid_credentials');
  });
});
