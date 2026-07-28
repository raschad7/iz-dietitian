import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * A clinic — the tenant boundary.
 *
 * Every staff sign-up creates one, and every client belongs to exactly one. All
 * reads and writes in `src/features/clients/` are scoped by `clinic_id`, so two
 * dietitians who sign up independently never see each other's clients.
 *
 * A clinic is its own table rather than the owning user's id so that adding a
 * second practitioner to an existing clinic later is a UI change, not a
 * migration that has to rewrite every foreign key.
 */
export const clinics = pgTable('clinics', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** Seeded from the first staff member's name; there is no rename UI yet. */
  name: text('name').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Clinic = typeof clinics.$inferSelect;
