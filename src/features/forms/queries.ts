import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { clinicForms } from '@/db/schema';

import { MESSAGE_FORM_FIELDS, type ClinicForms } from './fields';

/**
 * Reads and writes for the clinic's own wording.
 *
 * Imports nothing from Next.js so `bun test` can call these directly — the same
 * split every other feature keeps. `actions.ts` adds the session guard and the
 * revalidation on top.
 *
 * `clinicId` is the first argument of everything here, so forgetting the tenant
 * boundary is a type error rather than a leak.
 */

/**
 * Every override a clinic has, as a map from field key to text.
 *
 * A map rather than rows, because every reader asks the same question — "what
 * does this clinic say for this key" — and a clinic has at most a couple of
 * dozen rows. It is also the shape the fallback wants: `forms[key] ?? default`
 * needs no lookup helper.
 *
 * An empty object is the normal state, not an error: a clinic that has never
 * opened the Forms tab has no rows, and every reader falls back to the app's
 * own copy.
 */
export async function clinicFormOverrides(clinicId: string): Promise<ClinicForms> {
  const rows = await db
    .select({ fieldKey: clinicForms.fieldKey, value: clinicForms.value })
    .from(clinicForms)
    .where(eq(clinicForms.clinicId, clinicId));

  return Object.fromEntries(rows.map((row) => [row.fieldKey, row.value]));
}

/**
 * The clinic's own body for one automatic message, or `undefined` when it uses
 * the app's.
 *
 * Takes the WhatsApp template kind rather than a form key, because the caller
 * is `sendWhatsappTemplate` and that is what it holds — the mapping between the
 * two lives here, in the feature that owns the keys, rather than in the sender.
 *
 * A kind nobody can edit — the reminder, the series, the bill documents —
 * returns `undefined` without a query. That is not an optimisation: it is what
 * keeps a message out of the editor's reach until it is deliberately put in
 * `MESSAGE_FORM_FIELDS`.
 */
export async function clinicMessageBody(
  clinicId: string,
  kind: string,
): Promise<string | undefined> {
  const field = MESSAGE_FORM_FIELDS.find((entry) => entry.message === kind);
  if (!field) return undefined;

  const [row] = await db
    .select({ value: clinicForms.value })
    .from(clinicForms)
    .where(and(eq(clinicForms.clinicId, clinicId), eq(clinicForms.fieldKey, field.key)))
    .limit(1);

  return row?.value;
}
