import { describe, expect, test } from 'bun:test';

import { normalizeArabic } from '@/features/weekly-plans/arabic-normalize';

/**
 * The merge rules `scripts/export-catalog.ts` depends on.
 *
 * The export has to be a **no-op on an unedited database** — running it must
 * reproduce `data/catalog-foods.json` byte for byte, or every run would commit a
 * diff that says nothing and the real edits would be lost in it. Four things
 * broke that property while it was being written, and each is pinned here.
 *
 * The script itself is not imported: it connects to a database and writes a file
 * on load. These are the pure rules it is built on, asserted directly.
 */

/** The alias merge, as `inFileOrder` implements it. */
function inFileOrder(fromDb: readonly string[], fromFile: readonly string[]): string[] {
  const heldNormalised = new Set(fromDb.map(normalizeArabic));
  const authoredNormalised = new Set(fromFile.map(normalizeArabic));

  const kept = fromFile.filter((name) => heldNormalised.has(normalizeArabic(name)));
  const added = fromDb.filter((name) => !authoredNormalised.has(normalizeArabic(name))).sort();

  return [...kept, ...added];
}

describe('alias merge', () => {
  test('keeps the order the file authored', () => {
    // Sorting these would rewrite all 145 foods to express no change at all.
    expect(inFileOrder(['رز', 'ارز', 'رز ابيض'], ['رز', 'ارز', 'رز ابيض'])).toEqual([
      'رز',
      'ارز',
      'رز ابيض',
    ]);
  });

  /**
   * The one that took three attempts. `catalog_food_aliases` is unique on
   * `(food_id, normalized_name)`, so أرز and ارز are ONE row in the database and
   * two lines in the file. Matching literals dropped the spelling that lost the
   * race — quietly narrowing what a dietitian could type into search.
   */
  test('keeps an authored spelling whose alias survives under a different form', () => {
    expect(inFileOrder(['ارز'], ['ارز', 'أرز'])).toEqual(['ارز', 'أرز']);
  });

  test('still drops an alias that was genuinely removed', () => {
    expect(inFileOrder(['ارز'], ['ارز', 'شيء اخر'])).toEqual(['ارز']);
  });

  test('appends something new, sorted, after what the file already had', () => {
    expect(inFileOrder(['ارز', 'حبوب'], ['ارز'])).toEqual(['ارز', 'حبوب']);
  });

  test('an empty file entry takes the database sorted', () => {
    expect(inFileOrder(['ب', 'ا'], [])).toEqual(['ا', 'ب']);
  });
});

/** The nutrition key order, as `nutritionFor` implements it. */
function nutritionFor(
  values: Record<string, number | null>,
  before: Record<string, unknown> | undefined,
  fallback: readonly string[],
): Record<string, number | null> {
  const authored = before ? Object.keys(before) : [];
  const keys = [...authored, ...fallback.filter((key) => !authored.includes(key))];

  const out: Record<string, number | null> = {};
  for (const key of keys) out[key] = values[key] ?? null;
  return out;
}

describe('nutrition key order', () => {
  const values = { kcal: 365, protein: 7, carbs: 80, fat: 0.7 };
  const fallback = ['kcal', 'protein', 'carbs', 'fat'] as const;

  /**
   * `data/catalog-foods.json` does not have one key order: a USDA-derived food
   * writes `protein, carbs, fat` and the two hand-authored ones write
   * `protein, fat, carbs`. The checksum covers `JSON.stringify`, so key order is
   * part of the file's identity and a fixed list cannot reproduce both.
   */
  test('follows the order the file entry already used', () => {
    const before = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
    expect(Object.keys(nutritionFor(values, before, fallback))).toEqual([
      'kcal',
      'protein',
      'fat',
      'carbs',
    ]);
  });

  test('falls back to the declared order for a food the file has never seen', () => {
    expect(Object.keys(nutritionFor(values, undefined, fallback))).toEqual([
      'kcal',
      'protein',
      'carbs',
      'fat',
    ]);
  });

  test('writes a nutrient the file did not carry as null rather than dropping it', () => {
    // "Never measured" is a fact the file has to be able to state.
    const out = nutritionFor(values, { kcal: 0 }, [...fallback, 'iron']);
    expect(out.iron).toBeNull();
    expect(Object.keys(out)).toContain('iron');
  });
});
