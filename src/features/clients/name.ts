/**
 * Splitting a stored client name into the two halves the card edits, and
 * putting it back together.
 *
 * Pure: no React, no database. The identity fields call it to fill themselves
 * in, the schemas call it to build the value that gets stored, and
 * `name.test.ts` calls it directly — the same shape as `src/lib/phone-format.ts`,
 * and for the same reason.
 *
 * ⚠ **`clients.fullName` remains the stored column.** The card asks for a first
 * and a last name because that is how the clinic reads a register, but nothing
 * downstream learns about two fields: the register, `searchName`, the portal,
 * WhatsApp and the planner all go on reading one name. A pair of real columns
 * would have been truer to the data and would have touched every one of them.
 */

/**
 * The value that gets stored. A single space between the halves, and nothing
 * clever: both are already trimmed by the schema that calls this.
 */
export function joinName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

/**
 * Reads a stored name back into the two fields.
 *
 * **The first word is the first name and everything after it is the last**, not
 * the other way round and not "the last word". A roster written in Arabic is
 * full of names like `أحمد عبد الرحمن الشريف`, where the last name runs to three
 * words; taking only the final one would put `عبد الرحمن` nowhere and silently
 * drop it the next time the card was saved.
 *
 * ⚠ A remainder longer than `MAX_NAME_PART_LENGTH` (`./form-rules`) is handed back **whole**
 * rather than truncated. The field shows all of it, and the schema refuses the
 * save with a message — which asks whoever opened the card to shorten the name
 * deliberately, instead of this function shortening a patient's name on their
 * behalf while nobody is looking.
 */
export function splitName(fullName: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const trimmed = fullName?.trim() ?? '';
  if (trimmed === '') return { firstName: '', lastName: '' };

  const separator = trimmed.search(/\s/);
  if (separator === -1) return { firstName: trimmed, lastName: '' };

  return {
    firstName: trimmed.slice(0, separator),
    lastName: trimmed.slice(separator + 1).trim(),
  };
}
