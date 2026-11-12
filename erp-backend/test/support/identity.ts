import type { INestApplication } from '@nestjs/common';
import request, { type Response, type Test } from 'supertest';
import { DataSource } from 'typeorm';
import { User } from '../../src/identity/entities/user.entity.js';
import { REFRESH_COOKIE } from '../../src/identity/auth/refresh-cookie.js';
import { PasswordHasher } from '../../src/identity/password-hasher.js';
import type { MailMessage } from '../../src/mail/mail.service.js';

// A frontend origin from CORS_ORIGIN (refresh and logout require one).
export const ORIGIN = 'http://localhost:3000';
export const PASSWORD = 'correct horse battery';

let ipCounter = 0;
// A different client address per caller (tests run with TRUST_PROXY=1), so
// one test's requests do not use up another's per-IP rate limit.
export function nextIp(): string {
  ipCounter += 1;
  return `10.20.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

export interface Api {
  ip: string;
  get(path: string): Test;
  post(path: string): Test;
  put(path: string): Test;
  patch(path: string): Test;
  delete(path: string): Test;
}

export function api(app: INestApplication, ip = nextIp()): Api {
  const server = app.getHttpServer();
  const wrap = (test: Test) =>
    test.set('X-Forwarded-For', ip).set('Origin', ORIGIN);
  return {
    ip,
    get: (path) => wrap(request(server).get(path)),
    post: (path) => wrap(request(server).post(path)),
    put: (path) => wrap(request(server).put(path)),
    patch: (path) => wrap(request(server).patch(path)),
    delete: (path) => wrap(request(server).delete(path)),
  };
}

let userCounter = 0;
export async function createUser(
  app: INestApplication,
  overrides: Partial<User> & { password?: string | null } = {},
): Promise<User> {
  userCounter += 1;
  const { password = PASSWORD, ...fields } = overrides;
  const dataSource = app.get(DataSource);
  return dataSource.manager.save(
    dataSource.manager.create(User, {
      name: `Person ${userCounter}`,
      email: `person${userCounter}.${Date.now()}@school.test`,
      accountStatus: 'active',
      emailVerifiedAt: new Date(),
      passwordHash:
        password === null ? null : await app.get(PasswordHasher).hash(password),
      ...fields,
    }),
  );
}

// "sps_refresh_token=<value>" from a response, for a Cookie header.
export function refreshCookie(res: Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((value) =>
    value.startsWith(`${REFRESH_COOKIE}=`),
  );
  const pair = cookie?.split(';')[0];
  return pair && pair !== `${REFRESH_COOKIE}=` ? pair : undefined;
}

export interface SignedIn {
  accessToken: string;
  cookie: string;
  client: Api;
}

export async function signIn(
  app: INestApplication,
  email: string,
  password = PASSWORD,
  client = api(app),
): Promise<SignedIn> {
  const res = await client
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  const cookie = refreshCookie(res);
  if (!res.body.accessToken || !cookie)
    throw new Error(`Sign-in failed: ${JSON.stringify(res.body)}`);
  return { accessToken: res.body.accessToken, cookie, client };
}

export const bearer = (token: string) => `Bearer ${token}`;

// Captures what would be emailed, at the MailService level.
export function fakeMail() {
  const sent: MailMessage[] = [];
  const service = {
    send: vi.fn(async (message: MailMessage) => {
      sent.push(message);
      return String(sent.length);
    }),
  };
  return { service, sent };
}

// The token in the last link of a captured email (…/path/<token> or ?token=).
export function tokenFrom(message: MailMessage | undefined): string {
  const url = message?.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error('No link in the email');
  const parsed = new URL(url);
  return (
    parsed.searchParams.get('token') ??
    decodeURIComponent(parsed.pathname.split('/').pop() ?? '')
  );
}
