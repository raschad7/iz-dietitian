/**
 * What a dish is *made of*, in the two terms a week is varied by.
 *
 * The model was given a dish's name, its meal types, its practical tags and its
 * energy — and nothing at all about its contents. So it had no way to know that
 * فتة حمص، طبق حمص، جزر مع حمص، حمص بالطحينة، يخنة حمص and صحن فلافل are all
 * chickpeas, and a week that obeyed "do not repeat a dish more than twice" to the
 * letter still put chickpeas in eight meals out of thirty-five.
 *
 * A rule about dishes cannot fix that, because the repetition is not in the
 * dishes. This module names the two things a person actually notices repeating —
 * **what the protein was** and **what it was eaten with** — and derives both from
 * the recipe, so they cannot be hand-set wrong and cannot go stale when a recipe
 * changes. Same discipline as `nutritionCategory`: computed, never stored.
 *
 * They are used twice. `prompt.ts` puts them in the catalog table so the model can
 * see what it is repeating, and `variety.ts` checks the finished plan against them
 * — because a prompt asks and only code can guarantee.
 *
 * ## Why the biggest contributor and not a list
 *
 * A dish has one protein everyone would name. مجدرة is lentils even though it
 * holds rice, and دجاج مع أرز is chicken even though the rice outweighs it. The
 * food contributing the most *protein* is that answer in every case in the
 * catalog, and one answer is what makes "not twice in a day" a rule with an
 * obvious meaning.
 */

import type { DishIngredientDetail } from './nutrition';

/**
 * Where a dish's protein comes from.
 *
 * Split finer than the food categories are: `meat` and `poultry` are one
 * category's worth of difference to a database and a completely different meal to
 * a person, while eggs and yogurt share `dairy_eggs` and are never eaten as the
 * same thing.
 */
export const PROTEIN_SOURCES = [
  'red_meat',
  'poultry',
  'fish',
  'egg',
  'dairy',
  'legume',
  'nuts',
  'none',
] as const;

export type ProteinSource = (typeof PROTEIN_SOURCES)[number];

/** What the dish is eaten with — the starch a person would name. */
export const CARB_BASES = ['rice', 'bread', 'bulgur', 'pasta', 'couscous', 'oats', 'potato', 'none'] as const;

export type CarbBase = (typeof CARB_BASES)[number];

/**
 * Which source a food belongs to.
 *
 * `dairy_eggs` is the one category that needs its contents read: the English
 * description is the dataset's own controlled vocabulary — every shared food
 * carries the USDA description it was built from — so matching on it is reading
 * the data rather than guessing at it. A clinic's own food may have no English
 * name, and falls to `dairy`, which is what the category says.
 */
function proteinSourceOf(food: DishIngredientDetail['food']): ProteinSource | null {
  const category = food.category ?? '';
  const name = food.nameEn.toLowerCase();

  if (category === 'meat') return 'red_meat';
  if (category === 'poultry') return 'poultry';
  if (category === 'fish') return 'fish';
  if (category === 'legumes') return 'legume';
  if (category === 'nuts_seeds') return 'nuts';
  if (category === 'dairy_eggs') return name.includes('egg') ? 'egg' : 'dairy';

  return null;
}

/** The starch a food is, or null for a food that is not one. */
function carbBaseOf(food: DishIngredientDetail['food']): CarbBase | null {
  const category = food.category ?? '';
  const name = food.nameEn.toLowerCase();

  if (category === 'grains') {
    if (name.includes('rice')) return 'rice';
    if (name.includes('bread') || name.includes('pita')) return 'bread';
    if (name.includes('bulgur')) return 'bulgur';
    if (name.includes('macaroni') || name.includes('pasta') || name.includes('spaghetti')) {
      return 'pasta';
    }
    if (name.includes('couscous')) return 'couscous';
    if (name.includes('oat')) return 'oats';
    return null;
  }

  // Potato is a vegetable to the catalog and a starch to a plate.
  if (category === 'vegetables' && name.includes('potato')) return 'potato';

  return null;
}

/**
 * The dish's protein source: whichever food contributes the most protein.
 *
 * `none` for a dish with no meaningful protein food in it — a fruit snack, a
 * salad, a vegetable soup. That is an answer, not a gap: three of those in a row
 * is its own kind of monotony and the variety rules count it like any other.
 */
export function proteinSource(recipe: readonly DishIngredientDetail[]): ProteinSource {
  let best: ProteinSource = 'none';
  let most = 0;

  for (const line of recipe) {
    const source = proteinSourceOf(line.food);
    if (!source) continue;

    const protein = (line.food.protein * line.quantityGrams) / 100;
    if (protein > most) {
      best = source;
      most = protein;
    }
  }

  return best;
}

/** The dish's starch: whichever one contributes the most carbohydrate. */
export function carbBase(recipe: readonly DishIngredientDetail[]): CarbBase {
  let best: CarbBase = 'none';
  let most = 0;

  for (const line of recipe) {
    const base = carbBaseOf(line.food);
    if (!base) continue;

    const carbs = (line.food.carbs * line.quantityGrams) / 100;
    if (carbs > most) {
      best = base;
      most = carbs;
    }
  }

  return best;
}
