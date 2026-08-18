/**
 * Ranks and groups the merged ingredient-search list for the picker.
 *
 * Presentation only, and deliberately small. What used to live here is gone with
 * the canonical catalog:
 *
 *   - **Derivation.** `deriveArabicFoodName` guessed an Arabic label out of a USDA
 *     English description and got `Eggplant, raw` wrong — `egg` is checked before
 *     `eggplant` in `FOOD_BASES`, so eggplant was labelled بيض. Names are stored now.
 *   - **Variant collapsing.** It existed because USDA held 1,176 beef rows and nine
 *     kinds of lentil. The catalog holds one entry per real food.
 *
 * What is left is ordering and one grouping decision, and it is careful about two
 * things in particular.
 *
 * **Preparation states are never merged and never chosen between.** A search for رز
 * returns أرز أبيض ناشف and أرز أبيض مطبوخ as two results, each under its own name.
 * They carry different nutrition per 100 g, so picking one for the dietitian would
 * be making a clinical decision on their behalf from a three-letter query.
 *
 * **A match through an alias is a match in that alias's language.** The picker
 * shows results the reader's own language matched first and folds the rest into a
 * quiet secondary section. That test used to read the canonical Arabic *name* and
 * nothing else, which demoted every food found by a synonym: a search for طماطم
 * finds بندورة through its Arabic alias, and بندورة does not contain طماطم, so the
 * one result a dietitian typing Arabic wanted arrived collapsed under "more
 * results (English)". Aliases are half the reason the catalog stores synonyms at
 * all, so they count here exactly as the canonical name does.
 */

import { normalizeArabic } from './arabic-normalize';
import { isArabicLocale } from './food-display';
import type { FoodAlias, FoodSearchResult } from './queries';

export type RefinedFood = FoodSearchResult & {
  /**
   * True when the row matched on a name or alias **in the reader's own language**.
   *
   * The picker's primary list. False rows are still results and still shown — one
   * fold down, because a dietitian working in Arabic who typed Arabic did not ask
   * for the English half of the catalog first.
   */
  matchesLocale: boolean;
};

/** Every alias a food carries, by food id. Empty is normal — most foods have none. */
export type AliasIndex = ReadonlyMap<string, readonly FoodAlias[]>;

const NO_ALIASES: readonly FoodAlias[] = [];

/** The aliases of one food written in one language. */
function aliasesIn(aliases: AliasIndex, foodId: string, locale: string): readonly FoodAlias[] {
  const wanted = isArabicLocale(locale) ? 'ar' : 'en';
  return (aliases.get(foodId) ?? NO_ALIASES).filter((alias) => alias.locale === wanted);
}

/**
 * Whether this row came back because of something written in the reader's
 * language — its canonical name in that language, or one of its synonyms in it.
 */
export function matchesLocale(
  food: FoodSearchResult,
  normalizedQuery: string,
  locale: string,
  aliases: AliasIndex,
): boolean {
  if (!normalizedQuery) return true;

  const name = isArabicLocale(locale) ? food.nameAr : food.nameEn;
  if (normalizeArabic(name).includes(normalizedQuery)) return true;

  return aliasesIn(aliases, food.id, locale).some((alias) =>
    alias.normalizedName.includes(normalizedQuery),
  );
}

/** A row's rank against the query — higher sorts first. */
function score(
  food: FoodSearchResult,
  normalizedQuery: string,
  locale: string,
  aliases: AliasIndex,
): number {
  let value = 0;

  const nameAr = normalizeArabic(food.nameAr);
  const nameEn = normalizeArabic(food.nameEn);

  if (nameAr === normalizedQuery || nameEn === normalizedQuery) value += 500;
  else if (nameAr.startsWith(normalizedQuery) || nameEn.startsWith(normalizedQuery)) value += 250;

  // A hit in the language being read outranks one in the other, whether it landed
  // on the canonical name or on a synonym — the same rule the grouping applies,
  // so the order inside the primary list agrees with which list a row is in.
  if (matchesLocale(food, normalizedQuery, locale, aliases)) value += 100;

  // A food that carries a household measure is one a dietitian can enter without
  // reaching for a scale. A tie-break, not a ranking of its own.
  if (food.portions.length > 0) value += 20;

  return value;
}

/**
 * Ranks the merged search list and marks each row's language. Stable within equal
 * scores, so the merge's source priority (clinic foods before shared) still shows
 * through — which is what keeps a clinic's own food above the shared one it was
 * added to replace.
 */
export function refineIngredientResults(
  results: readonly FoodSearchResult[],
  query: string,
  locale: string,
  aliases: AliasIndex = new Map(),
): RefinedFood[] {
  const normalizedQuery = normalizeArabic(query);

  const indexed = results.map((food, index) => ({
    food,
    index,
    value: score(food, normalizedQuery, locale, aliases),
  }));

  indexed.sort((a, b) => (b.value !== a.value ? b.value - a.value : a.index - b.index));

  return indexed.map(({ food }) => ({
    ...food,
    matchesLocale: matchesLocale(food, normalizedQuery, locale, aliases),
  }));
}
