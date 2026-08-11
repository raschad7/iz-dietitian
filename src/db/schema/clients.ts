import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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

    /**
     * **Legacy. Nothing reads this, and nothing writes it any more.**
     *
     * A client's colour is now their position in the clinic — `clientSeq` in
     * `src/features/clients/seq.ts` — turned into a hue by
     * `src/features/booking/patient-color.ts` and drawn through the
     * `.patient-tone` ramp. That is what the register, the record header, both
     * client pickers, the planner rail and every appointment block use, so a
     * patient is one colour everywhere.
     *
     * This column was the other answer: a hash of the name into a fixed
     * ten-colour palette, which wrapped on the eleventh client, and a grey
     * default behind it for every row nobody assigned one to — including every
     * client added from the register, which never wrote it at all. Two colours
     * for one patient is the bug; this is the half that lost.
     *
     * Kept rather than dropped so no data goes with the change. Dropping it is
     * a `db:generate` away once that is wanted, along with `clients_color_hex`
     * below and the `.color` writes in `scripts/seed.ts`.
     */
    color: text('color').notNull().default('#64748b'),

    /**
     * A photo of the client, as a path this app serves — `/avatars/hiba.jpg`.
     *
     * Null is the normal case and always will be: most clients never upload
     * one, so every surface that shows a face falls back to the initials the
     * `color` above was added for. A photo is a nicety, never a requirement.
     *
     * A path and not the bytes: images do not belong in a row, and the portal
     * only ever needs to hand one to an `<img>`. There is no upload flow yet —
     * this is set by whoever puts the file where it can be served.
     */
    photoUrl: text('photo_url'),

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

    /**
     * The dietitian's own working notes. **Never shown to the client** — see
     * `getPortalClient` in `src/features/portal/queries.ts`, which deliberately
     * does not select them.
     */
    medicalNotes: text('medical_notes'),
    notes: text('notes'),

    /**
     * The part of the clinical record the client is meant to read.
     *
     * These four are a different kind of column from `medical_notes` and
     * `notes` above, and the split is the whole point: a dietitian writes
     * `medical_notes` for themselves and these for the person they are about.
     * The portal's profile screen renders them verbatim, so anything written
     * here is written to the client.
     *
     * Still practitioner-owned: the client reads them and cannot edit them.
     * Correcting one goes through `client_requests`, not through the portal.
     *
     * `allergies` predates the others and was already portal-visible, which is
     * why it sits in this group rather than with the private pair.
     */
    allergies: text('allergies'),
    /** Standing conditions the client should see recorded — not a diagnosis log. */
    conditions: text('conditions'),
    /** Medicines and supplements the plan is built around. */
    medications: text('medications'),
    /** What the dietitian wants this client to keep in mind between visits. */
    careNote: text('care_note'),

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

    // Rendered straight into a style attribute, so the shape is enforced here
    // and not only in Zod — see the same check on `practitioners.color`.
    check('clients_color_hex', sql`${table.color} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
