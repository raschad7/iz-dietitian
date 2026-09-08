/**
 * The second pass: a finished week, read back and corrected.
 *
 * ## What this is for, and what it is not for
 *
 * It is **not** a way to paper over arithmetic. Everything countable — a day
 * against its target, a portion nobody can serve, a protein source carrying half
 * the week — is cheaper, faster and more reliable to fix in code, and the audit
 * that produced this module fixed those in code first. Buying a model call to
 * repair a bug would be paying forever, and slowly, for something a constant
 * fixes once.
 *
 * What it buys is the half arithmetic cannot reach: whether the week reads like
 * food a family eats, whether a day has a shape, whether the carbohydrate holds
 * steady across seven days rather than merely landing correctly on each of them.
 * Measured over the audited weeks, the first pass's own choices delivered 82% of
 * the protein target and a second pass took that to 87%; on a diabetic week it
 * pulled the carbohydrate range from 104–256 g down to 116–144 g, which is the
 * number that matters most for that client and which no rule in this codebase
 * expresses.
 *
 * ## Why it is safe
 *
 * It answers in the **same schema** as the first pass — a slug and a servings
 * hint per slot — and its answer goes through the **same `reconcile`**. So a dish
 * outside the catalogue stays unrepresentable, allergens stay filtered, portions
 * stay arithmetic, and the variety repair still runs. The worst a bad refinement
 * can do is choose worse dishes; it cannot break an invariant.
 *
 * ## Why it is a separate call and not part of generation
 *
 * Time. A generation is around 50 seconds and a refinement another 45, and the
 * route's ceiling is 120. Running both in one request would sit on that limit and
 * fail on a slow day. It is also better product: the dietitian sees a draft
 * immediately and asks for a second opinion when she wants one, rather than
 * waiting twice as long for every plan.
 */

import type { CatalogDish, ReconciledMeal } from './generate';
import { mealIngredientLines, mealTotals } from './meal-ingredients';
import type { PromptDraft } from './prompt';
import type { Board } from './queries';
import type { SlotBudget } from './targets';
import { DAY_TOLERANCE, driftState } from './drift';

/**
 * The draft the second pass is shown, built from what reconciliation produced.
 *
 * Totals are computed through `mealIngredientLines`, the same call the board and
 * the printed handout resolve a meal through, so the numbers the model is shown
 * are the numbers on the page. Sides are included — they are food the client
 * eats, and a draft that hid them would be asking for an opinion on a different
 * week.
 */
export function draftFromMeals({
  meals,
  budgets,
  catalog,
  sides,
  days,
  kcalTarget,
  proteinTargetGrams,
  proteinIsRestriction = false,
}: {
  meals: readonly ReconciledMeal[];
  budgets: readonly SlotBudget[];
  catalog: readonly CatalogDish[];
  sides: readonly CatalogDish[];
  days: readonly number[];
  kcalTarget: number;
  proteinTargetGrams: number | null;
  /**
   * True where a condition *lowered* the protein target — chronic kidney disease
   * and its relatives. The number is then a ceiling to stay under rather than a
   * figure to reach, and the two read identically without this.
   */
  proteinIsRestriction?: boolean;
}): PromptDraft {
  const byId = new Map([...catalog, ...sides].map((dish) => [dish.id, dish]));

  const draftDays = days.map((dayOfWeek) => {
    const dayMeals = budgets.map((budget) => {
      const meal = meals.find(
        (one) => one.dayOfWeek === dayOfWeek && one.slotKey === budget.slotKey,
      );
      const dish = meal?.dishId ? byId.get(meal.dishId) : undefined;

      if (!meal || !dish) {
        return {
          slotKey: budget.slotKey,
          slug: '',
          kcal: 0,
          budgetKcal: budget.kcal,
          protein: 0,
          carbs: 0,
        };
      }

      const lines = mealIngredientLines({
        recipe: dish.recipe,
        servings: meal.servings,
        sides: meal.sideDishIds.flatMap((id) => {
          const side = byId.get(id);
          return side ? [{ id: side.id, nameAr: side.nameAr, nameEn: side.nameAr, recipe: side.recipe }] : [];
        }),
      });
      const totals = mealTotals(lines);

      return {
        slotKey: budget.slotKey,
        slug: dish.slug,
        kcal: Math.round(totals.kcal.value),
        budgetKcal: budget.kcal,
        protein: Math.round(totals.protein.value),
        carbs: totals.carbs.value,
      };
    });

    const kcal = dayMeals.reduce((sum, meal) => sum + meal.kcal, 0);
    const protein = dayMeals.reduce((sum, meal) => sum + meal.protein, 0);
    /* Carried per day rather than per meal: steadiness across the week is what a
       diabetic plan is judged on, and it is a property of days. */
    const carbs = Math.round(dayMeals.reduce((sum, meal) => sum + meal.carbs, 0));

    return {
      dayOfWeek,
      kcal,
      protein,
      carbs,
      meals: dayMeals.map(({ carbs: _carbs, ...meal }) => meal),
    };
  });

  return {
    days: draftDays,
    findings: findingsFor(draftDays, kcalTarget, proteinTargetGrams, proteinIsRestriction),
  };
}

