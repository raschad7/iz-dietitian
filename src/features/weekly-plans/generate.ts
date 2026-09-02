/**
 * Turning a model response into a plan.
 *
 * The model is treated as an untrusted source of *references*, never of facts. It
 * returns dish slugs and serving multipliers; everything else — which slots exist,
 * whether a dish is allowed, what any of it contains — is decided here, against
 * the database.
 *
 * `reconcile` is pure and is where all of that happens, so the interesting
 * failures (a hallucinated slug, an allergen violation, a missing day) are
 * assertable without a network or a database. `runGeneration` is the thin
 * orchestration around it.
 */

import { buildPrompt, type PromptDish, type PromptInput } from './prompt';
import { getLlmTransport, LlmTransportError, type LlmResult } from './llm';
import {
  isFixedPortion,
  MAX_RATIONALE_LENGTH,
  MAX_SUMMARY_LENGTH,
  mealTypeForSlot,
  parseGeneratedPlan,
  type GeneratedPlan,
  type GenerationScope,
} from './schema';
import { repairVariety, type VarietyReport } from './variety';
import { DAY_TOLERANCE, driftState } from './drift';
import type { DishIngredientDetail } from './nutrition';
import { chooseServings, nextServings, portionedKcal } from './portioning';
import { bestServings, isSimilar, snapServings } from './similar';
import type { SlotBudget } from './targets';

/** A catalog dish, as reconciliation needs it. */
export type CatalogDish = PromptDish & {
  id: string;
  allergenTags: readonly string[];
  /**
   * The recipe, carried so the portion can be chosen against what a multiplier
   * actually produces rather than against `baseKcal × servings`. Rounding happens
   * per line and under per-line ceilings, so the two are not the same number.
   *
   * Not sent to the model — `describeCatalog` names the fields it puts on the
   * wire, and this is not one of them.
   */
  recipe: readonly DishIngredientDetail[];
};

export type ReconciledOption = {
  dishId: string;
  slug: string;
  servings: number;
  /** False when this "alternative" is not actually close to the meal's budget. */
  isSimilar: boolean;
};

export type ReconciledMeal = {
  dayOfWeek: number;
  slotKey: string;
  label: string;
  timeOfDay: string;
  /** Snapshotted from the schedule's share, so the board shows what the model was given. */
  budgetKcal: number;
  sortOrder: number;
  /** Null for a slot nothing valid was returned for. Stored as an empty meal. */
  dishId: string | null;
  servings: number;
  rationaleAr: string | null;
  options: ReconciledOption[];
};

export type ReconcileWarning =
  | { kind: 'unknown_dish'; slug: string; dayOfWeek: number; slotKey: string }
  | { kind: 'allergen_violation'; slug: string; dayOfWeek: number; slotKey: string }
  | { kind: 'wrong_meal_type'; slug: string; dayOfWeek: number; slotKey: string }
  | { kind: 'missing_meal'; dayOfWeek: number; slotKey: string }
  | { kind: 'duplicate_meal'; dayOfWeek: number; slotKey: string };

export type ReconcileResult = {
  meals: ReconciledMeal[];
  warnings: ReconcileWarning[];
  /** Slots left empty — what the banner counts. */
  unfilled: number;
  /** The model's description of the week, trimmed. Null when it wrote none. */
  summaryAr: string | null;
  /** What the variety pass changed, for the audit row. */
  variety: VarietyReport;
};

/**
 * Reconciles what the model returned against what is actually allowed.
 *
 * Drives from the *schedule*, not from the response: iterating the requested days
 * and slots means a day the model omitted becomes seven empty meals rather than
 * silently vanishing, and a slot it invented is never written because nothing asks
 * for it.
 *
 * Every rejection is recorded in `warnings`. Dropping a meal quietly would leave
 * the dietitian looking at a gap with no idea why it is there.
 */
