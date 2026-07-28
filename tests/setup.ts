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
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error('TEST_DATABASE_URL is not set. Add it to .env.test.local and run: createdb dietitian_test');
}

/**
 * `resetDatabase()` truncates every table in `public`. Pointing this at a
 * development database would destroy real work, so require the name to end in
 * `_test` and refuse otherwise.
 *
 * Comparing against DATABASE_URL would NOT work as a guard: under NODE_ENV=test
 * `.env.local` is never loaded, so DATABASE_URL is undefined here and any such
 * comparison silently passes.
 */
const databaseName = new URL(url).pathname.slice(1);

if (!databaseName.endsWith('_test')) {
  throw new Error(
    `Refusing to run tests against "${databaseName}": the database name must end in _test, because the tests truncate every table.`,
  );
}

process.env.DATABASE_URL = url;
