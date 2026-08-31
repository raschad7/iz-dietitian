import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/db';
import { clinicForms } from '@/db/schema';

/**
 * Save one screenful of the Forms tab.
 *
 * ## Why it takes a set and not a field
 *
 * The editor is a dialog holding every label on the bill, or one whole message.
 * Saving is one press, so it is one write: a field-at-a-time API would leave a
 * half-saved bill on the first failure, and the reader would have no way to know
 * which half.
 *
 * ## Blank means "back to the default"
 *
 * An empty value deletes the row rather than storing `''`. That is what makes
 * the default reachable again — a clinic that clears a footer wants the app's
 * footer back, not a bill with a blank line where one used to be. It is also
 * why nothing here writes a row per key up front: absence is a meaningful state
 * and the table only holds what a clinic has actually changed.
 *
 * ## The delete and the upsert are one transaction
 *
 * Both halves of a save describe one intent. Clearing three labels and
 * rewording a fourth must not be able to land as "the three are gone but the
 * fourth is unchanged", which is a bill nobody asked for.
 */
export async function saveClinicForms(
  clinicId: string,
  /** Every field the editor had open, at the value it was left at. */
  entries: readonly { fieldKey: string; value: string }[],
): Promise<void> {
  const cleared = entries.filter((entry) => entry.value.trim() === '').map((entry) => entry.fieldKey);
  const written = entries
    .map((entry) => ({ fieldKey: entry.fieldKey, value: entry.value.trim() }))
    .filter((entry) => entry.value !== '');

  if (cleared.length === 0 && written.length === 0) return;

  await db.transaction(async (tx) => {
    if (cleared.length > 0) {
      await tx
        .delete(clinicForms)
        .where(
          and(eq(clinicForms.clinicId, clinicId), inArray(clinicForms.fieldKey, cleared)),
        );
    }

    if (written.length > 0) {
      await tx
        .insert(clinicForms)
        .values(written.map((entry) => ({ clinicId, ...entry })))
        /* The unique index on (clinic, key) is what makes this an update rather
           than a second answer to the same question — see the table's note. */
        .onConflictDoUpdate({
          target: [clinicForms.clinicId, clinicForms.fieldKey],
          /* `excluded.value` is the row Postgres could not insert — the new
             text. A fragment because Drizzle's `set` takes column values, and
             the alternative is one statement per field. */
          set: { value: sql`excluded.value`, updatedAt: new Date() },
        });
    }
  });
}

