import { describe, expect, test } from 'bun:test';

import {
  deriveUnitOptions,
  defaultUnitKey,
  findUnit,
  resolveSavedRow,
  rowGrams,
  type UnitFood,
} from './ingredient-units';

/**
 * The unit system's whole job: turn a food's single USDA household measure into
 * a short, sensible menu of units, each carrying the grams one of it weighs, so
 * a dietitian works in "2 pieces" or "1 cup" while nutrition still runs on grams.
 *
 * The rules it must never break: never invent a conversion (a non-gram unit is
 * always the food's own measured portion or a universal fraction of it), always
 * offer grams, and never change the stored grams when a saved row is reopened.
 *
 * Fixtures are real SR Legacy rows — the same ones the picker will hand over.
 */
const egg: UnitFood = { portionGrams: 50, portionLabel: '1 large', category: 'Dairy and Egg Products' };
const riceWhite: UnitFood = { portionGrams: 186, portionLabel: '1 cup', category: 'Cereal Grains and Pasta' };
const oliveOil: UnitFood = { portionGrams: 13.5, portionLabel: '1 tablespoon', category: 'Fats and Oils' };
const breadSlice: UnitFood = { portionGrams: 29, portionLabel: '1 slice', category: 'Baked Products' };
// Cooked chicken breast: USDA really does carry "1 cup, chopped or diced" = 140 g.
const chicken: UnitFood = {
  portionGrams: 140,
  portionLabel: '1 cup, chopped or diced',
  category: 'Poultry Products',
};
// A bread whose stored portion is a weight unit, not a household one.
const breadOunce: UnitFood = { portionGrams: 28.4, portionLabel: '1 oz', category: 'Baked Products' };
// A clinic custom food: nutrition entered per 100 g, no household measure at all.
const customFood: UnitFood = { portionGrams: null, portionLabel: null, category: 'Clinic custom' };

function keys(food: UnitFood): string[] {
  return deriveUnitOptions(food).map((option) => option.key);
}

describe('deriveUnitOptions', () => {
  test('piece → grams: a countable food offers its piece and grams', () => {
    expect(keys(egg)).toEqual(['piece', 'g']);
    const piece = findUnit(deriveUnitOptions(egg), 'piece')!;
    expect(piece.gramsPerUnit).toBe(50);
    // 2 eggs → 100 g, the number nutrition receives.
    expect(rowGrams(deriveUnitOptions(egg), 2, 'piece')).toBe(100);
  });

  test('cup → grams: a cup food offers the cup, its halves and quarters, then grams', () => {
    expect(keys(riceWhite)).toEqual(['cup', 'half_cup', 'quarter_cup', 'g']);
    const options = deriveUnitOptions(riceWhite);
    expect(findUnit(options, 'cup')!.gramsPerUnit).toBe(186);
    // Fractions are pure arithmetic on the known cup weight — never invented.
    expect(findUnit(options, 'half_cup')!.gramsPerUnit).toBe(93);
    expect(findUnit(options, 'quarter_cup')!.gramsPerUnit).toBe(46.5);
    expect(rowGrams(options, 1, 'cup')).toBe(186);
  });

  test('tablespoon → grams: a spoon food offers tablespoon, teaspoon, then grams', () => {
    expect(keys(oliveOil)).toEqual(['tbsp', 'tsp', 'g']);
    const options = deriveUnitOptions(oliveOil);
    expect(findUnit(options, 'tbsp')!.gramsPerUnit).toBe(13.5);
    // A teaspoon is a third of a tablespoon everywhere — a universal ratio.
    expect(findUnit(options, 'tsp')!.gramsPerUnit).toBe(4.5);
    expect(rowGrams(options, 1, 'tbsp')).toBe(13.5);
  });

  test('slice → grams: bread offers a slice and grams', () => {
    expect(keys(breadSlice)).toEqual(['slice', 'g']);
    expect(findUnit(deriveUnitOptions(breadSlice), 'slice')!.gramsPerUnit).toBe(29);
  });

  test('grams fallback: a food with no usable household measure offers grams alone', () => {
    // No portion data at all.
    expect(keys(customFood)).toEqual(['g']);
    // A stored portion that is a weight unit ("1 oz") is not a household unit.
    expect(keys(breadOunce)).toEqual(['g']);
    expect(rowGrams(deriveUnitOptions(customFood), 150, 'g')).toBe(150);
  });

  test('meat, poultry, fish and seafood are grams-only even when USDA has a cup', () => {
    // Chicken carries a real "1 cup, chopped" measure; the primary UX suppresses
    // it — a dietitian weighs meat, and "a cup of chicken" is not how they work.
    expect(keys(chicken)).toEqual(['g']);
    const beef: UnitFood = { portionGrams: 140, portionLabel: '1 cup', category: 'Beef Products' };
    const fish: UnitFood = { portionGrams: 85, portionLabel: '3 oz', category: 'Finfish and Shellfish Products' };
    expect(keys(beef)).toEqual(['g']);
    expect(keys(fish)).toEqual(['g']);
  });

  test('an unsupported unit is never offered for the wrong ingredient', () => {
    // Olive oil can only be a spoon or grams — never a piece, cup, or slice.
    expect(keys(oliveOil)).not.toContain('piece');
    expect(keys(oliveOil)).not.toContain('cup');
    expect(keys(oliveOil)).not.toContain('slice');
    // Rice can be a cup or grams — never a piece or a spoon.
    expect(keys(riceWhite)).not.toContain('piece');
    expect(keys(riceWhite)).not.toContain('tbsp');
    // Every food, always, ends its list with grams.
    for (const food of [egg, riceWhite, oliveOil, breadSlice, chicken, customFood]) {
      expect(deriveUnitOptions(food).at(-1)!.key).toBe('g');
    }
  });
});

