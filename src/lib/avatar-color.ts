/**
 * Colours for generated initials avatars and practitioner colour-coding.
 *
 * Picked to stay distinguishable from one another and to carry white text at
 * the weights used in the calendar. Stored on the row rather than derived at
 * render time, so renaming a client does not change the colour staff have
 * learned to recognise — this module only chooses the initial value.
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

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value);
}

/**
 * FNV-1a over a string's code points.
 *
 * Tiny, deterministic, and it spreads similar names (‏"أحمد خليل" / "أحمد
 * خالد") across different buckets, which a length- or first-letter-based
 * choice would not. `>>> 0` keeps the value unsigned so a modulo of it cannot
 * return a negative index.
 *
 * Shared with the calendar's patient colours (`src/features/booking/patient-color.ts`)
 * so the two never drift into two different notions of "stable for this seed".
 */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/** A stable colour for a name. */
export function pickAvatarColor(seed: string): string {
  return AVATAR_PALETTE[hashSeed(seed) % AVATAR_PALETTE.length] ?? AVATAR_PALETTE[0];
}

/**
 * Distinct colours for a list, falling back to the palette in order.
 *
 * Used when seeding practitioners: with a handful of them, "never two the same"
 * matters more than "stable for this name".
 */
export function paletteColorAt(index: number): string {
  return AVATAR_PALETTE[index % AVATAR_PALETTE.length] ?? AVATAR_PALETTE[0];
}
