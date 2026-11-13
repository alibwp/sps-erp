import type { INestApplicationContext, LoggerService } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { seedDemoUsersWithHash } from './seed-demo-users.js';

// The live backend's Railway domain. Only there are the demo accounts made
// on start-up (the owner's choice), so the team can sign in to the live
// site without shell access.
export const LIVE_RAILWAY_DOMAIN = 'sps-erp-production.up.railway.app';

// argon2id hash of the demo password the owner chose; the password itself
// is not stored anywhere in the code.
export const LIVE_DEMO_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$mflJu1vGzNDXiIHnQEBdYQ$mVQYCcoEHOHoFaRpwYzlszTqdd3vSckCK3f+gXg1fOA';

export type LiveDemoOutcome = 'not-live' | 'already-made' | 'made';

// Makes the demo accounts on the live backend, once: nothing happens when
// any demo account has ever existed (archived ones count), so accounts
// removed with `seed-demo-users --remove` stay removed.
export async function makeLiveDemoAccountsOnce(
  app: INestApplicationContext,
  railwayDomain: string | undefined,
  passwordHash = LIVE_DEMO_PASSWORD_HASH,
): Promise<LiveDemoOutcome> {
  if (railwayDomain?.trim() !== LIVE_RAILWAY_DOMAIN) return 'not-live';
  const [row] = (await app
    .get(DataSource)
    .query(
      'SELECT EXISTS (SELECT 1 FROM users WHERE demo_account) AS made',
    )) as [{ made: boolean }];
  if (row.made) return 'already-made';
  await seedDemoUsersWithHash(app, passwordHash);
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
