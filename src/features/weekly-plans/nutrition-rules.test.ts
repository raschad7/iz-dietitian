import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_NUTRITION_RULES,
  nutritionRulesSchema,
  readNutritionRules,
} from './nutrition-rules';

describe('readNutritionRules', () => {
  test('a clinic that has never saved gets the defaults', () => {
    // No row is the ordinary state, not a broken record: nothing creates one
    // lazily, so most clinics read this branch until they open the dialog.
    expect(readNutritionRules(null)).toEqual(DEFAULT_NUTRITION_RULES);
    expect(readNutritionRules(undefined)).toEqual(DEFAULT_NUTRITION_RULES);
  });

  test('reads a saved row', () => {
    expect(
      readNutritionRules({ proteinPerKg: 1, proteinBasis: 'lean', bmrSource: 'formula' }),
    ).toEqual({ proteinPerKg: 1, proteinBasis: 'lean', bmrSource: 'formula' });
  });

  test('a value outside the vocabulary falls back rather than throwing', () => {
    /*
      The column has its own check constraint, so this needs a hand-edited row
      to happen at all. It still must not throw: these three values decide a
      client's protein target, and one bad column should not take a record page
      down on its way to being noticed.
    */
    expect(
      readNutritionRules({ proteinPerKg: 1.2, proteinBasis: 'guesswork', bmrSource: 'device' }),
    ).toEqual(DEFAULT_NUTRITION_RULES);

    // A slipped decimal point, which is the realistic version of the same thing.
    expect(
      readNutritionRules({ proteinPerKg: 16, proteinBasis: 'adjusted', bmrSource: 'device' }),
    ).toEqual(DEFAULT_NUTRITION_RULES);
  });

  test('a null column takes that field’s default and keeps the rest', () => {
    expect(
      readNutritionRules({ proteinPerKg: null, proteinBasis: 'actual', bmrSource: null }),
    ).toEqual({
      proteinPerKg: DEFAULT_NUTRITION_RULES.proteinPerKg,
      proteinBasis: 'actual',
      bmrSource: DEFAULT_NUTRITION_RULES.bmrSource,
    });
  });
});

describe('nutritionRulesSchema', () => {
  test('accepts the strings a form posts', () => {
    const parsed = nutritionRulesSchema.parse({
      proteinPerKg: '1.2',
      proteinBasis: 'lean',
      bmrSource: 'device',
    });

    expect(parsed.proteinPerKg).toBe(1.2);
  });

  test('rounds to the step the input offers', () => {
    // Otherwise a pasted figure is stored at a precision nobody typed and read
    // back as a different number from the one on screen.
    expect(nutritionRulesSchema.parse({
      proteinPerKg: '1.6499',
      proteinBasis: 'adjusted',
      bmrSource: 'device',
    }).proteinPerKg).toBe(1.6);
  });

  test('refuses a rate outside what anybody is dosed at', () => {
    for (const rate of ['0.1', '5', '16']) {
      expect(
        nutritionRulesSchema.safeParse({
          proteinPerKg: rate,
          proteinBasis: 'adjusted',
          bmrSource: 'device',
        }).success,
      ).toBe(false);
    }
  });
});

describe('the defaults', () => {
  test('the protein pair reproduces what was hard-coded', () => {
    /*
      ⚠ Load-bearing. `suggestProteinGrams` fell back to a 1.6 constant on the
      adjusted weight before the rate became a setting, and this migration must
      not move a number anybody is already eating to. Changing either of these
      changes every clinic that has not opened the dialog.
    */
    expect(DEFAULT_NUTRITION_RULES.proteinPerKg).toBe(1.6);
    expect(DEFAULT_NUTRITION_RULES.proteinBasis).toBe('adjusted');
  });

  test('the BMR default is the analyser, which is a deliberate change', () => {
    // The clinic asked for the printed figure. See `clinic_nutrition_rules`.
    expect(DEFAULT_NUTRITION_RULES.bmrSource).toBe('device');
  });
});
