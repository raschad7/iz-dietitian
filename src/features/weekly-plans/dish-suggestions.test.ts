import { describe, expect, test } from 'bun:test';

import { isAnimalFood, suggestAllergens, suggestVegan, suggestVegetarian } from './dish-suggestions';

/**
 * What the review step is allowed to propose about a recipe.
 *
 * The suggestions are prompts a dietitian confirms, so the bar here is not
 * "catches everything" — it is "does not embarrass itself": the obvious carriers
 * are found, and the near-misses that would teach a dietitian to ignore the
 * proposals (flour read as tahini, sunflower seeds read as nuts) are not.
 */

const food = (nameAr: string, nameEn: string, category = 'other') => ({ nameAr, nameEn, category });

const bread = food('خبز عربي', 'Arabic bread', 'grains');
const rice = food('أرز أبيض مطبوخ', 'White rice, cooked', 'grains');
const flour = food('طحين أبيض', 'White flour', 'grains');
const tahini = food('طحينة', 'Tahini', 'nuts_seeds');
const sunflower = food('بذور دوار الشمس', 'Sunflower seeds', 'nuts_seeds');
const almonds = food('لوز', 'Almonds', 'nuts_seeds');
const yogurt = food('لبن زبادي', 'Yogurt, plain', 'dairy_eggs');
const egg = food('بيض مسلوق', 'Egg, boiled', 'dairy_eggs');
const chicken = food('صدر دجاج مشوي', 'Chicken breast, grilled', 'poultry');
const lentils = food('عدس مطبوخ', 'Lentils, cooked', 'legumes');
const tomato = food('طماطم', 'Tomato', 'vegetables');
const oliveOil = food('زيت زيتون', 'Olive oil', 'fats_oils');

describe('suggestAllergens', () => {
  test('finds the allergen a food is named after', () => {
    expect(suggestAllergens([bread])).toEqual(['gluten']);
    expect(suggestAllergens([yogurt])).toEqual(['lactose', 'milk']);
    expect(suggestAllergens([egg])).toEqual(['egg']);
    expect(suggestAllergens([almonds])).toEqual(['nuts', 'tree_nuts']);
    expect(suggestAllergens([tahini])).toEqual(['sesame']);
  });

  /** The category is decisive for fish, so a clinic's own "فيليه مشوي" is caught too. */
  test('reads the fish category without needing the name', () => {
    expect(suggestAllergens([food('سمك اليوم', 'Catch of the day', 'fish')])).toEqual(['fish']);
  });

  test('proposes nothing for a recipe that carries nothing', () => {
    expect(suggestAllergens([rice, lentils, tomato, oliveOil])).toEqual([]);
  });

  /**
   * The two near-misses worth pinning. طحين (flour) is a prefix of طحينة
   * (tahini), and `nuts_seeds` holds seeds that are not nuts. A dietitian who is
   * told a bag of flour contains sesame stops reading the proposals at all.
   */
  test('does not read flour as tahini, or seeds as nuts', () => {
    expect(suggestAllergens([flour])).toEqual(['gluten']);
    expect(suggestAllergens([sunflower])).toEqual([]);
  });

  test('returns each allergen once, in ALLERGENS order', () => {
    expect(suggestAllergens([tahini, bread, yogurt, bread])).toEqual(['lactose', 'milk', 'gluten', 'sesame']);
  });

  test('normalizes Arabic, so spelling variants still match', () => {
    expect(suggestAllergens([food('بَيْض بلدي', '')])).toEqual(['egg']);
    expect(suggestAllergens([food('خُبز الشعير', '')])).toEqual(['gluten']);
  });

  /** A clinic food may have only an Arabic name, or only an English one. */
  test('matches on either name alone', () => {
    expect(suggestAllergens([food('', 'Whole wheat pita')])).toEqual(['gluten']);
    expect(suggestAllergens([food('جبنة بيضاء', '')])).toEqual(['lactose', 'milk']);
  });

  test('distinguishes peanut and tree nuts and does not call peanut butter dairy', () => {
    expect(suggestAllergens([food('زبدة الفول السوداني', 'Peanut butter', 'nuts_seeds')])).toEqual([
      'nuts',
      'peanut',
    ]);
    expect(suggestAllergens([almonds])).toEqual(['nuts', 'tree_nuts']);
  });
});

describe('suggestVegetarian', () => {
  test('is true when nothing in the recipe is an animal food', () => {
    expect(suggestVegetarian([rice, lentils, tomato, oliveOil])).toBe(true);
  });

  test('allows egg and dairy but refuses meat or fish', () => {
    expect(suggestVegetarian([rice, tomato, chicken])).toBe(false);
    expect(suggestVegetarian([rice, yogurt])).toBe(true);
    expect(suggestVegetarian([lentils, egg])).toBe(true);
  });

  test('vegan accepts only explicit plant foods', () => {
    expect(suggestVegan([rice, lentils, tomato, oliveOil])).toBe(true);
    expect(suggestVegan([rice, yogurt])).toBe(false);
    expect(suggestVegan([food('خلطة البيت', 'House mix')])).toBe(false);
  });

  /** An empty recipe is not a vegetarian dish; it is not a dish yet. */
  test('is false for an empty recipe', () => {
    expect(suggestVegetarian([])).toBe(false);
  });

  /** A clinic's own food lands in `other`, so the name has to carry it. */
  test('reads an animal food a clinic added under the generic category', () => {
    expect(isAnimalFood(food('شاورما دجاج', 'Chicken shawarma'))).toBe(true);
    expect(isAnimalFood(food('حمص بطحينة', 'Hummus with tahini'))).toBe(false);
  });
});
