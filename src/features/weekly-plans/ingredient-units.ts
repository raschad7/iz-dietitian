/**
 * The measurement menu for one ingredient row.
 *
 * A dietitian types a quantity and picks a unit — 2 حبة, 1 كوب, 150 غرام — and the
 * nutrition engine needs grams. This module turns a food's `catalog_food_portions`
 * rows into that menu and does the one multiplication: `quantity × gramsPerUnit`.
 *
 * ## Grams is the source of truth, and there is only one calculation
 *
 * `dish_ingredients.quantity_grams` is what every total is built from, through
 * `dishTotals` and the per-100 g pipeline in `nutrition.ts` — unchanged. A portion
 * is a data-entry convenience whose *only* job is to produce that number and to
 * record how it was produced. Nothing here is a second nutrition path, which is
 * why editing a portion's weight later cannot move a recipe: the grams were
 * already written.
 *
 * ## What this used to be
 *
 * It used to parse a USDA label string ("1 pita, large (6-1/2\" dia)") on every
 * render, classify the unit word against two hand-written word lists, and derive
 * halves and quarters in the browser. That derivation still exists — it runs once,
 * at dataset build time, in `portion-derivation.ts` — and its output is rows a
 * person can read and correct. What is left here is selection and arithmetic.
 */

import { localizedPortionLabel } from './food-display';

/** The value the grams option carries. Not a uuid, so it can never collide with a portion id. */
export const GRAMS_UNIT = 'g';

/** One portion of a food, as the queries hand it over. */
export type FoodPortion = {
  id: string;
  labelAr: string;
  labelEn: string;
  /** What one of this portion weighs. Always > 0 — the column is constrained. */
  grams: number;
  isDefault: boolean;
  sortOrder: number;
};

export type UnitOption = {
  /** `'g'`, or a `catalog_food_portions.id`. */
  value: string;
  /** Grams one of this unit weighs. `1` for grams. */
  gramsPerUnit: number;
  /** Null for grams, whose label is a translated string rather than stored data. */
  portion: FoodPortion | null;
};

/** The food fields this module reads — a subset of `FoodSearchResult`. */
export type UnitFood = {
  portions: readonly FoodPortion[];
};

/** Grams itself: always offered, always the nutrition basis. */
export const GRAMS_OPTION: UnitOption = { value: GRAMS_UNIT, gramsPerUnit: 1, portion: null };

/**
 * The units a food may be entered in: grams first, then its own portions.
 *
 * Grams leads because it is the one unit every food has and the one every figure
 * is ultimately in — a menu whose first entry disappears from food to food is a
 * menu you have to read before you can use. Which unit is *selected* is a separate
 * question; see {@link defaultUnitValue}.
 */
export function unitOptions(food: UnitFood): UnitOption[] {
  const portions = [...food.portions].sort((a, b) => a.sortOrder - b.sortOrder);

  return [
    GRAMS_OPTION,
    ...portions
      // Defensive: the column is constrained positive, but a zero here would
      // silently convert every quantity to nothing.
      .filter((portion) => Number.isFinite(portion.grams) && portion.grams > 0)
      .map((portion) => ({ value: portion.id, gramsPerUnit: portion.grams, portion })),
  ];
}

/**
 * The unit a freshly picked food starts in: its default portion, else grams.
 *
 * A food that comes with a measured household portion is one a dietitian thinks of
 * in that unit — a رغيف of bread, a كوب of rice — so starting there saves the
 * conversion they would otherwise do in their head. A food with none starts in
 * grams and the quantity starts blank.
 */
export function defaultUnitValue(food: UnitFood): string {
  return food.portions.find((portion) => portion.isDefault)?.id ?? GRAMS_UNIT;
}

export function findUnitOption(options: readonly UnitOption[], value: string): UnitOption | undefined {
  return options.find((option) => option.value === value);
}

/** A unit's label in the reader's language. Grams has no stored label, so it is passed in. */
export function unitLabel(option: UnitOption, locale: string, gramsLabel: string): string {
  return option.portion ? localizedPortionLabel(option.portion, locale) : gramsLabel;
}

/**
 * The grams a row contributes: `quantity × gramsPerUnit`.
 *
 * A blank or non-positive quantity, or a unit this food does not offer, contributes
 * nothing — the row is mid-edit, not a mistake, and the editor simply leaves it out
 * of the recipe until it is finished.
 */
