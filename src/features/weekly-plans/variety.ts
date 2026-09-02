/**
 * The variety rules, enforced rather than requested.
 *
 * `prompt.ts` asks for them. This checks them, and repairs what it finds — which
 * is the difference between a rule and a hope. The plan that prompted this module
 * obeyed every instruction it was given ("do not repeat a dish more than twice")
 * and still put chickpeas in eight meals of thirty-five, and served chicken salad
 * for lunch and again for dinner on the same Monday. Neither is a dish repeating;
 * both are what a person would call the same food twice.
 *
 * So the rules here are written in the terms `dish-composition.ts` derives — what
 * the protein was, what it was eaten with — because that is what repeats.
 *
 * ## What a repair is allowed to do
 *
 * Replace one meal's dish with another from the same slot's catalog, at a portion
 * that lands on the same budget. Nothing else: it cannot move a meal to another
 * day, cannot leave a slot empty, and cannot accept a replacement that misses the
 * budget — a plan that is varied and wrong is worse than one that is repetitive
 * and right, so a violation with no good replacement is left alone.
 *
 * Pure, and separate from `generate.ts`, because the interesting question is
 * which weeks it changes and that has to be assertable without a model.
 */

import { carbBase, proteinSource, type ProteinSource } from './dish-composition';
import type { CatalogDish } from './generate';
import { chooseServings, portionedKcal } from './portioning';
import { isFixedPortion, mealTypeForSlot } from './schema';
import { bestServings, isSimilar } from './similar';

/** The fields a repair reads and writes. A subset of `ReconciledMeal`. */
export type VarietyMeal = {
  dayOfWeek: number;
  slotKey: string;
  budgetKcal: number;
  dishId: string | null;
  servings: number;
};

/**
 * How often one protein source may carry a week.
 *
 * Three of thirty-five meals is a client who eats chicken twice and does not
 * notice; six is a client eating chicken. The ceiling counts only the meals whose
 * protein it actually is, so a week is free to hold as many salads and fruit
 * snacks as it likes — those are `none` and exempt, since "no protein" repeating
 * is a shape problem rather than a monotony one.
 */
const MAX_WEEK_USES = 3;

/** Sources that may repeat freely: not having a protein is not a kind of protein. */
const EXEMPT: ReadonlySet<ProteinSource> = new Set(['none']);

export type VarietyReport = {
  /** Meals whose dish was replaced. */
  repaired: number;
  /** Violations no replacement could fix without missing the budget. */
  unresolved: number;
};

/**
 * Rewrites the meals that break a variety rule, in place.
 *
 * Walks the week in order and keeps the FIRST use of anything: the repair falls on
 * the later meal, which is the one a reader would call the repeat. Within a day it
 * checks the dish and the protein source; across the week it checks how often each
 * source has carried a meal.
 *
 * Returns what it did rather than logging it, so a caller can put the number in an
 * audit row and a test can assert on it.
 */
export function repairVariety({
  meals,
  catalog,
  allergens,
}: {
  meals: VarietyMeal[];
  catalog: readonly CatalogDish[];
  allergens: readonly string[];
}): VarietyReport {
  const byId = new Map(catalog.map((dish) => [dish.id, dish]));
  const blocked = new Set(allergens);

  /** Cached, because a repair scans the catalog and every dish is asked twice. */
  const sourceOf = new Map<string, ProteinSource>();
  const source = (dish: CatalogDish): ProteinSource => {
    const held = sourceOf.get(dish.id);
    if (held) return held;

    const derived = proteinSource(dish.recipe);
    sourceOf.set(dish.id, derived);
    return derived;
  };

  const weekSources = new Map<ProteinSource, number>();
  const daySources = new Map<number, Set<ProteinSource>>();
  const dayDishes = new Map<number, Set<string>>();

  const report: VarietyReport = { repaired: 0, unresolved: 0 };

  for (const meal of meals) {
    if (!meal.dishId) continue;

    const dish = byId.get(meal.dishId);
    if (!dish) continue;

    const day = daySources.get(meal.dayOfWeek) ?? new Set<ProteinSource>();
    const dishes = dayDishes.get(meal.dayOfWeek) ?? new Set<string>();
    daySources.set(meal.dayOfWeek, day);
    dayDishes.set(meal.dayOfWeek, dishes);

    const current = source(dish);
    const repeats =
      dishes.has(dish.id) ||
      (!EXEMPT.has(current) &&
        (day.has(current) || (weekSources.get(current) ?? 0) >= MAX_WEEK_USES));

    if (repeats) {
      const replacement = findReplacement({
        meal,
        catalog,
        blocked,
        source,
        daySources: day,
        dayDishes: dishes,
        weekSources,
      });

      if (replacement) {
        meal.dishId = replacement.dish.id;
        meal.servings = replacement.servings;
        report.repaired += 1;

        day.add(source(replacement.dish));
        dishes.add(replacement.dish.id);
        bump(weekSources, source(replacement.dish));
        continue;
      }

      // Nothing fits the budget. The repeat stays, and is counted so a caller can
      // say the catalog is too thin rather than that the rule was ignored.
      report.unresolved += 1;
    }

    day.add(current);
    dishes.add(dish.id);
    bump(weekSources, current);
  }

  return report;
}

