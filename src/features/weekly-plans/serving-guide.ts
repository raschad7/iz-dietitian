/**
 * What to tell a person to put on the plate — as opposed to what the recipe is
 * made of.
 *
 * The meal card briefly listed every recipe line: onion, oil, tomato paste, 2 g of
 * cumin, 1 g of salt. That is a *production* list. It is correct, it is what the
 * nutrition is built from, and it is not a serving instruction — nobody measures a
 * gram of salt onto a plate, and burying "100 g of meat" among nine such lines
 * hides the only two numbers a patient acts on.
 *
 * So the two things are separated. The recipe stays exactly where it was, feeding
 * `dishTotals` unchanged and still readable by staff under the ingredients
 * disclosure. This module owns the other half: **at most two meaningful lines per
 * dish**, hand-written per dish slug, in the units a person serves in.
 *
 * ## Why a code registry and not a table
 *
 * A serving guide is editorial content that ships with the dish catalog, changes
 * with it, and is reviewed in a diff. It has no per-clinic variation and nothing
 * writes it at runtime, so a table and a migration would buy nothing and cost a
 * schema. Adding a dish's guide is one object literal.
 *
 * ## The rule these entries obey
 *
 * **Nothing here is invented.** Every amount is either the recipe's own grams
 * restated, or a household count the catalog itself defines — an egg is 50 g
 * (`egg-raw`'s only portion), a white pita loaf is 60 g, a whole-wheat one 64 g.
 * The single cooked conversion in this file, 50 g of dry rice served as six
 * tablespoons cooked, is stated for the two dishes that carry exactly 50 g of rice
 * and is pinned by a test. Dishes whose amounts do not land on a clean household
 * count simply get **no guide**, and the card falls back to the meal's weight —
 * see `mealServingLines` in the panel. A missing guide is safe; a guessed one is
 * a clinical instruction nobody wrote.
 */

import { isArabicLocale } from './food-display';
import { formatQuantity, pluralizeEnglishUnit } from './meal-quantity';
import { SERVING_STEP } from './similar';

/** One line a patient reads: a thing, an amount, and the unit it is served in. */
export type ServingGuideItem = {
  labelAr: string;
  labelEn: string;
  /** The amount for **one** base serving. Scaled by the meal's servings. */
  amount: number;
  unitAr: string;
  unitEn: string;
  /**
   * The Arabic plural, for the 3–10 range that takes one (ملعقة → ملاعق).
   *
   * Optional because most of these units do not change: a dietitian writes
   * `2 حبة` and `6 ملاعق كبيرة`, and a rule that inflected everything would
   * produce the first of those wrongly.
   */
  unitArPlural?: string;
};

export type ServingGuide = {
  /**
   * What one press of `+` adds, for this dish.
   *
   * A dish served in whole eggs and loaves steps by 1; a stew served by the
   * spoonful steps by half. Still a multiple of the global quarter grid, so the
   * value written to `weekly_plan_meals.servings` stays legal.
   */
  step: number;
  /** One or two lines. Never more — that is the entire point of this file. */
  items: readonly [ServingGuideItem] | readonly [ServingGuideItem, ServingGuideItem];
};

const EGG = { labelAr: 'بيض', labelEn: 'Eggs', unitAr: 'حبة', unitEn: 'egg' } as const;
const PITA = { labelAr: 'خبز عربي', labelEn: 'Arabic bread', unitAr: 'رغيف', unitEn: 'loaf' } as const;
const GRAMS = { unitAr: 'غ', unitEn: 'g' } as const;

/** Two eggs — 100 g of egg, at the catalog's own 50 g a piece. */
const TWO_EGGS: ServingGuideItem = { ...EGG, amount: 2 };
/** One loaf — the 60 g of pita these dishes carry, at the catalog's 60 g a loaf. */
const ONE_LOAF: ServingGuideItem = { ...PITA, amount: 1 };

/**
 * 50 g of dry rice, served. The one cooked conversion in this file: it is written
 * here once, applies only to the two dishes that carry exactly 50 g, and is pinned
 * by a test rather than derived by a formula that would spread to every dish.
 */
const RICE_50G_COOKED: ServingGuideItem = {
  labelAr: 'أرز مطبوخ',
  labelEn: 'Cooked rice',
  amount: 6,
  unitAr: 'ملعقة كبيرة',
  unitArPlural: 'ملاعق كبيرة',
  unitEn: 'tablespoon',
};

/**
 * The guides, by dish slug.
 *
 * Deliberately partial. Coverage grows a dish at a time as amounts are confirmed;
 * every dish without an entry already renders correctly through the fallback, so
 * there is never pressure to fill this in with guesses.
 */
