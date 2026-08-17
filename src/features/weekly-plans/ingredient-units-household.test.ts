import { describe, expect, test } from 'bun:test';

import {
  deriveUnitOptions,
  defaultUnitKey,
  resolveSavedRow,
  rowGrams,
  suggestUnitKey,
  type UnitFood,
} from './ingredient-units';

/**
 * The household-unit additions (spec §9–§10): bread reads its USDA "1 pita = 60 g"
 * as رغيف instead of falling back to grams, and a clinic custom food carries its
 * own chosen household unit through `portionLabel`/`portionGrams`.
 */

function keys(food: UnitFood): string[] {
  return deriveUnitOptions(food).map((option) => option.key);
}

// Real SR Legacy pita: the classifier used to miss "pita" and offer grams only.
const pita: UnitFood = {
  portionGrams: 60,
  portionLabel: '1 pita, large (6-1/2" dia)',
  category: 'Baked Products',
};

// A custom bread the dietitian defined as "1 رغيف = 60 g" — stored as the unit key
// on portionLabel with the grams on portionGrams (spec §10).
const customLoaf: UnitFood = { portionGrams: 60, portionLabel: 'loaf', category: 'Clinic custom' };
const customCup: UnitFood = { portionGrams: 200, portionLabel: 'cup', category: 'Clinic custom' };
const customPiece: UnitFood = { portionGrams: 50, portionLabel: 'piece', category: 'Clinic custom' };

describe('bread offers the loaf unit from USDA portion data', () => {
  test('pita → رغيف, نصف رغيف, grams', () => {
    expect(keys(pita)).toEqual(['loaf', 'half_loaf', 'g']);
    const options = deriveUnitOptions(pita);
    expect(options[0]!.gramsPerUnit).toBe(60);
    expect(options[1]!.gramsPerUnit).toBe(30);
    expect(defaultUnitKey(options)).toBe('loaf');
  });
});

describe('a custom food carries its own household unit', () => {
  test('a loaf custom food offers loaf/half-loaf/grams with the stored weight', () => {
    expect(keys(customLoaf)).toEqual(['loaf', 'half_loaf', 'g']);
    expect(deriveUnitOptions(customLoaf)[0]!.gramsPerUnit).toBe(60);
    expect(defaultUnitKey(deriveUnitOptions(customLoaf))).toBe('loaf');
    // One loaf is 60 g; half a loaf is quantity 0.5 of that unit.
    expect(rowGrams(deriveUnitOptions(customLoaf), 1, 'loaf')).toBe(60);
    expect(rowGrams(deriveUnitOptions(customLoaf), 0.5, 'loaf')).toBe(30);
  });

  test('a cup custom food gets the cup family; a piece custom food gets piece', () => {
    expect(keys(customCup)).toEqual(['cup', 'half_cup', 'quarter_cup', 'g']);
    expect(keys(customPiece)).toEqual(['piece', 'g']);
  });

  test('reloading a saved custom-loaf row round-trips to the same grams', () => {
    // Saved as the editor writes it: half a loaf, grams = 0.5 × 60.
    const saved = { quantityGrams: 30, householdLabel: 'loaf', householdGrams: 60 };
    const row = resolveSavedRow(customLoaf, saved);
    expect(row.unitKey).toBe('loaf');
    expect(row.quantity).toBe(0.5);
    expect(rowGrams(deriveUnitOptions(customLoaf), row.quantity, row.unitKey)).toBe(30);
  });

  test('a custom food with no unit is grams-only', () => {
    const plain: UnitFood = { portionGrams: null, portionLabel: null, category: 'Clinic custom' };
    expect(keys(plain)).toEqual(['g']);
  });
});

describe('suggestUnitKey — the default unit for a new custom food', () => {
  test('guesses a natural unit from the Arabic name', () => {
    expect(suggestUnitKey('خبز عربي منزلي')).toBe('loaf');
    expect(suggestUnitKey('زيت زيتون')).toBe('tbsp');
    expect(suggestUnitKey('أرز مطبوخ')).toBe('cup');
    expect(suggestUnitKey('عدس بلدي')).toBe('cup');
    expect(suggestUnitKey('بيض بلدي')).toBe('piece');
  });

  test('falls back to grams when nothing obvious fits', () => {
    expect(suggestUnitKey('صدر دجاج')).toBe('g');
    expect(suggestUnitKey('جميد بلدي')).toBe('g');
  });
});