export function reconcile({
  plan,
  days,
  budgets,
  catalog,
  allergens,
}: {
  plan: GeneratedPlan;
  days: readonly number[];
  budgets: readonly SlotBudget[];
  catalog: readonly CatalogDish[];
  allergens: readonly string[];
}): ReconcileResult {
  const bySlug = new Map(catalog.map((dish) => [dish.slug, dish]));
  const blocked = new Set(allergens);
  const warnings: ReconcileWarning[] = [];

  // Index the response so a missing day or slot is an absent lookup rather than a
  // search. A day the model returned twice keeps the first and is reported.
  const returned = new Map<string, (typeof plan.days)[number]['meals'][number]>();

  for (const day of plan.days) {
    for (const meal of day.meals) {
      const key = `${day.dayOfWeek}:${meal.slotKey}`;
      if (returned.has(key)) {
        warnings.push({ kind: 'duplicate_meal', dayOfWeek: day.dayOfWeek, slotKey: meal.slotKey });
        continue;
      }
      returned.set(key, meal);
    }
  }

  /**
   * Validates one dish reference. Returns null and records why when it fails.
   *
   * The allergen check runs even though the catalog was already filtered before
   * the prompt was built: defence in depth costs one set lookup, and this is the
   * check that must not have a hole in it.
   */
  function resolve(
    slug: string,
    mealType: string,
    dayOfWeek: number,
    slotKey: string,
  ): CatalogDish | null {
    const dish = bySlug.get(slug);

    if (!dish) {
      warnings.push({ kind: 'unknown_dish', slug, dayOfWeek, slotKey });
      return null;
    }

    if (dish.allergenTags.some((tag) => blocked.has(tag))) {
      warnings.push({ kind: 'allergen_violation', slug, dayOfWeek, slotKey });
      return null;
    }

    if (!dish.mealTypes.includes(mealType)) {
      warnings.push({ kind: 'wrong_meal_type', slug, dayOfWeek, slotKey });
      return null;
    }

    return dish;
  }

  const meals: ReconciledMeal[] = [];
  let unfilled = 0;

  for (const dayOfWeek of days) {
    /** This day's filled meals beside their recipes, for the balancing pass below. */
    const filled: BalanceEntry[] = [];

    for (const [index, budget] of budgets.entries()) {
      const returnedMeal = returned.get(`${dayOfWeek}:${budget.slotKey}`);
      const mealType = mealTypeForSlot(budget.slotKey);

      const base = {
        dayOfWeek,
        slotKey: budget.slotKey,
        label: budget.label,
        timeOfDay: budget.timeOfDay,
        budgetKcal: budget.kcal,
        sortOrder: index,
      };

      if (!returnedMeal) {
        warnings.push({ kind: 'missing_meal', dayOfWeek, slotKey: budget.slotKey });
        unfilled += 1;
        meals.push({ ...base, dishId: null, servings: 1, rationaleAr: null, options: [] });
        continue;
      }

      const dish = resolve(returnedMeal.dish, mealType, dayOfWeek, budget.slotKey);

      if (!dish) {
        unfilled += 1;
        meals.push({ ...base, dishId: null, servings: 1, rationaleAr: null, options: [] });
        continue;
      }

      // The model chooses the dish; arithmetic chooses the portion.
      //
      // Its own `servings` is discarded whenever we can do better, because we have
      // both numbers it would need — the slot budget and the dish's energy per base
      // serving — and it does not have to be good at multiplication. Trusting it
      // measurably was not good enough: gpt-4o-mini undershot every lunch by 15-25%,
      // which turned a 1,577 kcal target into a 1,292 kcal day.
      //
      // `chooseServings` searches the portioned result rather than dividing into
      // `baseKcal`, because a portion is snapped per line and held under per-line
      // ceilings: 2.75 servings of a dish is not 2.75 times its energy, and the
      // multiplier that hits the budget on paper is not the one that hits it on a
      // plate. Falls back for a dish with no recipe or no energy, where no
      // multiplier means anything.
      const servings =
        chooseServings(dish.recipe, budget.kcal, { wholeOnly: isFixedPortion(dish.source) }) ??
        bestServings(dish.baseKcal, budget.kcal) ??
        snapServings(returnedMeal.servings);
      const options = alternativesFor({
        dish,
        mealType,
        budgetKcal: budget.kcal,
        catalog,
        blocked,
        rotation: dayOfWeek + index,
      });

      const meal: ReconciledMeal = {
        ...base,
        dishId: dish.id,
        servings,
        rationaleAr: truncate(returnedMeal.rationaleAr, MAX_RATIONALE_LENGTH),
        options,
      };

      meals.push(meal);
      filled.push({ meal, recipe: dish.recipe, wholeOnly: isFixedPortion(dish.source) });
    }

    balanceDay(filled);
  }

  // Variety last: it swaps dishes, and a swapped dish is portioned by the same
  // chooser, so it must run after every meal has one to swap away from.
  const variety = repairVariety({ meals, catalog, allergens });

  return {
    meals,
    warnings,
    unfilled,
    summaryAr: truncate(plan.summaryAr, MAX_SUMMARY_LENGTH),
    variety,
  };
}

