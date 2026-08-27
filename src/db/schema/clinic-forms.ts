import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { clinics } from './clinics';

/**
 * A clinic's own wording, one row per piece of text it has rewritten.
 *
 * Two kinds of text live here and they are deliberately one table: the labels
 * printed on a bill, and the bodies of the automatic WhatsApp messages. Both
 * answer the same question — "what does this clinic say here instead of what
 * the app says" — and both are read the same way: look up a key, fall back to
 * the built-in copy when there is no row.
 *
 * ## Only what has been changed is stored
 *
 * There is no row per clinic per key. A clinic that has never opened the Forms
 * tab has no rows at all and every reader falls back, which means the app's own
 * copy keeps improving for everybody who has not overridden it — a table seeded
 * with today's wording would freeze every clinic on the day it was created.
 * Clearing a field deletes the row rather than storing an empty string, so
 * "back to the default" is a state that exists.
 *
 * ## The keys are a code-side list, not an enum here
 *
 * `FORM_FIELDS` in `src/features/forms/fields.ts` is the set, and it is what
 * the action validates against. A database enum would make adding a field
 * to the bill a migration, and the keys are a property of the *documents* —
 * which are code — rather than of the data.
 *
 * ⚠ **What is stored is the patient-facing text, in one language.** Bill labels
 * are stored per key and used in both scripts, and message bodies are stored as
 * the Arabic the clinic writes — see `PATIENT_MESSAGE_LOCALE`, which fixes every
 * outgoing message to one language. A clinic that rewrites a message is writing
 * the message its patients receive, not a translation key.
 */
export const clinicForms = pgTable(
  'clinic_forms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    /** Which piece of text — one of `FORM_FIELD_KEYS`. */
    fieldKey: text('field_key').notNull(),
    /** What this clinic says instead. Never empty: an empty edit deletes the row. */
    value: text('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One answer per clinic per field. Two rows for one key would be two
    // versions of a message with nothing to say which is in force.
    uniqueIndex('clinic_forms_clinic_id_field_key_idx').on(table.clinicId, table.fieldKey),
  ],
);

export type ClinicFormRow = typeof clinicForms.$inferSelect;
