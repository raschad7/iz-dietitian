/**
 * Drops the `public` schema and replays every migration — run with
 * `bun run db:reset`.
 *
 * DESTRUCTIVE. Guarded so it can only ever hit a local development database.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function getLocalDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset the database with NODE_ENV=production.');
  }

  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to reset a non-local database (host: ${host}).`);
  }

  return url;
}

/**
 * This wipes every table — clients, staff, and every portal account
 * (`user`/`account`) along with them — and does NOT reseed or reissue portal
 * credentials afterward. A login that worked before a reset (e.g. a
 * `zainab`/`...` portal account) will fail with "User not found" until
 * `bun run db:seed` is run again. Requires `--yes` so that isn't a surprise.
 */
function requireConfirmation(): void {
  if (process.argv.includes('--yes')) return;

  console.error(
    [
      '',
      'REFUSING TO RESET: this drops every table in the local database —',
      'clients, staff, and every portal login (including any you created',
      'by hand) go with it. Nothing is reseeded automatically afterward.',
      '',
      'If that is really what you want, re-run with --yes:',
      '  bun run db:reset -- --yes',
      '',
      'Then recreate usable data with:',
      '  bun run db:seed',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

async function reset(): Promise<void> {
  requireConfirmation();

  const client = postgres(getLocalDatabaseUrl(), { max: 1 });

  try {
    console.info('dropping schema public…');
    await client.unsafe('drop schema if exists public cascade');
    await client.unsafe('create schema public');

    /**
     * The migration journal does NOT live in `public` — drizzle-kit keeps
     * `__drizzle_migrations` in its own `drizzle` schema. Dropping only `public`
     * therefore left the journal intact, `migrate()` below concluded every
     * migration was already applied, and the reset finished reporting success
     * against a database with no tables in it at all.
     */
    await client.unsafe('drop schema if exists drizzle cascade');

    console.info('running migrations…');
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });

    console.info('done. run `bun run db:seed` next.');
  } finally {
    await client.end();
  }
}

await reset();
