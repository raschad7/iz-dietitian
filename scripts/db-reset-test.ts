/**
 * Drops the test database's schemas and replays every migration — run with
 * `bun run db:reset:test`.
 *
 * DESTRUCTIVE, and safe to be: the integration tests truncate every table between
 * cases, so the test database never holds anything worth keeping.
 *
 * ## Why this exists
 *
 * `db:migrate:test` only ever moves forward. When the migration history is
 * *rewritten* — as it was when weekly-plans' migrations were regenerated on top of
 * main's `0008` — a database that applied the old files is left with tables that no
 * migration claims, and the next `migrate()` fails with `relation "…" already
 * exists`. Moving forward cannot fix that; only starting again can.
 *
 * Guarded by `assertTestDatabaseUrl`, the same check `db:migrate:test` uses, so this
 * can only ever hit a database whose name ends in `_test`.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { assertTestDatabaseUrl } from './database-safety';

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Add it to .env.test.local and run: createdb dietitian_test',
  );
}

assertTestDatabaseUrl(url);

const client = postgres(url, { max: 1 });

try {
  console.info('dropping schema public…');
  await client.unsafe('drop schema if exists public cascade');
  await client.unsafe('create schema public');

  // The journal lives in its own `drizzle` schema, not in `public`. Leaving it
  // behind would make `migrate()` conclude everything was already applied and
  // report success against an empty database — see the same note in db-reset.ts.
  await client.unsafe('drop schema if exists drizzle cascade');

  console.info('running migrations…');
  await migrate(drizzle(client), { migrationsFolder: './drizzle' });

  console.info('test database rebuilt');
} finally {
  await client.end();
}
