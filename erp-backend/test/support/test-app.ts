import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { MailProcessor } from '../../src/mail/mail.processor.js';
import { MaintenanceProcessor } from '../../src/scheduler/maintenance.processor.js';
import { SchedulerService } from '../../src/scheduler/scheduler.service.js';
import { setupApp } from '../../src/setup-app.js';

export interface TestAppOptions {
  // Extra controllers, for routes that exist only in tests.
  controllers?: Type[];
  // Providers to replace, for example a fake mail transport or a frozen
  // Clock.
  overrides?: Array<{ provide: unknown; useValue: unknown }>;
}

// The real app, configured exactly as main.ts does, against the test
// database and test Redis.
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<INestApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  });
  for (const override of options.overrides ?? []) {
    builder = builder
      .overrideProvider(override.provide)
      .useValue(override.useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  // Like a real server, be fully started before a test can stop it: the
  // workers connected and the first scheduler tick done.
  await Promise.all([
    app.get(MailProcessor).worker.waitUntilReady(),
    app.get(MaintenanceProcessor).worker.waitUntilReady(),
    app.get(SchedulerService).whenStarted(),
  ]);
  return app;
}

export async function waitFor<T>(
  probe: () => Promise<T | undefined | null | false>,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline)
      throw new Error(`Condition not met within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
