/**
 * Preloaded by `bun test` (see bunfig.toml).
 *
 * `src/db/index.ts` reads DATABASE_URL at module-evaluation time, so this must
 * run before anything imports `@/db` — that is exactly what a preload is for.
 *
 * TEST_DATABASE_URL comes from `.env.test.local`, which Bun loads automatically
 * under NODE_ENV=test. It deliberately does NOT live in `.env.local`: `bun test`
 * sets NODE_ENV=test, and Bun skips `.env.local` in that mode so development
 * secrets cannot leak into a test run.
 */
import { assertTestDatabaseUrl } from '../scripts/database-safety';

export {};

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error('TEST_DATABASE_URL is not set. Add it to .env.test.local and run: createdb dietitian_test');
}

assertTestDatabaseUrl(url);

process.env.DATABASE_URL = url;