function bump(counts: Map<ProteinSource, number>, key: ProteinSource): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * The closest dish that fits this slot and breaks none of the rules.
 *
 * Ranked by how near its portioned energy lands to the budget, and refused
 * outright past the meal tolerance: a substitute that misses the slot by a third
 * has fixed a monotony problem by creating a nutrition one.
 */
function findReplacement({
  meal,
  catalog,
  blocked,
  source,
  daySources,
  dayDishes,
  weekSources,
}: {
  meal: VarietyMeal;
  catalog: readonly CatalogDish[];
  blocked: ReadonlySet<string>;
  source: (dish: CatalogDish) => ProteinSource;
  daySources: ReadonlySet<ProteinSource>;
  dayDishes: ReadonlySet<string>;
  weekSources: ReadonlyMap<ProteinSource, number>;
}): { dish: CatalogDish; servings: number } | null {
  const mealType = mealTypeForSlot(meal.slotKey);

  let best: { dish: CatalogDish; servings: number; gap: number } | null = null;

  for (const candidate of catalog) {
    if (candidate.id === meal.dishId) continue;
    if (!candidate.mealTypes.includes(mealType)) continue;
    if (candidate.allergenTags.some((tag) => blocked.has(tag))) continue;
    if (dayDishes.has(candidate.id)) continue;

    const candidateSource = source(candidate);

    if (!EXEMPT.has(candidateSource)) {
      if (daySources.has(candidateSource)) continue;
      if ((weekSources.get(candidateSource) ?? 0) >= MAX_WEEK_USES) continue;
    }

    const servings =
      chooseServings(candidate.recipe, meal.budgetKcal, {
        wholeOnly: isFixedPortion(candidate.source),
      }) ??
      bestServings(candidate.baseKcal, meal.budgetKcal);
    if (servings === null) continue;

    const kcal = portionedKcal(candidate.recipe, servings) || candidate.baseKcal * servings;
    if (!isSimilar(kcal, meal.budgetKcal)) continue;

    const gap = Math.abs(kcal - meal.budgetKcal);
    if (!best || gap < best.gap) best = { dish: candidate, servings, gap };
  }

  return best ? { dish: best.dish, servings: best.servings } : null;
}

/**
 * What a finished week is made of, for the audit row and for tests.
 *
 * Not used by the repair — it is the same counting done once more for reporting,
 * which is cheap and keeps the repair loop readable.
 */
export function varietyProfile(
  meals: readonly VarietyMeal[],
  catalog: readonly CatalogDish[],
): { proteinSources: Record<string, number>; carbBases: Record<string, number> } {
  const byId = new Map(catalog.map((dish) => [dish.id, dish]));
  const proteinSources: Record<string, number> = {};
  const carbBases: Record<string, number> = {};

  for (const meal of meals) {
    const dish = meal.dishId ? byId.get(meal.dishId) : undefined;
    if (!dish) continue;

    const protein = proteinSource(dish.recipe);
    const carb = carbBase(dish.recipe);

    proteinSources[protein] = (proteinSources[protein] ?? 0) + 1;
    carbBases[carb] = (carbBases[carb] ?? 0) + 1;
  }

  return { proteinSources, carbBases };
}
