import { check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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
export const clinics = pgTable(
  'clinics',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Seeded from the first staff member's name; there is no rename UI yet. */
    name: text('name').notNull(),

    /**
     * When the clinic is open. The booking validator reads these three columns
     * and nothing else, so opening hours are per-clinic data — not a constant
     * someone has to redeploy to change.
     *
     * Weekday numbers match `Date.prototype.getDay()`: 0 = Sunday … 6 = Saturday.
     * The default is Sunday–Thursday, the working week in Asia/Hebron, which is
     * also the clinic time zone in `src/lib/format.ts`.
     */
    workingDays: integer('working_days').array().notNull().default([0, 1, 2, 3, 4]),

    /** Minutes from local midnight. 08:00 and 18:00 by default. */
    openMinute: integer('open_minute').notNull().default(8 * 60),
    closeMinute: integer('close_minute').notNull().default(18 * 60),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A clinic that closes before it opens would make every booking invalid and
    // the grid zero pixels tall. Cheaper to forbid than to defend against.
    check(
      'clinics_hours_ordered',
      sql`${table.openMinute} >= 0 AND ${table.closeMinute} <= 1440 AND ${table.openMinute} < ${table.closeMinute}`,
    ),
  ],
);

export type Clinic = typeof clinics.$inferSelect;
