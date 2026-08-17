import { findFoodMatches } from './food-matching';
import type { FoodTranslator } from './food-translate';
import { refineIngredientResults, type RefinedFood } from './ingredient-refine';
import { searchClinicFoods, searchFoods, type FoodSearchResult } from './queries';

/**
 * One ingredient search over every internal source.
 *
 * The dietitian sees a single search box and a single list. Behind it, results
 * come from the clinic's own foods, the shared library, and — for an Arabic name
 * the library does not have yet — the alias/translated USDA path. The old UI
 * exposed that seam as a "search USDA instead" toggle and made the dietitian pick
 * a source; there is no reason she should have to. The source is an
 * implementation detail, so it stays one.
 *
 * Priority, cheapest and most local first (spec §13): the clinic's own foods, then
 * the shared library, then the translated USDA fallback — which only runs when the
 * local sources come up thin, so a well-stocked library never pays for an AI call
 * on a keystroke.
 */

/** How many results the picker shows. */
const RESULT_LIMIT = 20;

/**
 * Below this many local hits, reach for the translate+USDA fallback. Above it the
 * library already answered, and the AI translation is skipped — it is the one
 * costly, latent step in the path and should not fire when it is not needed.
 */
const TRANSLATE_THRESHOLD = 8;

/**
 * Merges result groups into one deduplicated list, source priority preserved.
 *
 * Dedup is by food id: the same food resolved by two sources is one food, shown
 * once, at the position its highest-priority source gave it. Pure and separate
 * from the DB/AI calls so the ordering rule can be pinned down in a test.
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

export async function searchIngredients(
  clinicId: string,
  query: string,
  deps: { translator?: FoodTranslator } = {},
): Promise<RefinedFood[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Local first: the clinic's own foods (matched on Arabic name too) and the
  // shared library (matched on English description). Cheap, offline, no AI.
  const [clinic, shared] = await Promise.all([
    searchClinicFoods(clinicId, trimmed),
    searchFoods(clinicId, trimmed),
  ]);
  let merged = mergeFoodResults(clinic, shared);

  // Only when the library is thin: bridge an Arabic name to the USDA library via a
  // confirmed alias (cheap) or a one-off translation (the AI step). `findFoodMatches`
  // already gates the AI call behind the alias lookup, so a remembered name pays
  // nothing.
  if (merged.length < TRANSLATE_THRESHOLD) {
    const { matches } = await findFoodMatches(clinicId, trimmed, deps);
    merged = mergeFoodResults(clinic, shared, matches);
  }

  // Arabic-first, deduplicated, ranked (spec §5–7). Refine runs on the whole
  // merged set — collapsing near-identical USDA variants is exactly why the raw
  // list is longer than what the dietitian should see — then the list is capped.
  return refineIngredientResults(merged, trimmed).slice(0, RESULT_LIMIT);
}