/**
 * How many substitutes a meal carries.
 *
 * Three, the number the meal panel and the printed sheet both show.
 */
const ALTERNATIVES_PER_MEAL = 3;

/**
 * How wide a pool the three are drawn from.
 *
 * Every dish in it fits the slot and the budget, so any three would do; drawing
 * from eight and rotating the start is what stops the same trio appearing under
 * every lunch of the week. The plan that prompted this offered
 * `دجاج مع كسكس وخضار · برغل مع دجاج · بازيلا ولحمة مع رز` on all seven days,
 * which reads as a form letter rather than as a choice.
 */
const ALTERNATIVE_POOL = 8;

/**
 * The substitutes for one meal, computed rather than asked for.
 *
 * The model used to return these: three slugs per meal, a third of its output,
 * and it spent them on the same three dishes every day. Nothing about the
 * question needs a model — "which dishes fit this slot at this budget" is
 * arithmetic over a catalog we hold, and doing it here makes the answer vary by
 * construction and the response smaller by a third.
 *
 * `rotation` shifts where in the ranked pool the three are taken from, so the
 * same slot on a different day offers different ones. It is the day plus the slot
 * index rather than a random number, because a plan that regenerates into
 * different alternatives every time it is read is a plan nobody trusts.
 */
function alternativesFor({
  dish,
  mealType,
  budgetKcal,
  catalog,
  blocked,
  rotation,
}: {
  dish: CatalogDish;
  mealType: string;
  budgetKcal: number;
  catalog: readonly CatalogDish[];
  blocked: ReadonlySet<string>;
  rotation: number;
}): ReconciledOption[] {
  const ranked: { option: ReconciledOption; gap: number }[] = [];

  for (const candidate of catalog) {
    if (candidate.id === dish.id) continue;
    if (!candidate.mealTypes.includes(mealType)) continue;
    if (candidate.allergenTags.some((tag) => blocked.has(tag))) continue;

    const servings =
      chooseServings(candidate.recipe, budgetKcal, {
        wholeOnly: isFixedPortion(candidate.source),
      }) ??
      bestServings(candidate.baseKcal, budgetKcal);
    if (servings === null) continue;

    const kcal = portionedKcal(candidate.recipe, servings) || candidate.baseKcal * servings;

    ranked.push({
      option: {
        dishId: candidate.id,
        slug: candidate.slug,
        servings,
        // Recorded rather than filtered: an alternative that is 40% lighter is
        // still a dish the dietitian might want, it just is not a like-for-like
        // swap, and the panel says so.
        isSimilar: isSimilar(kcal, budgetKcal),
      },
      gap: Math.abs(kcal - budgetKcal),
    });
  }

  ranked.sort((a, b) => a.gap - b.gap);

  const pool = ranked.slice(0, ALTERNATIVE_POOL);
  if (pool.length <= ALTERNATIVES_PER_MEAL) return pool.map((entry) => entry.option);

  const start = ((rotation % pool.length) + pool.length) % pool.length;

  return Array.from(
    { length: ALTERNATIVES_PER_MEAL },
    (_, index) => pool[(start + index) % pool.length]!.option,
  );
}

/** One filled meal and the recipe its portion is computed from. */
type BalanceEntry = {
  meal: ReconciledMeal;
  recipe: readonly DishIngredientDetail[];
  /** True for a dish sold whole, which may only move a serving at a time. */
  wholeOnly: boolean;
};

/** How many single-step adjustments one day is allowed. */
const BALANCE_PASSES = 8;

/**
 * Nudges a day back onto its target after every meal has been portioned.
 *
 * Portioning rounds and it caps, and both lose calories: a snack whose fruit hit
 * its ceiling lands under its slot, and five slots doing that put the day
 * meaningfully under the target it was built for. The old arithmetic never had
 * this problem because it never refused anything — it simply served four oranges.
 *
 * So the day is checked once the meals are chosen, and the meal with the most
 * room moves one step. Room means distance from its *own* slot budget, so the
 * calories are found where the plate can carry them rather than by inflating
 * whichever meal happens to be first.
 *
 * A move is kept only if it brings the day closer than it was. That is what stops
 * the pass oscillating around a target it cannot hit exactly, and it is why this
 * terminates well before {@link BALANCE_PASSES} in every case that converges at
 * all — the bound is a seatbelt, not a schedule.
 *
 * Mutates `servings` on the meals it is given. They are the same objects already
 * pushed onto the result, which is deliberate: a day is only balanced once and
 * copying them to say so would be ceremony.
 */
