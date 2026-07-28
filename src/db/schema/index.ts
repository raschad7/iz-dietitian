/**
 * Schema barrel — the single entry point drizzle-kit reads (see
 * `drizzle.config.ts`) and the object handed to the Drizzle client.
 *
 * Right now it exports nothing but the tables Better Auth requires. There are
 * deliberately NO domain tables yet.
 *
 * When a feature needs storage, add `src/db/schema/<feature>.ts` and re-export
 * it from here. Conventions (see README): snake_case column and table names,
 * English identifiers only, `gen_random_uuid()` primary keys, and
 * `created_at` / `updated_at` on every table.
 */
export * from './auth';
export * from './clients';
