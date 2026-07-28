/**
 * Arabic orthographic folding for search.
 *
 * `ilike '%احمد%'` does not match a name stored as `أحمد`. Arabic is the default
 * locale here, so a search that misses the most common spelling variant is a
 * broken feature rather than an edge case.
 *
 * The same function normalises both what is written to `clients.search_name` and
 * what is typed into the search box, so the two can never drift apart. That is
 * also why this is TypeScript rather than a PostgreSQL generated column: one
 * implementation, one language.
 */

/** Tashkeel (U+064B–U+0652) plus superscript alef (U+0670). */
const ARABIC_DIACRITICS = /[ً-ْٰ]/gu;

/** أ إ آ ٱ → ا */
const ALEF_VARIANTS = /[أإآٱ]/gu;

/** ى → ي */
const ALEF_MAQSURA = /ى/gu;

/** ة → ه */
const TAA_MARBUTA = /ة/gu;

export function normalizeForSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, '')
    .replace(ALEF_VARIANTS, 'ا')
    .replace(ALEF_MAQSURA, 'ي')
    .replace(TAA_MARBUTA, 'ه');
}
