/**
 * The presentation layer for a food's name.
 *
 * A `FoodSearchResult` carries two names: the Arabic `nameAr` a dietitian (or the
 * alias/translation path) gave it, and the raw USDA `description` — a
 * comma-stacked English string like "Cauliflower, cooked, boiled, drained,
 * without salt". Neither is what the UI should print by default: the description
 * is a database record, not a label, and in Arabic-first screens the English is
 * at best a footnote.
 *
 * This module derives the label the UI actually shows. It is **presentation only**
 * — it never touches the stored nutrition record or the description itself, so a
 * food matched by any source still costs and stores exactly as it did. See spec
 * §19 and §46: the food data needs a friendly display name, not a USDA sentence.
 */

/** The two name fields these helpers read — a subset of `FoodSearchResult`. */
export type DisplayFood = {
  nameAr: string | null;
  description: string;
};

/**
 * A short, human label out of a raw USDA description.
 *
 * USDA descriptions pile qualifiers after commas — the food, then its main
 * preparation, then provenance nobody reads ("drained", "without salt",
 * "unprepared"). The first two comma-segments carry the food and how it is
 * prepared; everything after is dropped. "Cauliflower, cooked, boiled, drained,
 * without salt" becomes "Cauliflower, cooked"; a single-word "Rice" stays "Rice".
 *
 * Deliberately dumb and predictable: keeping exactly two segments can't
 * mistranslate a food the way a cleverer heuristic could, and this only ever runs
 * as a fallback for a food that has no Arabic name at all.
 */
export function conciseFoodName(description: string): string {
  const segments = description
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) return description.trim();
  return segments.slice(0, 2).join(', ');
}

/** True for a locale whose UI reads Arabic-first. */
function isArabic(locale: string): boolean {
  return locale.startsWith('ar');
}

/**
 * The primary label for a food, given the reader's locale.
 *
 * Arabic-first: the Arabic name if there is one, else the concise English as a
 * last resort. English: the concise English, falling back to the Arabic name.
 * The priority in spec §19 — `nameAr → concise local/translated → English
 * fallback` — collapses to this here because a matched food only ever carries the
 * two fields; the alias/translation step upstream is what populates `nameAr`.
 */
export function getFoodDisplayName(food: DisplayFood, locale: string): string {
  const ar = food.nameAr?.trim();
  const concise = conciseFoodName(food.description);

  if (isArabic(locale)) return ar || concise;
  return concise || ar || '';
}

/**
 * The quieter secondary label shown under the primary, or null when it would
 * only repeat it.
 *
 * In Arabic the secondary is the English, but only when a real Arabic name sits
 * above it — otherwise the English is already the primary and there is nothing to
 * add. In English it is the Arabic name, when that differs from what is shown.
 */
export function getFoodSecondaryName(food: DisplayFood, locale: string): string | null {
  const ar = food.nameAr?.trim();
  const concise = conciseFoodName(food.description);

  if (isArabic(locale)) return ar && concise ? concise : null;
  return ar && ar !== concise ? ar : null;
}
