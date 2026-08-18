import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * A minimal `.env` line parser — no new dependency for something this small.
 *
 * Reads `.env.test.local` at the repo root, the same file `bun test` loads
 * automatically (see `tests/setup.ts`). E2E tests run the real app against
 * the real test database, never a mock, so they must point at the exact same
 * `TEST_DATABASE_URL` the integration tests already trust.
 */
export function loadTestEnv(): Record<string, string> {
  const path = resolve(__dirname, '..', '.env.test.local');
  let contents: string;

  try {
    contents = readFileSync(path, 'utf-8');
  } catch {
    throw new Error(
      `Could not read ${path}. E2E tests need the same test database as \`bun test\` — ` +
        'copy .env.test.example to .env.test.local first.',
    );
  }

  const env: Record<string, string> = {};

  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equals = trimmed.indexOf('=');
    if (equals === -1) continue;

    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}
