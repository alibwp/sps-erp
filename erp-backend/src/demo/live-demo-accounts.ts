import type { INestApplicationContext, LoggerService } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DEMO_ACCOUNTS, seedDemoUsersWithHash } from './seed-demo-users.js';

// The live backend's Railway domain. Only there are the demo accounts made
// on start-up (the owner's choice), so the team can sign in to the live
// site without shell access.
export const LIVE_RAILWAY_DOMAIN = 'sps-erp-production.up.railway.app';

// argon2id hash of the demo password the owner chose; the password itself
// is not stored anywhere in the code.
export const LIVE_DEMO_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$mflJu1vGzNDXiIHnQEBdYQ$mVQYCcoEHOHoFaRpwYzlszTqdd3vSckCK3f+gXg1fOA';

export type LiveDemoOutcome = 'not-live' | 'already-made' | 'made';

// Makes, on the live backend, each demo account whose email has never
// existed. An account removed with `seed-demo-users --remove` still exists
// (archived), so it stays removed; a demo account added later (the parent)
// is made on the next start.
export async function makeLiveDemoAccountsOnce(
  app: INestApplicationContext,
  railwayDomain: string | undefined,
  passwordHash = LIVE_DEMO_PASSWORD_HASH,
): Promise<LiveDemoOutcome> {
  if (railwayDomain?.trim() !== LIVE_RAILWAY_DOMAIN) return 'not-live';
  const emails = DEMO_ACCOUNTS.map((account) => account.email);
  const existing = (await app
    .get(DataSource)
    .query('SELECT email FROM users WHERE email = ANY($1::text[])', [
      emails,
    ])) as Array<{ email: string }>;
  const known = new Set(existing.map((row) => row.email));
  const missing = emails.filter((email) => !known.has(email));
  if (!missing.length) return 'already-made';
  await seedDemoUsersWithHash(app, passwordHash, { only: missing });
  return 'made';
}

// Called once the backend is listening. It does not hold up start-up, and a
// failure is only logged: it never stops the app.
export function startLiveDemoAccounts(
  app: INestApplicationContext,
  railwayDomain: string | undefined,
  logger: Pick<LoggerService, 'log' | 'error'>,
): void {
  if (railwayDomain?.trim() !== LIVE_RAILWAY_DOMAIN) return;
  void makeLiveDemoAccountsOnce(app, railwayDomain).then(
    (outcome) => {
      if (outcome === 'made') logger.log('Demo accounts made', 'DemoAccounts');
    },
    (error: unknown) => {
      logger.error(
        `Demo accounts not made: ${
          error instanceof Error ? error.message : String(error)
        }`,
        'DemoAccounts',
      );
    },
  );
}
