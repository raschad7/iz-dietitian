/**
 * Finding a dish that fits where another one sat.
 *
 * Deterministic, pure, and free: no model is involved. "Nutritionally similar"
 * is a question about numbers we already have, and asking an LLM to answer it
 * would be slower, cost money, and be less correct.
 *
 * Two callers:
 *  - the meal detail panel, for the swap list the dietitian browses;
 *  - the AI validation path, to flag an alternative the model offered that is not
 *    actually a substitute.
 */

export type SimilarCandidate = {
  slug: string;
  mealTypes: readonly string[];
  allergenTags: readonly string[];
  /** Energy for one base serving. */
  baseKcal: number;
};

export type SimilarMatch<T extends SimilarCandidate> = {
  candidate: T;
  /** The multiplier that lands closest to the budget, snapped to a legal step. */
  servings: number;
  /** Energy at that multiplier. */
  kcal: number;
  /** Signed fraction off the budget. −0.08 is 8% under. */
  deviation: number;
};

/**
 * How far a substitute may sit from the budget and still be one.
 *
 * ±15% is the band a dietitian would accept without re-planning the day. Outside
 * it, swapping the meal changes the day, which is a different decision and should
 * look like one.
 */
export const SIMILARITY_TOLERANCE = 0.15;

/**
 * Legal serving multipliers.
 *
 * Quarter steps, because "1.25 servings" is an instruction a person can follow and
 * "1.1834 servings" is not. The ceiling of 3 stops the search from proposing a
 * plausible-looking match built from eating four portions of a snack.
 */
export const SERVING_STEP = 0.25;
export const MIN_SERVINGS = 0.25;
export const MAX_SERVINGS = 3;

/** Rounds to the nearest legal multiplier, clamped to the allowed range. */
export function snapServings(value: number): number {
  const snapped = Math.round(value / SERVING_STEP) * SERVING_STEP;
  const clamped = Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, snapped));
  // Quarter steps are exact in binary floating point, but the division and
  // multiplication above can still leave 1.7500000000000002.
  return Math.round(clamped * 100) / 100;
}

/**
 * The serving multiplier that puts a dish closest to a calorie budget.
 *
 * Returns null for a dish with no energy — a plain cucumber cannot be scaled to
 * 600 kcal, and pretending otherwise would offer it as a substitute for lunch.
 */
export function bestServings(baseKcal: number, budgetKcal: number): number | null {
  if (!(baseKcal > 0) || !(budgetKcal > 0)) return null;
  return snapServings(budgetKcal / baseKcal);
}

/** Signed fraction by which `kcal` misses `budgetKcal`. */
export function deviation(kcal: number, budgetKcal: number): number {
  if (!(budgetKcal > 0)) return 0;
  return (kcal - budgetKcal) / budgetKcal;
}

/** Whether a dish at a multiplier is close enough to count as a substitute. */
export function isSimilar(kcal: number, budgetKcal: number, tolerance = SIMILARITY_TOLERANCE): boolean {
  return Math.abs(deviation(kcal, budgetKcal)) <= tolerance;
}

/**
 * Ranks the catalog for one slot.
 *
 * Filters first — wrong meal type or an allergen the client reacts to is a
 * disqualification, not a penalty — then sorts by how close the best achievable
 * portion gets to the budget. `excludeSlugs` drops the dish already in the slot
 * and anything already offered as an alternative, so the list never suggests what
 * is on screen.
 */
export function findSimilar<T extends SimilarCandidate>({
  candidates,
  mealType,
  budgetKcal,
  allergens = [],
  excludeSlugs = [],
  tolerance = SIMILARITY_TOLERANCE,
  limit = 8,
}: {
  candidates: readonly T[];
  mealType: string;
  budgetKcal: number;
  allergens?: readonly string[];
  excludeSlugs?: readonly string[];
  tolerance?: number;
  limit?: number;
}): SimilarMatch<T>[] {
  const blocked = new Set(allergens);
  const excluded = new Set(excludeSlugs);

  const matches: SimilarMatch<T>[] = [];

  for (const candidate of candidates) {
    if (excluded.has(candidate.slug)) continue;
    if (!candidate.mealTypes.includes(mealType)) continue;
    if (candidate.allergenTags.some((tag) => blocked.has(tag))) continue;

    const servings = bestServings(candidate.baseKcal, budgetKcal);
    if (servings === null) continue;

    const kcal = candidate.baseKcal * servings;
    if (!isSimilar(kcal, budgetKcal, tolerance)) continue;

    matches.push({ candidate, servings, kcal, deviation: deviation(kcal, budgetKcal) });
  }

  return matches
    .sort((a, b) => {
      const byCloseness = Math.abs(a.deviation) - Math.abs(b.deviation);
      // Ties broken by slug so the list is stable across renders — an unstable
      // order makes the panel reshuffle for no reason the dietitian can see.
      return byCloseness !== 0 ? byCloseness : a.candidate.slug.localeCompare(b.candidate.slug);
    })
    .slice(0, limit);
}