describe('defaultUnitKey', () => {
  test('picks the natural unit for each food, grams for what is weighed', () => {
    expect(defaultUnitKey(deriveUnitOptions(egg))).toBe('piece');
    expect(defaultUnitKey(deriveUnitOptions(riceWhite))).toBe('cup');
    expect(defaultUnitKey(deriveUnitOptions(oliveOil))).toBe('tbsp');
    expect(defaultUnitKey(deriveUnitOptions(breadSlice))).toBe('slice');
    expect(defaultUnitKey(deriveUnitOptions(chicken))).toBe('g');
    expect(defaultUnitKey(deriveUnitOptions(customFood))).toBe('g');
  });
});

describe('rowGrams — the number the nutrition engine receives', () => {
  test('changing the quantity changes the grams', () => {
    const options = deriveUnitOptions(riceWhite);
    expect(rowGrams(options, 1, 'cup')).toBe(186);
    expect(rowGrams(options, 2, 'cup')).toBe(372);
  });

  test('changing the unit changes the grams', () => {
    const options = deriveUnitOptions(riceWhite);
    expect(rowGrams(options, 1, 'cup')).toBe(186);
    expect(rowGrams(options, 1, 'half_cup')).toBe(93);
    expect(rowGrams(options, 1, 'g')).toBe(1);
  });

  test('an empty or non-positive quantity contributes no grams', () => {
    const options = deriveUnitOptions(egg);
    expect(rowGrams(options, Number.NaN, 'piece')).toBe(0);
    expect(rowGrams(options, 0, 'piece')).toBe(0);
    expect(rowGrams(options, -3, 'piece')).toBe(0);
  });
});

describe('resolveSavedRow — reopening a saved ingredient', () => {
  test('a household row round-trips to the same grams it was saved with', () => {
    // Saved as the editor writes it: 2 eggs, grams = 2 × 50.
    const saved = { quantityGrams: 100, householdLabel: 'piece', householdGrams: 50 };
    const row = resolveSavedRow(egg, saved);
    expect(row.unitKey).toBe('piece');
    expect(row.quantity).toBe(2);
    // Editing nothing and saving must reproduce the exact grams.
    expect(rowGrams(deriveUnitOptions(egg), row.quantity, row.unitKey)).toBe(100);
  });

  test('a grams row reopens in grams unchanged', () => {
    const saved = { quantityGrams: 150, householdLabel: 'g', householdGrams: 1 };
    const row = resolveSavedRow(chicken, saved);
    expect(row.unitKey).toBe('g');
    expect(row.quantity).toBe(150);
  });

  test('a legacy or unrecognized unit falls back to grams without changing the amount', () => {
    // An old free-text household label that maps to no current unit: keep grams,
    // keep the exact stored weight — never silently rescale the recipe.
    const saved = { quantityGrams: 200, householdLabel: 'ملعقة كبيرة', householdGrams: 15 };
    const row = resolveSavedRow(chicken, saved);
    expect(row.unitKey).toBe('g');
    expect(row.quantity).toBe(200);
  });

  test('a household row whose food no longer supports that unit falls back to grams', () => {
    // The stored unit key is a piece, but the food is now grams-only (a meat):
    // the derived menu has no piece, so grams is the honest, non-lossy fallback.
    const saved = { quantityGrams: 120, householdLabel: 'piece', householdGrams: 60 };
    const row = resolveSavedRow(chicken, saved);
    expect(row.unitKey).toBe('g');
    expect(row.quantity).toBe(120);
  });
});
