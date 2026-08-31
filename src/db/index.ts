import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and point it at your local PostgreSQL.');
  }
  return url;
}

/**
 * Next.js dev mode re-evaluates modules on every hot reload; caching the
 * postgres.js client on `globalThis` keeps that from opening a new pool each
 * time.
 */
const globalForDb = globalThis as unknown as { __postgresClient?: ReturnType<typeof postgres> };

const client =
  globalForDb.__postgresClient ??
  postgres(getConnectionString(), {
    max: process.env.NODE_ENV === 'production' ? 10 : 5,
    /*
      No prepared statements in development, and that is about migrations
      rather than about speed.

      postgres.js prepares every statement it sends, and postgres caches the
      plan against the connection. The pool above is held on `globalThis` so a
      hot reload does not open a new one — which is right, and means a
      connection opened this morning is still serving requests after
      `bun run db:migrate` has altered a table underneath it. The next query
      touching that table dies with `cached plan must not change result type`,
      surfacing as a "Failed query" on a statement that is perfectly good and
      that runs fine from a fresh process. The only cure was restarting the dev
      server, which is a thing nobody should have to know.

      Production keeps them: there, connections are opened after the migration
      has run, and the plan cache is worth having on a query served thousands
      of times.
    */
    prepare: process.env.NODE_ENV === 'production',
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__postgresClient = client;
}

export const db = drizzle(client, {
  schema,
  // Any camelCase column key without an explicit name maps to snake_case.
  casing: 'snake_case',
  logger: process.env.DRIZZLE_LOG === 'true',
});

export type Database = typeof db;

export { schema };
