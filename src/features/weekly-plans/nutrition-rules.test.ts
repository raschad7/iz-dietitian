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
      readNutritionRules({
        proteinPerKg: 1,
        proteinBasis: 'lean',
        proteinRates: { active: 2 },
        bmrSource: 'formula',
      }),
    ).toEqual({
      proteinPerKg: 1,
      proteinBasis: 'lean',
      proteinRates: { active: 2 },
      bmrSource: 'formula',
    });
  });

  test('a value outside the vocabulary falls back rather than throwing', () => {
    /*
      The column has its own check constraint, so this needs a hand-edited row
      to happen at all. It still must not throw: these three values decide a
      client's protein target, and one bad column should not take a record page
      down on its way to being noticed.
    */
    expect(
      readNutritionRules({
        proteinPerKg: 1.2,
        proteinBasis: 'guesswork',
        proteinRates: {},
        bmrSource: 'device',
      }),
    ).toEqual(DEFAULT_NUTRITION_RULES);

    // A slipped decimal point, which is the realistic version of the same thing.
    expect(
      readNutritionRules({
        proteinPerKg: 16,
        proteinBasis: 'adjusted',
        proteinRates: {},
        bmrSource: 'device',
      }),
    ).toEqual(DEFAULT_NUTRITION_RULES);
  });

  test('a null column takes that field’s default and keeps the rest', () => {
    expect(
      readNutritionRules({
        proteinPerKg: null,
        proteinBasis: 'actual',
        proteinRates: null,
        bmrSource: null,
      }),
    ).toEqual({
      proteinPerKg: DEFAULT_NUTRITION_RULES.proteinPerKg,
      proteinBasis: 'actual',
      proteinRates: {},
      bmrSource: DEFAULT_NUTRITION_RULES.bmrSource,
    });
  });

  test('a cleared rate map stays cleared and does not resurrect the shipped cases', () => {
    /*
      The distinction the reader has to keep: a clinic with no *row* gets the
      defaults, and a clinic whose row holds an empty map has decided it treats
      every client alike. Handing the shipped athlete rate back to the second
      one would make the boxes impossible to clear.
    */
    const cleared = readNutritionRules({
      proteinPerKg: 1,
      proteinBasis: 'actual',
      proteinRates: {},
      bmrSource: 'device',
    });

    expect(cleared.proteinRates).toEqual({});
  });

  test('an unreadable rate map degrades to no special rates', () => {
    // jsonb somebody hand-edited. It must not throw, and the safe direction is
    // back towards the clinic's own base figure.
    const broken = readNutritionRules({
      proteinPerKg: 1,
      proteinBasis: 'actual',
      proteinRates: { active: 'lots' },
      bmrSource: 'device',
    });

    expect(broken.proteinRates).toEqual({});
    expect(broken.proteinPerKg).toBe(1);
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
  test('the protein table is the practice this app is built for', () => {
    /*
      ⚠ Load-bearing, and it changed once on purpose.

      These used to be 1.6 on the adjusted weight — not because anybody dosed
      that way, but because that was the constant `suggestProteinGrams` fell
      back to before the rate became a setting, and introducing the setting had
      to be incapable of moving a live target.

      They are her numbers now, from her own description of how she works: an
      ordinary client at `weight x 0.8`, an athlete 1.7, a renal client 0.6, a
      dialysis client 1.0, every one of them against the weight on the scale.
      The athlete rate is keyed on the activity level rather than the goal — see
      `PROTEIN_RATE_CASES`.
      Changing any of these changes every clinic that has not opened the dialog,
      which is why they are pinned here rather than only in a comment.
    */
    expect(DEFAULT_NUTRITION_RULES.proteinPerKg).toBe(0.8);
    expect(DEFAULT_NUTRITION_RULES.proteinBasis).toBe('actual');
    expect(DEFAULT_NUTRITION_RULES.proteinRates).toEqual({
      active: 1.7,
      very_active: 1.7,
      kidney_disease: 0.6,
      dialysis: 1,
    });
  });

  test('the BMR default is the analyser, which is a deliberate change', () => {
    // The clinic asked for the printed figure. See `clinic_nutrition_rules`.
    expect(DEFAULT_NUTRITION_RULES.bmrSource).toBe('device');
  });
});
