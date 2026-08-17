import { describe, expect, test } from 'bun:test';

import { refineIngredientResults } from './ingredient-refine';
import type { FoodSearchResult } from './queries';

/**
 * The refine step is what turns the `عدس` screenshot from seven English rows into
 * a short Arabic-first list. These tests use the real SR Legacy descriptions that
 * search returns for "lentils".
 */
function food(
  id: string,
  description: string,
  extra: Partial<FoodSearchResult> = {},
): FoodSearchResult {
  return {
    id,
    description,
    nameAr: null,
    category: 'Legumes and Legume Products',
    portionGrams: null,
    portionLabel: null,
    kcal: 116,
    protein: 9,
    fat: 0.4,
    carbs: 20,
    fiber: null,
    sugar: null,
    saturatedFat: null,
    cholesterol: null,
    sodium: null,
    calcium: null,
    iron: null,
    potassium: null,
    ...extra,
  };
}

const LENTIL_ROWS: FoodSearchResult[] = [
  food('a', 'Lentils, mature seeds, cooked, boiled, without salt', { portionGrams: 198, portionLabel: '1 cup' }),
  food('b', 'Lentils, mature seeds, cooked, boiled, with salt', { portionGrams: 198, portionLabel: '1 cup' }),
  food('c', 'Lentils, sprouted, raw', { portionGrams: 77, portionLabel: '1 cup', kcal: 106 }),
  food('d', 'Lentils, raw', { portionGrams: 192, portionLabel: '1 cup', kcal: 352 }),
  food('e', 'Lentils, pink or red, raw', { portionGrams: 192, portionLabel: '1 cup', kcal: 358 }),
];

describe('refineIngredientResults — the عدس case', () => {
  test('collapses the salt variants into one cooked-lentils row', () => {
    const refined = refineIngredientResults(LENTIL_ROWS, 'عدس');
    const cooked = refined.filter((row) => row.displayAr === 'عدس مطبوخ');
    expect(cooked).toHaveLength(1);
    expect(cooked[0]!.variantCount).toBe(1); // the with-salt twin is folded in
  });

  test('shows Arabic labels, never a raw USDA string, as the primary', () => {
    const refined = refineIngredientResults(LENTIL_ROWS, 'عدس');
    for (const row of refined) {
      expect(row.displayAr).not.toBeNull();
      expect(row.displayAr).not.toContain('Lentils');
    }
  });

  test('ranks the plain cooked staple ahead of the raw variants', () => {
    const refined = refineIngredientResults(LENTIL_ROWS, 'عدس');
    expect(refined[0]!.displayAr).toBe('عدس مطبوخ');
  });

  test('keeps red lentils distinct from plain lentils', () => {
    const refined = refineIngredientResults(LENTIL_ROWS, 'عدس');
    const labels = refined.map((row) => row.displayAr);
    expect(labels).toContain('عدس أحمر نيء');
  });

  test('a picked representative is a real food that carries a portion', () => {
    const refined = refineIngredientResults(LENTIL_ROWS, 'عدس');
    const cooked = refined.find((row) => row.displayAr === 'عدس مطبوخ')!;
    expect(cooked.portionGrams).toBe(198);
  });
});

describe('refineIngredientResults — ranking', () => {
  test('a clinic food outranks every USDA row', () => {
    const clinic = food('clinic', 'Homemade lentils', { nameAr: 'عدس بلدي' });
    const refined = refineIngredientResults([...LENTIL_ROWS, clinic], 'عدس');
    expect(refined[0]!.nameAr).toBe('عدس بلدي');
  });

  test('an English-only food falls to the bottom and keeps a concise English label', () => {
    const crackers = food('x', 'Crackers, flavored', { category: 'Baked Products' });
    const refined = refineIngredientResults([...LENTIL_ROWS, crackers], 'عدس');
    const last = refined.at(-1)!;
    expect(last.matchedArabic).toBe(false);
    expect(last.displayAr).toBeNull();
    expect(last.description).toBe('Crackers, flavored');
  });

  test('searching خبز puts pita bread first', () => {
    const bread = food('p', 'Bread, pita, white, enriched', {
      category: 'Baked Products',
      portionGrams: 60,
      portionLabel: '1 pita, large (6-1/2" dia)',
    });
    const refined = refineIngredientResults([bread, ...LENTIL_ROWS], 'خبز');
    expect(refined[0]!.displayAr).toBe('خبز عربي أبيض');
  });
});
