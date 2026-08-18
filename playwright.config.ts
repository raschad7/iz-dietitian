import { defineConfig, devices } from '@playwright/test';

import { loadTestEnv } from './e2e/env';

/**
 * Real end-to-end tests: a real browser, driving the real Next.js app, backed
 * by the same Postgres test database `bun test`'s integration tests use
 * (`TEST_DATABASE_URL` from `.env.test.local`).
 *
 * **Not run as part of `bun test`.** These start a whole app server and a
 * browser, and are naturally slower and more failure-prone (timing, network,
 * a stray element) than the unit/integration suite. Run them explicitly:
 *
 *   bunx playwright install chromium   (once)
 *   bun run test:e2e
 *
 * `e2e/global-setup.ts` truncates and reseeds the test database before the
 * run, the same way `resetDatabase()` does for every `bun test` file — so
 * this must never point at a database whose name does not end in `_test`,
 * and must never run at the same time as `bun test` against the same
 * database.
 */

const testEnv = loadTestEnv();
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    // `next dev` allows only one instance per project directory regardless of
    // port, so a build + `next start` avoids colliding with a dev server the
    // person running these might already have open on :3000.
    command: `bunx next build && bunx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      DATABASE_URL: testEnv.TEST_DATABASE_URL ?? '',
      BETTER_AUTH_SECRET: testEnv.BETTER_AUTH_SECRET ?? '',
      BETTER_AUTH_URL: baseURL,
      APP_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
      MAIL_TRANSPORT: 'console',
      LLM_TRANSPORT: 'console',
      WHATSAPP_ENABLED: 'false',
    },
  },
});
