/**
 * The dietitian's note about a client, which is one thing stored in two columns.
 *
 * `clients.medical_notes` and `clients.notes` were two textareas on the intake
 * dialog, sitting under one heading, both private to the clinic, both free
 * prose, and distinguished only by their labels — so which one a note belonged
 * in was a guess, and reading a record meant reading both. The dialog writes a
 * single field now.
 *
 * ⚠ **The `notes` column is not dropped, and nothing already written is
 * thrown away.** A record saved before this merge can hold text in both, so
 * every surface that reads a note reads it through {@link mergedNotes}, and the
 * dialog prefills the merged text. Saving then writes it all back to
 * `medical_notes` and leaves `notes` empty — the record converges the first time
 * anyone edits it, with no migration and nothing lost in between.
 *
 * Drop `clients.notes` in a migration once no rows still carry it.
 */
export function mergedNotes(
  medicalNotes: string | null,
  notes: string | null,
): string | null {
  /*
   * A blank line between them, not a space. Both halves are multi-line prose,
   * and joining two paragraphs with a space produces one paragraph that reads
   * as a single thought written by someone who did not press enter.
   */
  const merged = [medicalNotes?.trim(), notes?.trim()]
    .filter((part) => part !== undefined && part !== '')
    .join('\n\n');

  return merged === '' ? null : merged;
}
