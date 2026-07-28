/**
 * Preloaded by `bun test` (see bunfig.toml).
 *
 * `src/db/index.ts` reads DATABASE_URL at module-evaluation time, so this must
 * run before anything imports `@/db` — that is exactly what a preload is for.
 */
import { existsSync, readFileSync } from 'node:fs';

/**
 * `bun test` sets NODE_ENV=test whenever it isn't already set, and Bun's
 * built-in env loader skips `.env.local` whenever NODE_ENV is "test" — that's
 * deliberate, so dev secrets in `.env.local` can't leak into a test run. The
 * side effect is that TEST_DATABASE_URL, which lives in `.env.local` right
 * next to DATABASE_URL (see .env.example), never gets loaded automatically
 * under `bun test`. Load it by hand instead.
 */
function loadEnvLocal(): void {
  if (!existsSync('.env.local')) return;

  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*)$/.exec(line.trimEnd());
    if (!match) continue;

    const [, key, rawValue] = match;
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = (rawValue ?? '').replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadEnvLocal();

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error('TEST_DATABASE_URL is not set. Add it to .env.local and run: createdb dietitian_test');
}

if (url === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL — the tests truncate every table.');
}

process.env.DATABASE_URL = url;
