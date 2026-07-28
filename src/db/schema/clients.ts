import { date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { clinics } from './clinics';

/**
 * A client of the clinic.
 *
 * A client is a clinical record first and an account second: `user_id` stays
 * null until staff grants portal access, so clients with no email address — walk
 * ins, children, anyone whose relative books for them — are first class.
 *
 * Enum-like columns are `text` validated by Zod rather than `pgEnum`, following
 * the precedent set by `users.role`: `goal` and `activity_level` are exactly the
 * columns a practising dietitian will want to extend.
 */
export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The owning clinic — the tenant boundary. Every query in
     * `src/features/clients/` filters on this, so two dietitians who signed up
     * independently never see each other's clients.
     */
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),

    fullName: text('full_name').notNull(),

    /**
     * `full_name` run through `normalizeForSearch`. Written on every create and
     * update; never edited by hand. See `src/features/clients/search.ts`.
     */
    searchName: text('search_name').notNull(),

    phone: text('phone'),

    /**
     * Nullable and NOT unique — family members share inboxes. Uniqueness is
     * enforced where it actually matters, on `users.email`, at invite time.
     */
    email: text('email'),

    /**
     * Portal account, null until invited. `set null` means deleting the auth
     * user revokes access without touching the clinical record.
     */
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),

    /** Written today, read by nobody: makes adding a team a UI change, not a migration. */
    assignedDietitianId: text('assigned_dietitian_id').references(() => user.id, { onDelete: 'set null' }),

    /** active | archived. Clients are archived, never deleted — they own history. */
    status: text('status').notNull().default('active'),

    /** Locale for this client's portal account and magic-link emails. ar | en */
    preferredLocale: text('preferred_locale').notNull().default('ar'),

    /**
     * A birthday is a calendar date, not an instant. Stored as `date` and read
     * as a string, so it cannot shift a day across time zones.
     */
    dateOfBirth: date('date_of_birth', { mode: 'string' }),

    /** female | male */
    sex: text('sex'),

    heightCm: integer('height_cm'),

    /** weight_loss | weight_gain | maintenance | medical | sports */
    goal: text('goal'),

    /** sedentary | light | moderate | active | very_active */
    activityLevel: text('activity_level'),

    medicalNotes: text('medical_notes'),
    allergies: text('allergies'),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One portal login maps to at most one client. PostgreSQL permits many NULLs
    // in a unique index, so uninvited clients are unconstrained.
    uniqueIndex('clients_user_id_idx').on(table.userId),
    // Every list query filters by clinic first, so this is the index that matters.
    index('clients_clinic_id_status_idx').on(table.clinicId, table.status),
    // No index on search_name: `ilike '%…%'` cannot use a btree. At one clinic's
    // scale a sequential scan is the right plan; pg_trgm is the upgrade path.
  ],
);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
