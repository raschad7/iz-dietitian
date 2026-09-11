import { and, eq, inArray, isNull, or } from 'drizzle-orm';

import {
  clientNutritionProfiles,
  clinicHiddenDishes,
  dishes,
  weeklyPlanMealOptions,
  weeklyPlanMealSides,
  weeklyPlanMeals,
  weeklyPlans,
} from '@/db/schema';

import {
  evaluateDishEligibility,
  hasUnmappedExclusions,
  unsupportedPattern,
  type PlanConstraints,
} from './eligibility';
import { MAX_INGREDIENT_GRAMS } from './meal-ingredients';
import type { DishDetail } from './nutrition';
import { loadDishesByIds, ownAmountsByMeal, type DbExecutor } from './queries';
import { isFixedPortion, MAX_MEAL_SIDES } from './schema';
import {
  MAX_SERVINGS,
  MIN_SERVINGS,
  SERVING_STEP,
  isSimilar,
} from './similar';
import { portionedKcal } from './portioning';

export type PlanValidationIssue = {
  kind:
    | 'profile_missing'
    | 'unsupported_pattern'
    | 'unmapped_exclusions'
    | 'no_meals'
    | 'unfilled'
    | 'dish_unavailable'
    | 'wrong_dish_role'
    | 'dish_without_ingredients'
    | 'constraint_violation'
    | 'invalid_servings'
    | 'invalid_ingredient_amount'
    | 'too_many_sides'
    | 'too_many_options'
    | 'option_not_similar';
  mealId?: string;
  dishId?: string;
};

type ValidationMeal = {
  id: string;
  slotKey: string;
  budgetKcal: number;
  dishId: string | null;
  servings: number;
};

type ValidationOption = { mealId: string; dishId: string; servings: number };
type ValidationSide = { mealId: string; dishId: string };

/**
 * Pure final-plan validation. It checks the materialised state a client will
 * receive, not the prompt or the base-serving labels that produced it.
 *
 * A dish standing in a slot its meal-type tag does not list is not an issue here
 * and used to be — `wrong_meal_type`, which gated publishing. It had to go with
 * the same rule in `validDishPlacement`: once the board lets a dietitian carry a
 * dish into whichever slot she means it for, refusing to publish the week she
 * just built is the same refusal arriving later and with less to say. The
 * generator still may not put a dish in a slot its tag does not list
 * (`generate.ts`), which is where that tag belongs.
 */
export function validatePlanData(input: {
  meals: readonly ValidationMeal[];
  options: readonly ValidationOption[];
  sides: readonly ValidationSide[];
  dishes: readonly DishDetail[];
  visibleDishIds: ReadonlySet<string>;
  constraints: PlanConstraints | null;
  ownAmounts: Awaited<ReturnType<typeof ownAmountsByMeal>>;
}): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  const dishById = new Map(input.dishes.map((dish) => [dish.id, dish]));
  const mealById = new Map(input.meals.map((meal) => [meal.id, meal]));

  if (!input.constraints) issues.push({ kind: 'profile_missing' });
  else if (unsupportedPattern(input.constraints.dietPattern)) {
    issues.push({ kind: 'unsupported_pattern' });
  } else if (hasUnmappedExclusions(input.constraints)) {
    issues.push({ kind: 'unmapped_exclusions' });
  }

  if (!input.meals.length) issues.push({ kind: 'no_meals' });

  for (const meal of input.meals) {
    if (!meal.dishId) {
      issues.push({ kind: 'unfilled', mealId: meal.id });
      continue;
    }

    const dish = dishById.get(meal.dishId);
    validateDishReference({
      issues,
      meal,
      dish,
      dishId: meal.dishId,
      expectedSide: false,
      visibleDishIds: input.visibleDishIds,
      constraints: input.constraints,
    });

    if (dish && !validServings(meal.servings, dish)) {
      issues.push({ kind: 'invalid_servings', mealId: meal.id, dishId: dish.id });
    }

    for (const line of input.ownAmounts.get(meal.id) ?? []) {
      if (
        !Number.isFinite(line.quantityGrams) ||
        line.quantityGrams <= 0 ||
        line.quantityGrams > MAX_INGREDIENT_GRAMS ||
        (line.isPrimary && line.isFree)
      ) {
        issues.push({ kind: 'invalid_ingredient_amount', mealId: meal.id, dishId: dish?.id });
      }
    }
  }

  const sidesByMeal = groupByMeal(input.sides);
  for (const [mealId, sides] of sidesByMeal) {
    const meal = mealById.get(mealId);
    if (!meal) continue;
    if (sides.length > MAX_MEAL_SIDES) issues.push({ kind: 'too_many_sides', mealId });

    for (const side of sides) {
      validateDishReference({
        issues,
        meal,
        dish: dishById.get(side.dishId),
        dishId: side.dishId,
        expectedSide: true,
        visibleDishIds: input.visibleDishIds,
        constraints: input.constraints,
      });
    }
  }

  const optionsByMeal = groupByMeal(input.options);
  for (const [mealId, options] of optionsByMeal) {
    const meal = mealById.get(mealId);
    if (!meal) continue;
    if (options.length > 3) issues.push({ kind: 'too_many_options', mealId });

    for (const option of options) {
      const dish = dishById.get(option.dishId);
      validateDishReference({
        issues,
        meal,
        dish,
        dishId: option.dishId,
        expectedSide: false,
        visibleDishIds: input.visibleDishIds,
        constraints: input.constraints,
      });

      if (!dish || !validServings(option.servings, dish)) {
        issues.push({ kind: 'invalid_servings', mealId, dishId: option.dishId });
        continue;
      }
      const kcal = portionedKcal(dish.ingredients, option.servings);
      if (!isSimilar(kcal, meal.budgetKcal)) {
        issues.push({ kind: 'option_not_similar', mealId, dishId: option.dishId });
      }
    }
  }

  return deduplicateIssues(issues);
}

