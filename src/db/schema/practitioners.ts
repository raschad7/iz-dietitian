import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { user } from './auth';
import { clinics } from './clinics';

/**
 * Someone appointments can be booked with.
 *
 * A practitioner is a directory entry first and an account second, exactly like
 * `clients`: `user_id` stays null until that person is given a staff login, so a
 * visiting dietitian or a locum who never signs in is still bookable. The
 * alternative — practitioner *is* a `users` row — would put `colour` and
 * `specialty` on the auth table and make "add someone to the rota" mean
 * "create a login".
 *
 * Named for the domain rather than "doctors": this is a dietitian practice, and
 * `clients.assigned_dietitian_id` already speaks that language.
 */
export const practitioners = pgTable(
  'practitioners',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** The owning clinic — the tenant boundary, as everywhere else. */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    /**
     * Staff login, null until one is issued. `set null` means deleting the auth
     * user removes the login without erasing the rota entry or its appointments.
     */
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),

    name: text('name').notNull(),

    /** Free text, not an enum: "Clinical nutrition", "Sports nutrition", "Paediatrics". */
    specialty: text('specialty'),

    /**
     * Colour-codes every appointment block for this practitioner. Stored rather
     * than derived so staff can change it without every historical block moving
     * colour underneath them.
     */
    color: text('color').notNull().default('#0ea5e9'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('practitioners_clinic_id_idx').on(table.clinicId),
    // One login maps to at most one practitioner. Many NULLs are permitted, so
    // practitioners without an account are unconstrained.
    uniqueIndex('practitioners_user_id_idx').on(table.userId),
    // The UI renders this straight into a style attribute and into `color-mix()`.
    // Validating it in Zod alone would leave a hand-written UPDATE free to store
    // `red; --x: url(...)`.
    check('practitioners_color_hex', sql`${table.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

export type Practitioner = typeof practitioners.$inferSelect;
export type NewPractitioner = typeof practitioners.$inferInsert;
