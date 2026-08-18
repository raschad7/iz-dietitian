import { describe, expect, test } from 'bun:test';

import { refineIngredientResults, type AliasIndex } from './ingredient-refine';
import { normalizeArabic } from './arabic-normalize';
import type { FoodPortion } from './ingredient-units';
import type { FoodSearchResult } from './queries';

/**
 * Ranking for the ingredient picker.
 *
 * This file used to test the opposite thing: that a list of raw USDA rows could be
 * collapsed into something readable — nine kinds of lentil into one عدس, an English
 * description turned into an Arabic label by `deriveArabicFoodName`. All of that is
 * gone. Names are stored, one entry per real food, and preparation states are
 * deliberately separate rows rather than variants to merge.
 *
 * What is left to assert is the ordering, that nothing invents a label, and that
 * nothing quietly picks between a raw food and its cooked counterpart.
 */

/** The two UI languages, spelled out so a test reads as the screen it is about. */
const AR = 'ar';
const EN = 'en';

/** An alias index in the shape `searchIngredients` builds from `loadFoodAliases`. */
function aliasIndex(entries: Record<string, [string, 'ar' | 'en'][]>): AliasIndex {
  return new Map(
    Object.entries(entries).map(([foodId, aliases]) => [
      foodId,
      aliases.map(([name, locale]) => ({
        foodId,
        name,
        normalizedName: normalizeArabic(name),
        locale,
      })),
    ]),
  );
}

function portion(id: string, labelAr: string, labelEn: string, grams: number): FoodPortion {
  return { id, labelAr, labelEn, grams, isDefault: true, sortOrder: 0 };
}

function food(overrides: Partial<FoodSearchResult> & { id: string }): FoodSearchResult {
  return {
    nameAr: 'طعام',
    nameEn: 'Test food',
    clinicId: null,
    state: 'raw',
    category: 'other',
    verificationStatus: 'verified',
    portions: [],
    kcal: 100,
    protein: 5,
    carbs: 10,
    fat: 2,
    fiber: null,
    sugar: null,
    saturatedFat: null,
    cholesterol: null,
    sodium: null,
    calcium: null,
    iron: null,
    potassium: null,
    ...overrides,
  };
}

const lentilsCooked = food({
  id: 'lentils-cooked',
  nameAr: 'عدس مطبوخ',
  nameEn: 'Lentils, cooked',
  state: 'cooked',
  category: 'legumes',
});

const lentilsDry = food({
  id: 'lentils-dry',
  nameAr: 'عدس ناشف',
  nameEn: 'Lentils, dry',
  state: 'dry',
  category: 'legumes',
});

const pita = food({
  id: 'pita-white',
  nameAr: 'خبز عربي أبيض',
  nameEn: 'White pita bread',
  category: 'grains',
  portions: [portion('pita-loaf', 'رغيف', 'Loaf', 60)],
});

const flour = food({
  id: 'wheat-flour',
  nameAr: 'طحين أبيض',
  nameEn: 'White wheat flour',
  category: 'grains',
});

