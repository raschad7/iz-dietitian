/**
 * One normalized key for the many ways the same food name gets typed.
 *
 * Used wherever two Arabic (or English) food names have to be compared and must
 * not depend on exact keystrokes — search matching, alias lookup, and duplicate
 * prevention when a clinic adds a custom food. Pure and dependency-free, so
 * `arabic-normalize.test.ts` asserts every rule directly and any call site
 * (query, mutation, seed) can reuse it without a database.
 *
 * **Deliberately conservative.** It folds the transformations that are the same
 * word written differently — the alef hamza forms, vowel marks, kashida
 * stretching, stray whitespace — and nothing else. `ة`/`ه` and `ى`/`ي` are left
 * untouched: collapsing them merges words that are not the same, and a false
 * match here hides a real food or silently drops a legitimate custom entry,
 * which is worse than a duplicate slipping through. Synonyms
 * (`دجاج` ↔ `جاج`, `لبن` ↔ `زبادي`) are an alias concern, not a normalization
 * one — see `food_aliases`.
 *
 * **Deferred: DB-level normalized uniqueness.** Callers dedupe by normalizing in
 * app code and checking before they write (`createCustomFood`, `rememberFoodAlias`
 * in `catalog-mutations.ts`). That leaves a narrow check-then-insert race under
 * two simultaneous creates of the same name, which a stored `normalized_name` /
 * `normalized_alias` column with a unique index would close. It is intentionally
 * not built yet: it needs a migration and a backfill, and the real workload is
 * one dietitian saving one form, not concurrent writers. The uniqueness the
 * catalog needs today is an integrity nicety, not a correctness guarantee under
 * contention — when that changes, add the column and index.
 */

/**
 * Arabic diacritics removed before comparison: the harakat block (fathatan…
 * sukun and the Quranic marks around it), the standalone shadda, and the
 * superscript alef. Removing these makes a fully-vowelled spelling compare equal
 * to the bare consonants a dietitian usually types.
 */
const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]/g;

/** Tatweel / kashida — a purely cosmetic stretch between letters. */
const TATWEEL = /ـ/g;

/** أ إ آ ٱ → ا. The four alef forms that are the same letter for search. */
const ALEF_FORMS = /[أإآٱ]/g;

export function normalizeArabic(input: string): string {
  return input
    .normalize('NFC')
    .replace(TATWEEL, '')
    .replace(TASHKEEL, '')
    .replace(ALEF_FORMS, 'ا')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
