/**
 * The practitioner palette: a colour per member of staff.
 *
 * Picked to stay distinguishable from one another and to carry white text at
 * the weights used in the calendar. Stored on the row rather than derived at
 * render time, so renaming a practitioner does not change the colour staff have
 * learned to recognise — this module only chooses the initial value.
 *
 * **Patients are not coloured from here.** They were, and that was the bug: a
 * name hashed into ten colours wraps on the eleventh person and has no relation
 * to the hue their appointments are drawn in. A patient's colour is their
 * position in the clinic (`src/features/clients/seq.ts`) turned into a hue by
 * `src/features/booking/patient-color.ts`, which is unique per client and is
 * what every surface that draws a patient reads. Don't point a patient at this
 * file again.
 */

export const AVATAR_PALETTE = [
  '#0ea5e9', // sky
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f97316', // orange
  '#10b981', // emerald
  '#f59e0b', // amber
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#ef4444', // red
  '#84cc16', // lime
] as const;

/**
 * Distinct colours for a list, falling back to the palette in order.
 *
 * With a handful of practitioners, "never two the same" matters more than
 * "stable for this name" — which is the other reason this is the wrong shape for
 * a register of hundreds of patients.
 */
export function paletteColorAt(index: number): string {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length] ?? AVATAR_PALETTE[0];
}
