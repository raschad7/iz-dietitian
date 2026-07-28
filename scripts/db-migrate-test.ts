/**
 * Applies `drizzle/` to the test database. Run with `bun run db:migrate:test`
 * after every `bun run db:generate`, or the integration tests run against a
 * stale schema.
 *
 * This is a script rather than an env-prefixed drizzle-kit invocation so that it
 * behaves identically on Windows and POSIX shells.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error('TEST_DATABASE_URL is not set. Add it to .env.test.local and run: createdb dietitian_test');
}

const client = postgres(url, { max: 1 });

await migrate(drizzle(client), { migrationsFolder: './drizzle' });
await client.end();

console.info('test database migrated');
