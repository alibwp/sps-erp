import { applyTestEnvironment } from './test-env.js';
import {
  createTestDatabaseIfMissing,
  flushTestRedis,
  rebuildSchema,
} from './test-database.js';

// Runs once before all e2e files: a clean test database with every
// migration applied, and an empty test Redis database.
export default async function setup(): Promise<void> {
  applyTestEnvironment();
  await createTestDatabaseIfMissing();
  await rebuildSchema();
  await flushTestRedis();
}
