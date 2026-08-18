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