describe('refineIngredientResults', () => {
  test('carries the stored names through untouched', () => {
    const [row] = refineIngredientResults([lentilsCooked], 'عدس', AR);

    expect(row!.nameAr).toBe('عدس مطبوخ');
    expect(row!.nameEn).toBe('Lentils, cooked');
    expect(row!.matchesLocale).toBe(true);
  });

  test('a food found only by its English name is secondary in an Arabic UI', () => {
    const [row] = refineIngredientResults([flour], 'flour', AR);

    expect(row!.matchesLocale).toBe(false);
  });

  /**
   * Raw, dry and cooked are different foods with different nutrition per 100 g. The
   * old pipeline collapsed near-identical USDA rows into one representative; doing
   * that here would hide the distinction the catalog was built to make — and
   * choosing one on the dietitian's behalf would be worse still.
   */
  test('keeps dry and cooked as separate results rather than merging or choosing', () => {
    const results = refineIngredientResults([lentilsCooked, lentilsDry], 'عدس', AR);

    expect(results).toHaveLength(2);
    expect(results.map((row) => row.id).sort()).toEqual(['lentils-cooked', 'lentils-dry']);
    // Both stay visibly distinct by name and by state — nothing is promoted.
    expect(results.map((row) => row.state).sort()).toEqual(['cooked', 'dry']);
    expect(new Set(results.map((row) => row.nameAr)).size).toBe(2);
  });

  test('an exact Arabic name match sorts first', () => {
    const results = refineIngredientResults([flour, pita], 'خبز عربي أبيض', AR);

    expect(results[0]!.id).toBe('pita-white');
  });

  test('a food carrying a household portion outranks one that does not, all else equal', () => {
    const noPortion = food({ id: 'no-portion', nameAr: 'خبز', nameEn: 'Bread' });
    const withPortion = food({
      id: 'with-portion',
      nameAr: 'خبز',
      nameEn: 'Bread',
      portions: [portion('p', 'رغيف', 'Loaf', 60)],
    });

    const results = refineIngredientResults([noPortion, withPortion], 'خبز', AR);

    expect(results[0]!.id).toBe('with-portion');
  });

  test('is stable within equal scores, so the merge order shows through', () => {
    const a = food({ id: 'a', nameAr: 'شيء', nameEn: 'Thing A' });
    const b = food({ id: 'b', nameAr: 'شيء', nameEn: 'Thing B' });

    expect(refineIngredientResults([a, b], 'لا شيء مطابق', AR).map((row) => row.id)).toEqual(['a', 'b']);
    expect(refineIngredientResults([b, a], 'لا شيء مطابق', AR).map((row) => row.id)).toEqual(['b', 'a']);
  });

  test('an empty list refines to an empty list', () => {
    expect(refineIngredientResults([], 'عدس', AR)).toEqual([]);
  });
});

/**
 * Which of the picker's two lists a result lands in.
 *
 * The rule is "did this row come back because of something written in the language
 * being read", and before this pass it was "does the canonical Arabic name contain
 * the query" — which is a different question in three of the four cases below, and
 * wrong in all three.
 */
describe('locale-aware grouping', () => {
  const tomato = food({
    id: 'tomato-raw',
    nameAr: 'بندورة',
    nameEn: 'Tomato, raw',
    category: 'vegetables',
  });

  const aliases = aliasIndex({
    'tomato-raw': [
      ['طماطم', 'ar'],
      ['tomatoes', 'en'],
    ],
  });

  test('an Arabic alias makes an Arabic search a primary result', () => {
    // بندورة does not contain طماطم anywhere. The alias is the only reason this
    // row came back, and it is Arabic, so an Arabic UI must lead with it.
    const [row] = refineIngredientResults([tomato], 'طماطم', AR, aliases);

    expect(row!.nameAr).toBe('بندورة');
    expect(row!.matchesLocale).toBe(true);
  });

  test('an English alias makes an English search a primary result', () => {
    const [row] = refineIngredientResults([tomato], 'tomatoes', EN, aliases);

    expect(row!.matchesLocale).toBe(true);
  });

  test('an English UI does not demote a plain English name match', () => {
    const [row] = refineIngredientResults([tomato], 'tomato', EN, aliases);

    expect(row!.matchesLocale).toBe(true);
  });

  test('an Arabic UI does not demote a plain Arabic name match', () => {
    const [row] = refineIngredientResults([tomato], 'بندورة', AR, aliases);

    expect(row!.matchesLocale).toBe(true);
  });

  test('the same row is primary or secondary depending only on the UI language', () => {
    const [inArabic] = refineIngredientResults([tomato], 'طماطم', AR, aliases);
    const [inEnglish] = refineIngredientResults([tomato], 'طماطم', EN, aliases);

    expect(inArabic!.matchesLocale).toBe(true);
    // Same food, same query, English UI: it matched nothing written in English,
    // so it is folded under "more results" rather than hidden.
    expect(inEnglish!.matchesLocale).toBe(false);
    expect(inEnglish!.id).toBe('tomato-raw');
  });

  test("an alias in the other language does not promote a row", () => {
    const onlyEnglishAlias = aliasIndex({ 'tomato-raw': [['tomatoes', 'en']] });

    const [row] = refineIngredientResults([tomato], 'tomatoes', AR, onlyEnglishAlias);

    expect(row!.matchesLocale).toBe(false);
  });

  test('a locale match outranks one in the other language', () => {
    const englishOnly = food({ id: 'en-only', nameAr: 'شيء', nameEn: 'Tomato paste' });

    const results = refineIngredientResults([englishOnly, tomato], 'طماطم', AR, aliases);

    expect(results[0]!.id).toBe('tomato-raw');
  });
});