function balanceDay(entries: readonly BalanceEntry[]): void {
  if (!entries.length) return;

  const target = entries.reduce((sum, entry) => sum + entry.meal.budgetKcal, 0);
  if (!(target > 0)) return;

  const kcalOf = (entry: BalanceEntry) => portionedKcal(entry.recipe, entry.meal.servings);
  const dayKcal = () => entries.reduce((sum, entry) => sum + kcalOf(entry), 0);

  for (let pass = 0; pass < BALANCE_PASSES; pass += 1) {
    const total = dayKcal();
    const drift = driftState(total, target, DAY_TOLERANCE);
    if (!drift) return;

    const direction = drift === 'under' ? 1 : -1;

    let chosen: { entry: BalanceEntry; servings: number } | null = null;
    let mostRoom = -Infinity;

    for (const entry of entries) {
      const servings = nextServings(entry.recipe, entry.meal.servings, direction, {
        wholeOnly: entry.wholeOnly,
      });
      if (servings === null) continue;

      // Positive when this meal is short of its own budget in the direction the
      // day needs to move — the plate with somewhere to put the calories.
      const room = (entry.meal.budgetKcal - kcalOf(entry)) * direction;

      if (room > mostRoom) {
        chosen = { entry, servings };
        mostRoom = room;
      }
    }

    if (!chosen) return;

    const before = Math.abs(total - target);
    const previous = chosen.entry.meal.servings;
    chosen.entry.meal.servings = chosen.servings;

    if (Math.abs(dayKcal() - target) >= before) {
      chosen.entry.meal.servings = previous;
      return;
    }
  }
}

/**
 * Trims an over-long rationale rather than rejecting the meal.
 *
 * The dish choice is the valuable part; a model that wrote three sentences instead
 * of one has not made a clinical error. An empty string becomes null so the UI can
 * distinguish "no explanation" from "an explanation that is blank".
 */
function truncate(value: string, limit: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 1).trimEnd()}…`;
}

export class GenerationFailedError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GenerationFailedError';
  }
}

export type GenerationOutcome = ReconcileResult & {
  model: string;
  usage: LlmResult['usage'];
  durationMs: number;
};

/**
 * Calls the model and reconciles the answer.
 *
 * One retry, and only for a response that failed to parse or validate — the
 * validation error is appended to the prompt so the second attempt has something
 * to correct. A transport failure is NOT retried here: the network is not going to
 * change its mind in 200ms, and the dietitian is waiting.
 *
 * Persistence is the caller's job. Nothing is written until reconciliation
 * succeeded, so a failed generation leaves no trace but the audit row.
 */
export async function runGeneration(
  input: PromptInput,
  catalog: readonly CatalogDish[],
  allergens: readonly string[],
): Promise<GenerationOutcome> {
  const transport = getLlmTransport();
  const payload = buildPrompt(input);
  const startedAt = Date.now();

  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptPayload =
      attempt === 0
        ? payload
        : {
            ...payload,
            user: `${payload.user}\n\n## Correction\nYour previous response was rejected: ${describeError(lastError)}\nReturn valid JSON matching the schema exactly.`,
          };

    let result: LlmResult;

    try {
      result = await transport.complete(attemptPayload);
    } catch (cause) {
      // Surface transport failures immediately, with nothing written.
      throw new GenerationFailedError(
        cause instanceof LlmTransportError ? cause.message : 'The model could not be reached',
        cause,
      );
    }

    let parsed: GeneratedPlan;

    try {
      parsed = parseGeneratedPlan(
        JSON.parse(result.content),
        input.budgets.map((slot) => slot.slotKey),
      );
    } catch (cause) {
      lastError = cause;
      continue;
    }

    return {
      ...reconcile({
        plan: parsed,
        days: input.days,
        budgets: input.budgets,
        catalog,
        allergens,
      }),
      model: result.model,
      usage: result.usage,
      durationMs: Date.now() - startedAt,
    };
  }

  throw new GenerationFailedError(
    `The model returned a response we could not use: ${describeError(lastError)}`,
    lastError,
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  return String(error).slice(0, 300);
}

/** Re-exported so callers need one import for the scope union. */
export type { GenerationScope };
