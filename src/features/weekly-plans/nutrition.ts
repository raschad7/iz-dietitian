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

/** The measure an amount was entered in. Display only — see {@link DishIngredientDetail}. */
export type IngredientPortion = {
  id: string;
  labelAr: string;
  labelEn: string;
  /** What one of it weighs. Recorded for display; the grams below are what count. */
  grams: number;
};

/** A recipe line, as the queries hand it over. */
export type DishIngredientDetail = {
  /**
   * Grams for ONE base serving, and the **only** quantity any total is built
   * from. A portion below never enters this arithmetic.
   */
  quantityGrams: number;
  food: { id: string; nameAr: string; nameEn: string } & FoodNutrients;
  /**
   * How the dietitian typed the amount — "2 حبة" rather than "100 غرام".
   *
   * Purely a record of the entry, so the editor and the recipe list can show the
   * unit it was written in. Null when the amount was entered in grams, and null
   * again if the portion has since been retired, in which case the grams above
   * are shown instead. Optional so a caller that only needs nutrition (the live
   * editor preview) need not carry it.
   */
  portion?: IngredientPortion | null;
  portionQuantity?: number | null;
};

export type DishDetail = {
  id: string;
  /** The owning clinic, or null for a shared built-in dish — what tells "my dish" from a system dish. */
  clinicId: string | null;
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
 * A dish's total weight in grams at a serving multiplier.
 *
 * The multiplier scales the grams, exactly as {@link dishTotals} scales them
 * before summing nutrients — so the weight shown to a client always matches the
 * calories shown, both derived from the same recipe at the same serving. This is
 * what replaced the abstract "×N portions" the UI used to print: a real amount a
 * person can act on, with no new data stored.
 */
export function dishGrams(
  ingredients: readonly { quantityGrams: number }[],
  servings: number,
): number {
  return ingredients.reduce((total, ingredient) => total + ingredient.quantityGrams * servings, 0);
}

/**
 * Rounds a gram figure for display.
 *
 * A single food reads to the nearest gram (`step` 1); a whole dish to the nearest
 * 5 g (`step` 5), because "≈ 445 g" is a weight someone acts on and the trailing
 * digit is precision the recipe never promised.
 */
export function roundGrams(value: number, step: 1 | 5 = 1): number {
  return Math.round(value / step) * step;
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

/**
 * The single nutrition label a dish carries, worked out from its own macros.
 *
 * Computed, never stored: change the recipe and the label follows, so it cannot
 * go stale the way a hand-typed "high protein" tag does. Uses `energySplit`, so
 * the percentages are shares of the energy the macros account for — the same
 * basis the meal panel uses, which sidesteps the divide-by-`kcal` rounding
 * problem noted on `energySplit`.
 *
 * Exactly one label. When a dish crosses more than one cutoff, the one it beats
 * by the widest margin wins, so there is never a tie to resolve in the UI.
 */
export const NUTRITION_CATEGORIES = ['high_protein', 'high_carb', 'high_fat', 'balanced'] as const;

export type NutritionCategory = (typeof NUTRITION_CATEGORIES)[number];

export function nutritionCategory(totals: NutrientTotals): NutritionCategory {
  const split = energySplit(totals);

  // Each macro's share minus its cutoff. A positive margin means the dish
  // qualifies for that label; the widest positive margin is the label it gets.
  const candidates = [
    { label: 'high_protein' as const, margin: split.protein.percent - 0.3 },
    { label: 'high_carb' as const, margin: split.carbs.percent - 0.55 },
    { label: 'high_fat' as const, margin: split.fat.percent - 0.4 },
  ];

  const crossed = candidates.filter((candidate) => candidate.margin >= 0);
  if (crossed.length === 0) return 'balanced';

  return crossed.reduce((best, candidate) => (candidate.margin > best.margin ? candidate : best)).label;
}
