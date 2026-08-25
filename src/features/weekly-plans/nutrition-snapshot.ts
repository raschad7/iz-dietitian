/**
 * The frozen nutrition a published plan carries, and the one rule for reading it.
 *
 * A weekly plan stores `dish_id + servings` and nothing else about what the food
 * contains, so every calorie used to be recomputed from `foods` at read time. That
 * was safe while the catalog was read-only seed data. It stopped being safe once a
 * clinic could edit a recipe or a custom food's numbers, and it will stop being
 * safe again — much more loudly — when the USDA library is replaced by a canonical
 * catalog: a remap would silently rewrite the calories on plans patients are
 * already following, and on archived plans that are supposed to be the record of
 * what was prescribed.
 *
 * So publishing freezes the numbers. This module owns the frozen shape, its
 * runtime validation, and {@link resolveMealNutrition} — the single branch that
 * decides between frozen and live. It is deliberately separate from
 * `nutrition.ts`, which stays pure arithmetic with no idea that persistence
 * exists.
 *
 * **There is only one calculation.** A snapshot is produced by the same
 * `dishTotals` / `dishGrams` path the board has always used; nothing here computes
 * a nutrient. Freezing is a question of *when* the existing arithmetic runs, never
 * of running different arithmetic.
 */

import { z } from 'zod';

import {
  NUTRIENT_KEYS,
  dishGrams,
  dishTotals,
  type NutrientSource,
  type NutrientTotals,
} from './nutrition';

/**
 * Bumped only if the stored shape changes incompatibly.
 *
 * Stored inside every blob rather than inferred from the columns around it: a
 * snapshot outlives the code that wrote it, and a reader that cannot tell which
 * shape it is holding has to guess. Version 1 is `NutrientTotals` plus the dish's
 * total weight.
 */
export const SNAPSHOT_VERSION = 1;

/**
 * One `NutrientTotals` entry.
 *
 * `unmeasured` is not decoration and must survive the round trip. The whole
 * feature distinguishes "contains none of it" from "nobody measured it": a null
 * nutrient is skipped by `sumNutrients` and counted here instead, and the meal
 * panel prints a marker when the count is above zero. Serialising a total as a
 * bare number would silently turn every unmeasured nutrient into a measured zero —
 * exactly the falsehood the null-means-unmeasured rule exists to prevent.
 */
const nutrientTotalSchema = z.object({
  value: z.number().finite(),
  unmeasured: z.number().int().nonnegative(),
});

/**
 * Every nutrient in `NUTRIENT_KEYS`, all required.
 *
 * Built from the same constant the arithmetic uses, so adding a nutrient to
 * `NUTRIENT_KEYS` extends the stored shape automatically rather than leaving a
 * field that validates today and is missing tomorrow.
 */
const nutrientTotalsSchema = z.object(
  Object.fromEntries(NUTRIENT_KEYS.map((key) => [key, nutrientTotalSchema])) as {
    [K in (typeof NUTRIENT_KEYS)[number]]: typeof nutrientTotalSchema;
  },
);

export const mealNutritionSnapshotSchema = z.object({
  version: z.literal(SNAPSHOT_VERSION),
  /** The complete frozen totals — all 12 nutrients, with their unmeasured counts. */
  totals: nutrientTotalsSchema,
  /**
   * The dish's total weight at the serving multiplier, frozen alongside.
   *
   * The board prints "≈ 445 g" next to the calories, and both are derived from the
   * same recipe at the same serving. Freezing one without the other would let a
   * published card show a weight that disagrees with its own energy.
   */
  grams: z.number().nonnegative(),
});

export type MealNutritionSnapshot = z.infer<typeof mealNutritionSnapshotSchema>;

/**
 * Freezes one meal from the lines it was prescribed at.
 *
 * Takes the meal's **resolved** lines — `mealIngredientLines` has already decided
 * between the meal's own amounts and the scaled recipe, and has already scaled.
 * Reusing that one resolution, rather than re-deriving from a dish and a
 * multiplier, is what stops a snapshot disagreeing with the draft the dietitian
 * was looking at a moment before they published.
 */
export function buildMealSnapshot(
  lines: readonly NutrientSource[],
): MealNutritionSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    totals: dishTotals(lines, 1),
    grams: dishGrams(lines, 1),
  };
}

/**
 * The statuses whose nutrition must already be frozen.
 *
 * A draft is a working copy and recalculates live; a published or archived plan is
 * a record of what was prescribed, and a record that recalculates is not a record.
 */
export const FROZEN_PLAN_STATUSES = ['published', 'archived'] as const;

/** True for a plan whose meals must carry a valid snapshot. */
export function requiresFrozenNutrition(status: string): boolean {
  return (FROZEN_PLAN_STATUSES as readonly string[]).includes(status);
}

/**
 * What a stored `nutrition_snapshot` turned out to be.
 *
 * Four outcomes rather than "a snapshot or null", because the three non-valid ones
 * are not the same fact and must not be handled the same way. `absent` is a
 * deliberate state — it is what a draft looks like. `malformed` and `unsupported`
 * are damage, and on a published plan they are damage that would otherwise be
 * *indistinguishable from a draft*: the old reader returned null for all three, so
 * a corrupted blob on a published plan silently fell back to live calculation and
 * the plan started drifting again with nothing to say it had.
 */
