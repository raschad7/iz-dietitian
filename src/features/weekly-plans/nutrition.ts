/**
 * Every number the weekly-plan UI shows is computed here.
 *
 * Two layers, one file. The lower half is the arithmetic over `foods` rows —
 * unwinding the per-100 g basis, summing, splitting energy by macro. The upper
 * half ({@link dishTotals}) applies that to a dish's recipe at a serving
 * multiplier. They were separate files while meal plans V1 also needed the
 * arithmetic; weekly plans is now the only consumer, so the split bought a hop
 * and nothing else.
 *
 * Pure functions over plain objects: no database, no React, no Next.js. That is
 * what lets `nutrition.test.ts` assert the arithmetic directly, and it is the
 * reason totals are derived on every read rather than stored — a cached total is
 * a total that can disagree with the items it came from.
 */

/**
 * The nutrients carried through the whole feature, in the order they are
 * displayed. Adding one here and to the `foods` table is all it takes to surface
 * it in the meal detail panel.
 */
export const NUTRIENT_KEYS = [
  'kcal',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'sugar',
  'saturatedFat',
  'sodium',
  'cholesterol',
  'calcium',
  'iron',
  'potassium',
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** The three that carry energy, and the only ones present on every food. */
export const MACRO_KEYS = ['protein', 'carbs', 'fat'] as const;

export type MacroKey = (typeof MACRO_KEYS)[number];

/** Display units, fixed by the source data. */
export const NUTRIENT_UNITS = {
  kcal: 'kcal',
  protein: 'g',
  carbs: 'g',
  fat: 'g',
  fiber: 'g',
  sugar: 'g',
  saturatedFat: 'g',
  sodium: 'mg',
  cholesterol: 'mg',
  calcium: 'mg',
  iron: 'mg',
  potassium: 'mg',
} as const satisfies Record<NutrientKey, string>;

/**
 * Atwater general factors — kilocalories per gram. The conversion every
 * nutrition label uses.
 */
const KCAL_PER_GRAM = {
  protein: 4,
  carbs: 4,
  fat: 9,
} as const satisfies Record<MacroKey, number>;

/** A food's composition per 100 g, as stored. Null means "never measured". */
export type FoodNutrients = {
  [K in NutrientKey]: K extends 'kcal' | MacroKey ? number : number | null;
};

/**
 * A total, plus how much of it is unknown.
 *
 * `unmeasured` counts the items that had no value for this nutrient. It is not
 * decoration: summing a plan where three of eight foods never had their fibre
 * measured produces a number that is a floor, not an answer, and the UI has to
 * be able to say so.
 */
export type NutrientTotal = {
  value: number;
  unmeasured: number;
};

export type NutrientTotals = Record<NutrientKey, NutrientTotal>;

/** Whatever an item needs to contribute to a total. */
export type NutrientSource = {
  quantityGrams: number;
  food: FoodNutrients;
};

/**
 * Converts a food's per-100 g composition to the amount in `grams` of it.
 *
 * This is the only place the per-100 g basis is unwound. Everything downstream
 * works in absolute amounts, so totals are a plain sum.
 */
export function scaleNutrients({ food, quantityGrams }: NutrientSource): Record<NutrientKey, number | null> {
  const factor = quantityGrams / 100;
  const scaled = {} as Record<NutrientKey, number | null>;

  for (const key of NUTRIENT_KEYS) {
    const amount = food[key];
    scaled[key] = amount === null || amount === undefined ? null : amount * factor;
  }

  return scaled;
}

/** A zeroed total — also the correct answer for an empty meal. */
export function emptyTotals(): NutrientTotals {
  const totals = {} as NutrientTotals;
  for (const key of NUTRIENT_KEYS) totals[key] = { value: 0, unmeasured: 0 };
  return totals;
}

/**
 * Sums a set of items.
 *
 * A null contribution is skipped rather than counted as zero — "not measured"
 * and "contains none of it" are different claims, and only the second one is
 * safe to add. The skipped item is recorded in `unmeasured` instead.
 */
export function sumNutrients(sources: readonly NutrientSource[]): NutrientTotals {
  const totals = emptyTotals();

  for (const source of sources) {
    const scaled = scaleNutrients(source);

    for (const key of NUTRIENT_KEYS) {
      const amount = scaled[key];
      if (amount === null) totals[key].unmeasured += 1;
      else totals[key].value += amount;
    }
  }

  return totals;
}

/** Adds already-computed totals — used to roll meals up into a day. */
export function combineTotals(parts: readonly NutrientTotals[]): NutrientTotals {
  const totals = emptyTotals();

  for (const part of parts) {
    for (const key of NUTRIENT_KEYS) {
      totals[key].value += part[key].value;
      totals[key].unmeasured += part[key].unmeasured;
    }
  }

  return totals;
}

export type EnergySplit = Record<MacroKey, { grams: number; kcal: number; percent: number }>;

/**
 * How the day's energy divides between protein, carbohydrate and fat.
 *
 * Percentages are taken against the energy the macros themselves account for,
 * NOT against the `kcal` column. The two differ — alcohol carries energy no
 * macro accounts for, and USDA derives `kcal` per food with food-specific
 * factors rather than the general 4/4/9 — so dividing by `kcal` yields splits
 * that do not total 100% and look like a bug in the page.
 */
export function energySplit(totals: NutrientTotals): EnergySplit {
  const kcalByMacro = {} as Record<MacroKey, number>;
  let macroKcal = 0;

  for (const key of MACRO_KEYS) {
    const kcal = totals[key].value * KCAL_PER_GRAM[key];
    kcalByMacro[key] = kcal;
    macroKcal += kcal;
  }

  const split = {} as EnergySplit;

  for (const key of MACRO_KEYS) {
    split[key] = {
      grams: totals[key].value,
      kcal: kcalByMacro[key],
      // A plan with no items has no split to show; 0% keeps the bars empty
      // rather than dividing by zero.
      percent: macroKcal === 0 ? 0 : kcalByMacro[key] / macroKcal,
    };
  }

  return split;
}

/**
 * Rounding for display. Energy and the milligram nutrients are whole numbers;
 * grams get one decimal, because 0.4 g of something is a real distinction and
 * 0.43 g is false precision.
 */
export function roundForDisplay(key: NutrientKey, value: number): number {
  const places = NUTRIENT_UNITS[key] === 'g' ? 1 : 0;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** A recipe line, as the queries hand it over. */
export type DishIngredientDetail = {
  /** Grams for ONE base serving. */
  quantityGrams: number;
  food: { id: string; description: string } & FoodNutrients;
};

export type DishDetail = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  mealTypes: string[];
  tags: string[];
  allergenTags: string[];
  baseServingLabel: string;
  /** False for a retired dish. It stays readable on the plans that already use it. */
  isActive: boolean;
  ingredients: DishIngredientDetail[];
};

/**
 * Scales a recipe to `servings` and sums it.
 *
 * The multiplier is applied to the grams, not to the totals: multiplying a total
 * would give the same answer for the macros but would also multiply
 * `unmeasured`, turning "one ingredient's fibre is unknown" into "one and a half
 * ingredients' fibre is unknown".
 */
export function dishTotals(
  ingredients: readonly DishIngredientDetail[],
  servings: number,
): NutrientTotals {
  const sources: NutrientSource[] = ingredients.map((ingredient) => ({
    quantityGrams: ingredient.quantityGrams * servings,
    food: ingredient.food,
  }));

  return sumNutrients(sources);
}

/**
 * Energy for one base serving of a dish.
 *
 * Used to size a dish against a slot budget before any plan exists — which is how
 * `similar.ts` ranks candidates and how the prompt tells the model what it is
 * choosing between.
 */
export function baseServingKcal(ingredients: readonly DishIngredientDetail[]): number {
  return dishTotals(ingredients, 1).kcal.value;
}
