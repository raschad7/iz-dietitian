/**
 * Turns a raw, merged ingredient-search list into what the picker should show:
 * Arabic-first, deduplicated, and ranked (spec §5–7).
 *
 * The input is whatever `searchIngredients` merged from the clinic's foods, the
 * shared USDA library and the translated fallback — a flat list where the shared
 * rows are English and often near-duplicates ("Lentils, …, with salt" /
 * "…, without salt" / "…, sprouted"). This function:
 *
 *   1. gives every row a friendly Arabic label where one can be derived,
 *   2. collapses near-identical USDA variants into one representative, counting
 *      the rest so the UI can offer "عرض N أنواع أخرى",
 *   3. ranks the results — clinic foods and exact Arabic matches first, English-
 *      only rows last.
 *
 * It is pure and presentation-only. The representative it picks is a real
 * `FoodSearchResult`, so picking it stores the same food it always would.
 */

import { deriveArabicFoodName, queryMatchesBase } from './arabic-food-terms';
import { conciseFoodName } from './food-display';
import type { FoodSearchResult } from './queries';

export type RefinedFood = FoodSearchResult & {
  /** The Arabic label to show as primary, or null when only English is available. */
  displayAr: string | null;
  /** True for a clinic food or a row anchored to a recognised Arabic base. */
  matchedArabic: boolean;
  /** How many near-identical variants were collapsed under this one. */
  variantCount: number;
};

type Annotated = {
  food: FoodSearchResult;
  displayAr: string | null;
  base: string;
  matchedArabic: boolean;
  /** True for the clinic's own foods — always ranked first, never merged. */
  isClinicFood: boolean;
  /** True when this representative row carries a usable household portion. */
  hasPortion: boolean;
  groupKey: string;
  cookState: string;
};

/** Annotates one search row with its Arabic identity and dedup key. */
function annotate(food: FoodSearchResult): Annotated {
  const hasPortion = food.portionGrams != null && food.portionGrams > 0;

  // A clinic food already has a real Arabic name — trust it, and never merge it
  // with anything else (its own id is its group).
  if (food.nameAr && food.nameAr.trim()) {
    return {
      food,
      displayAr: food.nameAr.trim(),
      base: food.nameAr.trim(),
      matchedArabic: true,
      isClinicFood: true,
      hasPortion,
      groupKey: `clinic:${food.id}`,
      cookState: '',
    };
  }

  const derived = deriveArabicFoodName(food.description);
  if (derived) {
    return {
      food,
      displayAr: derived.name,
      base: derived.base,
      matchedArabic: true,
      isClinicFood: false,
      hasPortion,
      groupKey: derived.groupKey,
      cookState: '',
    };
  }

  // No Arabic base recognised: keep a concise English label and group English
  // duplicates by that label so the same USDA food twice still shows once.
  const concise = conciseFoodName(food.description);
  return {
    food,
    displayAr: null,
    base: concise,
    matchedArabic: false,
    isClinicFood: false,
    hasPortion,
    groupKey: `en:${concise.toLowerCase()}`,
    cookState: '',
  };
}

/** Within a dedup group, the row that should represent it: clinic first, then a
 *  row with a usable portion, then whatever came first from search. */
function pickRepresentative(group: Annotated[]): Annotated {
  return (
    group.find((entry) => entry.isClinicFood) ??
    group.find((entry) => entry.hasPortion) ??
    group[0]!
  );
}

/** A group's rank against the query — higher sorts first. */
function score(rep: Annotated, query: string): number {
  let value = 0;
  if (rep.isClinicFood) value += 1000;

  const match = queryMatchesBase(query, rep.base);
  if (match === 'exact') value += 500;
  else if (match === 'prefix') value += 250;

  if (rep.matchedArabic) value += 100;
  if (rep.hasPortion) value += 20;

  // A plain or cooked staple is what a dietitian reaches for first; raw and the
  // odder preparations sit below it.
  const derived = deriveArabicFoodName(rep.food.description);
  const cook = derived?.groupKey.split('|')[2] ?? '';
  if (cook === '' || cook === 'cooked') value += 10;
  else if (cook === 'raw') value += 2;

  return value;
}

/**
 * Refines and ranks the merged search list. Stable within equal scores, so the
 * merge's source priority (clinic → shared → translated) still shows through.
 */
export function refineIngredientResults(
  results: readonly FoodSearchResult[],
  query: string,
): RefinedFood[] {
  const annotated = results.map(annotate);

  // Group by dedup key, preserving first-seen order for stability.
  const groups = new Map<string, Annotated[]>();
  for (const entry of annotated) {
    const bucket = groups.get(entry.groupKey);
    if (bucket) bucket.push(entry);
    else groups.set(entry.groupKey, [entry]);
  }

  const reps = [...groups.values()].map((group) => {
    const rep = pickRepresentative(group);
    return { rep, variantCount: group.length - 1 };
  });

  // Decorate with score, then sort by score desc while keeping original order
  // among equals (a stable sort on the index).
  const indexed = reps.map((entry, index) => ({ ...entry, index, value: score(entry.rep, query) }));
  indexed.sort((a, b) => (b.value !== a.value ? b.value - a.value : a.index - b.index));

  return indexed.map(({ rep, variantCount }) => ({
    ...rep.food,
    // Fill the Arabic name so downstream display and the saved row read Arabic.
    nameAr: rep.displayAr ?? rep.food.nameAr,
    displayAr: rep.displayAr,
    matchedArabic: rep.matchedArabic,
    variantCount,
  }));
}
