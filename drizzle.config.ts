import { existsSync } from 'node:fs';

import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit runs its config under Node, and Bun only injects `.env.local`
 * into its own runtime — not into spawned Node processes. So load it here
 * rather than relying on the script runner.
 */
if (!process.env.DATABASE_URL) {
  for (const envFile of ['.env.local', '.env']) {
    if (existsSync(envFile)) {
      process.loadEnvFile(envFile);
      break;
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local before running drizzle-kit.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