export type SnapshotRead =
  | { status: 'absent' }
  | { status: 'valid'; snapshot: MealNutritionSnapshot }
  /** A recognisable snapshot from a version this build does not know how to read. */
  | { status: 'unsupported'; version: number }
  | { status: 'malformed'; reason: string };

/**
 * Reads and classifies a blob out of `jsonb`. Never throws — the caller decides
 * what a given failure means for the row it is on.
 *
 * Version-aware on purpose: a blob carrying `version: 2` is a snapshot this build
 * cannot read, which is a different problem from a blob carrying nonsense, and one
 * a future reader may well be able to fix by upgrading rather than by recomputing.
 */
export function readMealSnapshot(value: unknown): SnapshotRead {
  if (value === null || value === undefined) return { status: 'absent' };

  const parsed = mealNutritionSnapshotSchema.safeParse(value);
  if (parsed.success) return { status: 'valid', snapshot: parsed.data };

  const version =
    typeof value === 'object' && value !== null && typeof (value as { version?: unknown }).version === 'number'
      ? (value as { version: number }).version
      : null;

  if (version !== null && version !== SNAPSHOT_VERSION) return { status: 'unsupported', version };

  return { status: 'malformed', reason: parsed.error.issues[0]?.message ?? 'not a snapshot' };
}

/**
 * The valid snapshot in a stored value, or null for anything else.
 *
 * A convenience over {@link readMealSnapshot} for callers that genuinely do not
 * care why there is no usable snapshot — the backfill's write path, and tests.
 * Anything rendering a published plan must use `readMealSnapshot` instead, so that
 * "damaged" cannot be quietly read as "draft".
 */
export function parseMealSnapshot(value: unknown): MealNutritionSnapshot | null {
  const read = readMealSnapshot(value);
  return read.status === 'valid' ? read.snapshot : null;
}

/**
 * Raised when a plan that must carry frozen nutrition does not carry usable
 * frozen nutrition.
 *
 * Thrown rather than swallowed. The alternative — falling back to live numbers —
 * is the exact failure the freeze exists to prevent, and it is invisible: the
 * board renders, the patient portal renders, and the figures quietly track
 * whatever the catalog says today instead of what was prescribed. A failed read is
 * loud, is caught by `bun run db:check` before anyone sees it, and is repaired by
 * `bun run db:backfill:plan-snapshots --apply`.
 */
export class MealSnapshotError extends Error {
  constructor(readonly read: Exclude<SnapshotRead, { status: 'valid' }>) {
    super(
      read.status === 'absent'
        ? 'A published or archived meal carries no nutrition snapshot.'
        : read.status === 'unsupported'
          ? `A published or archived meal carries a nutrition snapshot of unsupported version ${read.version} (this build reads version ${SNAPSHOT_VERSION}).`
          : `A published or archived meal carries a malformed nutrition snapshot: ${read.reason}.`,
    );
    this.name = 'MealSnapshotError';
  }
}

/** What {@link resolveMealNutrition} hands back. */
export type ResolvedMealNutrition = {
  totals: NutrientTotals;
  grams: number;
  /**
   * True when the numbers came from a snapshot.
   *
   * Carried so the UI can tell a historical record from a live calculation — the
   * itemised ingredient list is still rendered from the *current* recipe, so on an
   * old plan the frozen total and the live breakdown can legitimately disagree and
   * the breakdown must not be presented as the prescription.
   */
  frozen: boolean;
};

/**
 * The single branch between frozen and live nutrition.
 *
 * ```
 * valid snapshot                        => use it
 * no snapshot, draft                    => calculate live
 * no snapshot, empty slot               => nothing to calculate
 * absent/damaged snapshot, published    => throw
 * ```
 *
 * The status is read here now, where before only the snapshot was. That was
 * deliberate and it was wrong: keying on the snapshot alone means "this plan was
 * never frozen" and "this plan's freeze is unreadable" produce identical
 * behaviour, and on a published plan those are a working copy and a silent
 * corruption respectively. The status is what says which of the two a null means.
 *
 * Shared by the staff board, the patient portal, and archived plans, so the three
 * cannot drift apart.
 */
export function resolveMealNutrition(input: {
  snapshot: SnapshotRead;
  /** True for a published or archived plan — see {@link requiresFrozenNutrition}. */
  requiresSnapshot: boolean;
  /**
   * The meal's resolved lines at the amounts prescribed, or null for an empty slot.
   *
   * Absolute, not per-serving: `mealIngredientLines` has already chosen between the
   * meal's own stored amounts and the scaled recipe. There is no multiplier here
   * because by this point there is nothing left to multiply — which is what keeps
   * a meal the dietitian adjusted by hand and one still following its dish on the
   * same single path.
   */
  lines: readonly NutrientSource[] | null;
}): ResolvedMealNutrition {
  if (input.snapshot.status === 'valid') {
    return { totals: input.snapshot.snapshot.totals, grams: input.snapshot.snapshot.grams, frozen: true };
  }

  // An empty slot has nothing to freeze and nothing to calculate, on any status.
  if (!input.lines) {
    return { totals: dishTotals([], 1), grams: 0, frozen: false };
  }

  if (input.requiresSnapshot) throw new MealSnapshotError(input.snapshot);

  return {
    totals: dishTotals(input.lines, 1),
    grams: dishGrams(input.lines, 1),
    frozen: false,
  };
}
