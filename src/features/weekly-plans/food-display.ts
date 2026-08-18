/**
 * Which stored name to print, given the reader's locale.
 *
 * Every name in the catalog is now data: a food carries `name_ar` and `name_en`,
 * a dish carries both, a portion carries `label_ar` and `label_en`. So this module
 * *chooses*; it no longer derives. What it replaced was `conciseFoodName`, which
 * cut a USDA description ("Cauliflower, cooked, boiled, drained, without salt")
 * down to something printable, and the Arabic heuristic behind it that guessed a
 * name out of the English and labelled `Eggplant, raw` as بيض.
 *
 * Two rules hold everywhere:
 *
 *   - **An alias is never a label.** Synonyms exist so a dietitian can *find* a
 *     food by whatever they call it; the food is still displayed under its
 *     canonical name, so two dietitians looking at the same plan read the same
 *     word.
 *   - **Never render blank.** A clinic food migrated without an English name falls
 *     back to the Arabic one and vice versa. A missing translation shows the name
 *     that exists, not an empty cell.
 */

/** A thing with a name in each language. Foods, dishes and portions all qualify. */
export type BilingualNames = {
  nameAr: string | null | undefined;
  nameEn: string | null | undefined;
};

/** True for a locale whose UI reads Arabic-first. */
export function isArabicLocale(locale: string): boolean {
  return locale.startsWith('ar');
}

/**
 * The name to show, in the reader's language, falling back to the other one.
 *
 * The fallback is explicit rather than incidental: clinic foods created before
 * the English name became optional carry only Arabic, and printing nothing for
 * them would lose an ingredient off a recipe rather than merely showing it in the
 * wrong language.
 */
export function localizedName(names: BilingualNames, locale: string): string {
  const ar = names.nameAr?.trim() ?? '';
  const en = names.nameEn?.trim() ?? '';

  return isArabicLocale(locale) ? ar || en : en || ar;
}

/**
 * The quieter second line under the primary name, or null when it would only
 * repeat it.
 *
 * Null — not an empty string — so a caller renders no element at all rather than
 * an empty one that still takes a line's height.
 */
export function secondaryName(names: BilingualNames, locale: string): string | null {
  const ar = names.nameAr?.trim() ?? '';
  const en = names.nameEn?.trim() ?? '';
  const primary = localizedName(names, locale);
  const other = isArabicLocale(locale) ? en : ar;

  return other && other !== primary ? other : null;
}

/** A portion's label — `labelAr` / `labelEn` rather than `nameAr` / `nameEn`. */
export function localizedPortionLabel(
  portion: { labelAr: string | null; labelEn: string | null },
  locale: string,
): string {
  return localizedName({ nameAr: portion.labelAr, nameEn: portion.labelEn }, locale);
}