/**
 * The same draft, read off a board that already exists.
 *
 * This is the path the app takes: by the time a dietitian asks for a second
 * opinion the week is persisted, and the board carries every total already
 * computed through `mealIngredientLines`. Recomputing them from the catalogue
 * would be a second arithmetic path over the same food, which is the one thing
 * this feature has been careful never to grow.
 */
export function draftFromBoard({
  board,
  kcalTarget,
  proteinTargetGrams,
  proteinIsRestriction = false,
}: {
  board: Board;
  kcalTarget: number;
  proteinTargetGrams: number | null;
  /** See `draftFromMeals` — a lowered target is a ceiling, not a goal. */
  proteinIsRestriction?: boolean;
}): PromptDraft {
  const days = board.days.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    kcal: Math.round(day.totals.kcal.value),
    protein: Math.round(day.totals.protein.value),
    carbs: Math.round(day.totals.carbs.value),
    meals: day.meals.map((meal) => ({
      slotKey: meal.slotKey,
      slug: meal.dish?.slug ?? '',
      kcal: Math.round(meal.totals.kcal.value),
      budgetKcal: meal.budgetKcal,
      protein: Math.round(meal.totals.protein.value),
    })),
  }));

  return {
    days,
    findings: findingsFor(days, kcalTarget, proteinTargetGrams, proteinIsRestriction),
  };
}

/**
 * What the arithmetic already knows, so the model does not spend its answer
 * rediscovering it — the same division of labour as `review.ts`.
 */
function findingsFor(
  draftDays: PromptDraft['days'],
  kcalTarget: number,
  proteinTargetGrams: number | null,
  proteinIsRestriction: boolean,
): string[] {
  const findings: string[] = [];

  for (const day of draftDays) {
    if (driftState(day.kcal, kcalTarget, DAY_TOLERANCE)) {
      findings.push(`Day ${day.dayOfWeek}: ${day.kcal} kcal against a ${kcalTarget} kcal target.`);
    }

    if (proteinTargetGrams && day.protein < proteinTargetGrams * 0.85) {
      findings.push(
        `Day ${day.dayOfWeek}: ${day.protein} g protein against a ${proteinTargetGrams} g target — short.`,
      );
    }

    /*
      Over the target is normally fine and often good — protein protects lean mass
      in a deficit, and a week that overshoots is not a week to correct. It is only
      a problem when the target is a *restriction*, and then it is the whole point:
      a renal client's 56 g is a ceiling, and the first version of this pass pushed
      a kidney week from 127% to 128% of it because nothing said so.
    */
    if (proteinIsRestriction && proteinTargetGrams && day.protein > proteinTargetGrams * 1.15) {
      findings.push(
        `Day ${day.dayOfWeek}: ${day.protein} g protein against a RESTRICTED ${proteinTargetGrams} g target — too much. This target is a ceiling, not a goal.`,
      );
    }

    for (const meal of day.meals) {
      if (!meal.slug) {
        findings.push(`Day ${day.dayOfWeek} ${meal.slotKey}: empty, nothing was chosen.`);
      }
    }
  }

  /*
    Repetition across the week, which is the finding a model is worst at spotting
    for itself: it sees thirty-five choices and has to hold all of them in mind to
    notice that four of them were the same dish.
  */
  const uses = new Map<string, number>();
  for (const day of draftDays) {
    for (const meal of day.meals) {
      if (meal.slug) uses.set(meal.slug, (uses.get(meal.slug) ?? 0) + 1);
    }
  }
  for (const [slug, count] of uses) {
    if (count > 2) findings.push(`"${slug}" appears ${count} times this week.`);
  }

  /*
    The spread of carbohydrate across the week, stated once rather than left for
    the model to compute from seven day lines. A diabetic week that swings from
    104 g to 256 g is the failure this pass exists to catch, and it is invisible
    in any single day.
  */
  const carbs = draftDays.map((day) => day.carbs);
  const low = Math.min(...carbs);
  const high = Math.max(...carbs);

  if (high > low * 1.5 && high - low > 40) {
    findings.push(
      `Carbohydrate swings from ${low} g to ${high} g across the week — steady it.`,
    );
  }

  return findings;
}