/** Reads and validates a plan on the supplied connection (the publish transaction). */
export async function validatePlanForPublication(
  executor: DbExecutor,
  clinicId: string,
  planId: string,
): Promise<PlanValidationIssue[]> {
  const [plan] = await executor
    .select({ clientId: weeklyPlans.clientId })
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.id, planId), eq(weeklyPlans.clinicId, clinicId)))
    .limit(1);

  if (!plan) return [{ kind: 'no_meals' }];

  const [profile] = await executor
    .select({
      allergens: clientNutritionProfiles.allergenTags,
      dietPattern: clientNutritionProfiles.dietPattern,
      unmappedExclusions: clientNutritionProfiles.customAllergens,
    })
    .from(clientNutritionProfiles)
    .where(
      and(
        eq(clientNutritionProfiles.clientId, plan.clientId),
        eq(clientNutritionProfiles.clinicId, clinicId),
      ),
    )
    .limit(1);

  const constraints = profile
    ? {
        allergens: profile.allergens,
        dietPattern: profile.dietPattern,
        unmappedExclusions: profile.unmappedExclusions,
      }
    : null;

  const meals = await executor
    .select({
      id: weeklyPlanMeals.id,
      slotKey: weeklyPlanMeals.slotKey,
      budgetKcal: weeklyPlanMeals.budgetKcal,
      dishId: weeklyPlanMeals.dishId,
      servings: weeklyPlanMeals.servings,
    })
    .from(weeklyPlanMeals)
    .where(eq(weeklyPlanMeals.planId, planId));
  const mealIds = meals.map((meal) => meal.id);

  const options = mealIds.length
    ? await executor
        .select({
          mealId: weeklyPlanMealOptions.mealId,
          dishId: weeklyPlanMealOptions.dishId,
          servings: weeklyPlanMealOptions.servings,
        })
        .from(weeklyPlanMealOptions)
        .where(inArray(weeklyPlanMealOptions.mealId, mealIds))
    : [];
  const sides = mealIds.length
    ? await executor
        .select({ mealId: weeklyPlanMealSides.mealId, dishId: weeklyPlanMealSides.dishId })
        .from(weeklyPlanMealSides)
        .where(inArray(weeklyPlanMealSides.mealId, mealIds))
    : [];

  const dishIds = [
    ...new Set([
      ...meals.flatMap((meal) => (meal.dishId ? [meal.dishId] : [])),
      ...options.map((option) => option.dishId),
      ...sides.map((side) => side.dishId),
    ]),
  ];
  const loadedDishes = await loadDishesByIds(dishIds, executor);

  const hidden = await executor
    .select({ dishId: clinicHiddenDishes.dishId })
    .from(clinicHiddenDishes)
    .where(eq(clinicHiddenDishes.clinicId, clinicId));
  const hiddenIds = new Set(hidden.map((row) => row.dishId));

  const visibleRows = dishIds.length
    ? await executor
        .select({ id: dishes.id })
        .from(dishes)
        .where(
          and(
            inArray(dishes.id, dishIds),
            eq(dishes.isActive, true),
            or(isNull(dishes.clinicId), eq(dishes.clinicId, clinicId)),
          ),
        )
    : [];
  const visibleDishIds = new Set(
    visibleRows.map((row) => row.id).filter((id) => !hiddenIds.has(id)),
  );

  return validatePlanData({
    meals,
    options,
    sides,
    dishes: loadedDishes,
    visibleDishIds,
    constraints,
    ownAmounts: await ownAmountsByMeal(mealIds, executor),
  });
}

function validateDishReference(input: {
  issues: PlanValidationIssue[];
  meal: ValidationMeal;
  dish: DishDetail | undefined;
  dishId: string;
  expectedSide: boolean;
  visibleDishIds: ReadonlySet<string>;
  constraints: PlanConstraints | null;
}): void {
  const { issues, meal, dish, dishId, expectedSide, visibleDishIds, constraints } = input;
  if (!dish || !visibleDishIds.has(dishId)) {
    issues.push({ kind: 'dish_unavailable', mealId: meal.id, dishId });
    return;
  }
  if (dish.isSide !== expectedSide) issues.push({ kind: 'wrong_dish_role', mealId: meal.id, dishId });
  if (dish.ingredients.length === 0) {
    issues.push({ kind: 'dish_without_ingredients', mealId: meal.id, dishId });
  }
  if (constraints && !evaluateDishEligibility(dish, constraints).eligible) {
    issues.push({ kind: 'constraint_violation', mealId: meal.id, dishId });
  }
}

function validServings(servings: number, dish: DishDetail): boolean {
  if (!Number.isFinite(servings) || servings < MIN_SERVINGS || servings > MAX_SERVINGS) return false;
  if (isFixedPortion(dish.source)) return Number.isInteger(servings);
  return Math.abs(servings / SERVING_STEP - Math.round(servings / SERVING_STEP)) < 1e-9;
}

function groupByMeal<T extends { mealId: string }>(rows: readonly T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.mealId);
    if (bucket) bucket.push(row);
    else grouped.set(row.mealId, [row]);
  }
  return grouped;
}

function deduplicateIssues(issues: readonly PlanValidationIssue[]): PlanValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.kind}:${issue.mealId ?? ''}:${issue.dishId ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
