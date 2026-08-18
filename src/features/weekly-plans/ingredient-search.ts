import { refineIngredientResults, type RefinedFood } from './ingredient-refine';
import { loadFoodAliases, searchClinicFoods, searchFoods, type FoodSearchResult } from './queries';

/**
 * One ingredient search over the canonical food catalog.
 *
 * The dietitian sees a single search box and a single list. Behind it there is now
 * a single source: `catalog_foods`, matched on stored Arabic names, stored English
 * names, and stored aliases.
 *
 * **What used to be here, and why it is gone.** The old path searched the clinic's
 * foods, then 7,793 USDA SR Legacy rows by English description, and — when that
 * came up thin — sent the Arabic term to an LLM to be turned into English keywords
 * so USDA could be searched again. Three sources, an AI call on the keystroke path,
 * and a `FOOD_BASES` heuristic guessing an Arabic label back out of whatever USDA
 * returned. That heuristic labelled `Eggplant, raw` as بيض (it matched `egg` before
 * `eggplant`), collapsed 1,176 distinct beef rows onto one entry, and left
 * restaurant meals, baby food and alcohol one substring away from a meal plan.
 *
 * Names and synonyms are data now, so none of that is needed: no AI call, no
 * translation, no runtime guessing, and nothing outside the catalog is reachable.
 *
 * Two calls rather than one so the clinic's own foods keep their priority — a food
 * a clinic added is the one it means — and because the merge is where dedup by id
 * happens.
 */

/** How many results the picker shows. */
const RESULT_LIMIT = 20;

/**
 * Merges result groups into one deduplicated list, source priority preserved.
 *
 * Dedup is by food id: the same food resolved by two sources is one food, shown
 * once, at the position its highest-priority source gave it. Pure and separate
 * from the DB calls so the ordering rule can be pinned down in a test.
 */
export function mergeFoodResults(
  ...groups: readonly (readonly FoodSearchResult[])[]
): FoodSearchResult[] {
  const seen = new Set<string>();
  const out: FoodSearchResult[] = [];

  for (const group of groups) {
    for (const item of group) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }

  return out;
}

/**
 * @param locale The UI language the dietitian is reading. It changes no result and
 *   no visibility — only which results are shown first, and which are folded into
 *   the picker's secondary list. See `ingredient-refine.ts`.
 */
export async function searchIngredients(
  clinicId: string,
  query: string,
  locale: string,
): Promise<RefinedFood[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // The clinic's own foods first, then the shared catalog. Both are indexed
  // queries against a small table; neither leaves the database.
  const [clinic, shared] = await Promise.all([
    searchClinicFoods(clinicId, trimmed),
    searchFoods(clinicId, trimmed),
  ]);

  const merged = mergeFoodResults(clinic, shared);

  // One extra round trip, over the handful of ids that actually came back: a food
  // found *by its synonym* has to be grouped by the language that synonym is
  // written in, and the search result itself does not carry which alias matched.
  const aliases = await loadFoodAliases(merged.map((food) => food.id));

  return refineIngredientResults(merged, trimmed, locale, aliases).slice(0, RESULT_LIMIT);
}
