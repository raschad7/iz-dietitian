/**
 * Schema barrel — the single entry point drizzle-kit reads (see
 * `drizzle.config.ts`) and the object handed to the Drizzle client.
 *
 * When a feature needs storage, add `src/db/schema/<feature>.ts` and re-export
 * it from here. Conventions (see README): snake_case column and table names,
 * English identifiers only, `gen_random_uuid()` primary keys, and
 * `created_at` / `updated_at` on every table.
 */
export * from './auth';
export * from './clients';
export * from './clinics';
export * from './clinic-working-hours';
export * from './practitioners';
export * from './appointments';
export * from './appointment-requests';
export * from './client-requests';
export * from './client-settings';
export * from './catalog-foods';
export * from './dishes';
export * from './client-nutrition-profiles';
export * from './client-check-ins';
export * from './client-plan-adherence';
export * from './weekly-plans';
export * from './weekly-plan-meal-completions';
export * from './billing';
export * from './whatsapp';
