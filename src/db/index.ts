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