export function rowGrams(options: readonly UnitOption[], quantity: number, value: string): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return 0;
  const option = findUnitOption(options, value);
  return option ? quantity * option.gramsPerUnit : 0;
}

/**
 * What one press of `−` or `+` changes an ingredient by, in its own unit.
 *
 * Keyed on the English label because that is a closed vocabulary — `FAMILY_ROWS`
 * in `portion-derivation.ts` and `CUSTOM_UNIT_LABELS` are the only things that
 * write these strings, and the Arabic label is a translation of them rather than a
 * second source.
 *
 * The steps are the increments a dietitian actually writes. Bread moves by half a
 * loaf because half a loaf is a real instruction; an egg does not, because half an
 * egg is not. A unit whose own label already names a fraction (`نصف كوب`) steps by
 * whole ones — quarter of a half cup is arithmetic nobody serves.
 */
const UNIT_STEPS: Record<string, number> = {
  Cup: 0.25,
  Loaf: 0.5,
  Container: 0.5,
};

/**
 * How many grams one press moves an ungrammed ingredient by.
 *
 * Ten, not five or twenty-five: meat and fish are the foods measured this way, a
 * dietitian moves them in tens, and a finer step turns "add 30 g of chicken" into
 * six presses.
 */
export const GRAMS_STEP = 10;

/**
 * The step for one unit — its own increment, or {@link GRAMS_STEP} for grams.
 *
 * Takes the label alone rather than a whole portion row, so a planned meal's line
 * (which carries only what it needs to render) can ask without reconstructing a
 * `FoodPortion` it has no other use for.
 */
export function unitStep(portion: { labelEn: string } | null | undefined): number {
  if (!portion) return GRAMS_STEP;
  return UNIT_STEPS[portion.labelEn] ?? 1;
}

/**
 * The next quantity after a press, snapped to the unit's own grid and never
 * falling to nothing.
 *
 * Clamped at one step rather than at zero: an ingredient at zero is a line that
 * reads "0 رغيف", which is not a smaller portion but a removed one, and removing
 * an ingredient is a different action from making it smaller.
 */
export function stepQuantity(quantity: number, step: number, direction: -1 | 1): number {
  // Move to the next point on the step grid **in the direction pressed**, rather
  // than adding a step and rounding. The two agree on a value already on the grid
  // and disagree on one that is not: 1.35 loaves + half a loaf rounds to 2, which
  // is a whole loaf and a bit more than the press asked for. Walking the grid
  // gives 1.5 — tidied up, and one press away.
  //
  // A value off the grid is normal, not exotic: it is what a scaled recipe leaves
  // behind, and every press afterwards should be bringing it back to something
  // countable.
  const grid = quantity / step;
  // Float representation: 1.5 / 0.5 can be 2.9999999999999996, and flooring that
  // would step to the value it is already at.
  const epsilon = 1e-9;
  const next =
    direction === 1 ? Math.floor(grid + epsilon) + 1 : Math.ceil(grid - epsilon) - 1;

  // Float noise again on the way back out: 0.1 + 0.2 must not print as
  // 0.30000000000000004 loaves.
  const clean = Math.round(next * step * 1000) / 1000;

  return Math.max(step, clean);
}

/**
 * Reopens a saved ingredient as a `{ unit, quantity }` row **without ever changing
 * the grams it holds**.
 *
 * The stored `quantity_grams` is authoritative. When the saved portion is one this
 * food still offers, the quantity is that weight expressed back in the portion
 * (100 g of egg → "2 حبة"), so reopening and saving an untouched dish writes the
 * same grams. When the portion has since been retired — `portion_id` is
 * `on delete set null` — the row falls back to grams and the exact stored weight,
 * rather than rescaling the recipe onto whatever unit is left.
 */
export function resolveSavedRow(
  food: UnitFood,
  saved: { quantityGrams: number; portionId: string | null },
): { unitValue: string; quantity: number } {
  const options = unitOptions(food);
  const match = saved.portionId ? findUnitOption(options, saved.portionId) : undefined;

  if (match && match.gramsPerUnit > 0) {
    return { unitValue: match.value, quantity: saved.quantityGrams / match.gramsPerUnit };
  }

  return { unitValue: GRAMS_UNIT, quantity: saved.quantityGrams };
}
