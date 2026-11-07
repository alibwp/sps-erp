import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Needs PostgreSQL and Redis. Run inside Docker:
// `docker compose exec backend npm run test:e2e` from the sps-erp folder.
// Uses the sps_erp_test database and Redis database 15, never development
// data (see test/support/test-env.ts).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/support/global-setup.ts'],
    setupFiles: ['./test/support/setup-file.ts'],
    // Files share one database and one Redis, so they run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
