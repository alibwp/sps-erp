import { applyTestEnvironment } from './test-env.js';
import { flushTestRedis, truncateAllTables } from './test-database.js';

// Runs before each e2e file, in its own process: test settings, then empty
// tables and an empty test Redis, so files never see each other's data.
applyTestEnvironment();

beforeAll(async () => {
  await truncateAllTables();
  await flushTestRedis();
});