export const SERVING_GUIDES: Record<string, ServingGuide> = {
  // --- Eggs, in whole eggs. Every one of these carries exactly 100 g of egg. ---
  'eggs-zaatar': { step: 1, items: [TWO_EGGS, ONE_LOAF] },
  'eggs-toast-tomato': { step: 1, items: [TWO_EGGS, ONE_LOAF] },
  'boiled-eggs-bread-veg': { step: 1, items: [TWO_EGGS, ONE_LOAF] },
  'boiled-eggs-salad': { step: 1, items: [TWO_EGGS] },
  'scrambled-eggs-cheese': {
    step: 1,
    items: [TWO_EGGS, { labelAr: 'جبنة بيضاء', labelEn: 'White cheese', amount: 30, ...GRAMS }],
  },
  'egg-sandwich': {
    step: 1,
    // 70 g of pita is not a whole loaf, so it is stated as the weight it is.
    items: [TWO_EGGS, { ...PITA, amount: 70, ...GRAMS }],
  },

  // --- Bread plates. All carry 60 g of pita — one loaf. ---
  'labaneh-zeit-pita': {
    step: 0.5,
    items: [{ labelAr: 'لبنة', labelEn: 'Labneh', amount: 150, ...GRAMS }, ONE_LOAF],
  },
  'hummus-tahini-breakfast': {
    step: 0.5,
    items: [{ labelAr: 'حمص', labelEn: 'Hummus', amount: 130, ...GRAMS }, ONE_LOAF],
  },
  'foul-mudammas': {
    step: 0.5,
    items: [{ labelAr: 'فول', labelEn: 'Foul', amount: 200, ...GRAMS }, ONE_LOAF],
  },
  'chicken-shawarma-plate': {
    step: 0.5,
    items: [{ labelAr: 'دجاج', labelEn: 'Chicken', amount: 130, ...GRAMS }, ONE_LOAF],
  },

  // --- Stews served over rice, and grilled plates. Meat and chicken by weight,
  //     which is how they are already recorded and how a dietitian prescribes them.
  'bamia-lahm': {
    step: 0.5,
    items: [RICE_50G_COOKED, { labelAr: 'لحم', labelEn: 'Meat', amount: 100, ...GRAMS }],
  },
  'green-beans-lahm': {
    step: 0.5,
    items: [RICE_50G_COOKED, { labelAr: 'لحم', labelEn: 'Meat', amount: 100, ...GRAMS }],
  },
  'dajaj-batata-mashwi': {
    step: 0.5,
    items: [
      { labelAr: 'دجاج', labelEn: 'Chicken', amount: 130, ...GRAMS },
      { labelAr: 'بطاطا', labelEn: 'Potato', amount: 150, ...GRAMS },
    ],
  },
  'chicken-sweet-potato': {
    step: 0.5,
    items: [
      { labelAr: 'دجاج', labelEn: 'Chicken', amount: 150, ...GRAMS },
      { labelAr: 'بطاطا حلوة', labelEn: 'Sweet potato', amount: 180, ...GRAMS },
    ],
  },
  'kofta-bel-forn': {
    step: 0.5,
    items: [
      { labelAr: 'لحم', labelEn: 'Meat', amount: 100, ...GRAMS },
      { labelAr: 'بطاطا', labelEn: 'Potato', amount: 100, ...GRAMS },
    ],
  },
};

/** The guide for a dish, or null — which is a normal, safe answer. */
export function servingGuideFor(slug: string | null | undefined): ServingGuide | null {
  return (slug && SERVING_GUIDES[slug]) || null;
}

/**
 * What one press of `+` or `−` changes the meal by.
 *
 * The dish's own step where there is a guide, the global quarter otherwise. Every
 * value is a multiple of `SERVING_STEP`, so `snapServings` still lands on the grid
 * and the stored multiplier stays legal.
 */
export function servingStepFor(guide: ServingGuide | null): number {
  return guide?.step ?? SERVING_STEP;
}

/** A rendered line: the thing on the left, the amount on the right. */
export type ServingGuideLine = { label: string; amount: string };

/** Weight units keep their symbol at every count. "2 gs" is not a thing. */
function isWeightUnit(unitEn: string): boolean {
  return unitEn === 'g' || unitEn === 'kg' || unitEn === 'ml';
}

/** One item's amount at this meal's servings, written for the reader. */
export function servingGuideAmount(
  item: ServingGuideItem,
  servings: number,
  locale: string,
): string {
  const multiplier = Number.isFinite(servings) && servings > 0 ? servings : 1;
  const scaled = item.amount * multiplier;
  const arabic = isArabicLocale(locale);

  if (isWeightUnit(item.unitEn)) {
    // Weights round to whole units — half a gram of meat is not an instruction.
    const rounded = Math.round(scaled);
    return `${rounded} ${arabic ? item.unitAr : item.unitEn}`;
  }

  const written = arabic
    ? // Arabic inflects the 3–10 range and leaves everything else alone, which is
      // also how a dietitian writes it: `2 حبة`, but `6 ملاعق كبيرة`.
      (scaled >= 3 && item.unitArPlural) || item.unitAr
    : pluralizeEnglishUnit(item.unitEn, scaled);

  return `${formatQuantity(scaled, locale)} ${written}`;
}

/** The whole guide at this meal's servings — one or two lines, never more. */
export function servingGuideLines(
  guide: ServingGuide,
  servings: number,
  locale: string,
): ServingGuideLine[] {
  return guide.items.map((item) => ({
    label: isArabicLocale(locale) ? item.labelAr : item.labelEn,
    amount: servingGuideAmount(item, servings, locale),
  }));
}
