import { describe, expect, test } from 'bun:test';

import { localizedPortionLabel } from './food-display';
import {
  defaultUnitValue,
  findUnitOption,
  GRAMS_UNIT,
  resolveSavedRow,
  rowGrams,
  unitLabel,
  unitOptions,
  type FoodPortion,
} from './ingredient-units';

/**
 * The measurement menu, and the single multiplication behind it.
 *
 * Everything here is about one invariant: **grams is the only quantity nutrition
 * ever sees.** A portion produces grams and records how they were produced; it is
 * never itself an input to a total, and changing one cannot move a recipe that was
 * already saved.
 */

function portion(
  id: string,
  labelAr: string,
  labelEn: string,
  grams: number,
  extra: Partial<FoodPortion> = {},
): FoodPortion {
  return { id, labelAr, labelEn, grams, isDefault: false, sortOrder: 0, ...extra };
}

const EGG_PIECE = portion('egg-piece', 'حبة', 'Piece', 50, { isDefault: true });

const OIL_TBSP = portion('oil-tbsp', 'ملعقة كبيرة', 'Tablespoon', 13.5, { isDefault: true, sortOrder: 0 });
const OIL_TSP = portion('oil-tsp', 'ملعقة صغيرة', 'Teaspoon', 4.5, { sortOrder: 1 });

const RICE_CUP = portion('rice-cup', 'كوب', 'Cup', 158, { isDefault: true, sortOrder: 0 });
const RICE_HALF = portion('rice-half', 'نصف كوب', 'Half cup', 79, { sortOrder: 1 });
const RICE_QUARTER = portion('rice-quarter', 'ربع كوب', 'Quarter cup', 39.5, { sortOrder: 2 });

const egg = { portions: [EGG_PIECE] };
const oil = { portions: [OIL_TSP, OIL_TBSP] };
const rice = { portions: [RICE_QUARTER, RICE_CUP, RICE_HALF] };
const chicken = { portions: [] };

describe('unitOptions', () => {
  test('always offers grams, first, even for a food with no portions', () => {
    expect(unitOptions(chicken)).toEqual([{ value: GRAMS_UNIT, gramsPerUnit: 1, portion: null }]);
    expect(unitOptions(egg)[0]!.value).toBe(GRAMS_UNIT);
  });

  /** One food, many units — the whole reason portions became rows. */
  test('offers every portion a food carries, in sort order', () => {
    expect(unitOptions(rice).map((option) => option.portion?.labelEn ?? 'g')).toEqual([
      'g',
      'Cup',
      'Half cup',
      'Quarter cup',
    ]);

    expect(unitOptions(oil).map((option) => option.gramsPerUnit)).toEqual([1, 13.5, 4.5]);
  });
});

describe('defaultUnitValue', () => {
  test("starts a food in its own default portion", () => {
    expect(defaultUnitValue(egg)).toBe(EGG_PIECE.id);
    expect(defaultUnitValue(rice)).toBe(RICE_CUP.id);
  });

  test('starts a grams-only food in grams', () => {
    expect(defaultUnitValue(chicken)).toBe(GRAMS_UNIT);
  });
});

describe('rowGrams', () => {
  test('grams input stores exactly the grams entered', () => {
    expect(rowGrams(unitOptions(chicken), 150, GRAMS_UNIT)).toBe(150);
    expect(rowGrams(unitOptions(egg), 150, GRAMS_UNIT)).toBe(150);
  });

  test('a portion input converts to grams by multiplication', () => {
    // The spec's own worked example: 2 × medium egg (50 g) = 100 g.
    expect(rowGrams(unitOptions(egg), 2, EGG_PIECE.id)).toBe(100);
    expect(rowGrams(unitOptions(rice), 1, RICE_CUP.id)).toBe(158);
    expect(rowGrams(unitOptions(oil), 3, OIL_TSP.id)).toBe(13.5);
  });

  test('a blank, zero or negative quantity contributes nothing — the row is mid-edit', () => {
    const options = unitOptions(egg);
    expect(rowGrams(options, Number(''), EGG_PIECE.id)).toBe(0);
    expect(rowGrams(options, 0, EGG_PIECE.id)).toBe(0);
    expect(rowGrams(options, -2, EGG_PIECE.id)).toBe(0);
    expect(rowGrams(options, Number('abc'), EGG_PIECE.id)).toBe(0);
  });

  /**
   * A portion id belongs to exactly one food. Measuring rice with the egg's حبة
   * would be a silent, plausible, wrong number — so an unknown unit yields nothing
   * and the row simply stays out of the recipe.
   */
  test("rejects a portion belonging to another food", () => {
    expect(findUnitOption(unitOptions(rice), EGG_PIECE.id)).toBeUndefined();
    expect(rowGrams(unitOptions(rice), 2, EGG_PIECE.id)).toBe(0);
  });

  test('rejects a portion id that does not exist at all', () => {
    expect(rowGrams(unitOptions(rice), 2, 'no-such-portion')).toBe(0);
  });
});

describe('resolveSavedRow', () => {
  test('reopens a saved portion amount in the unit it was entered in', () => {
    expect(resolveSavedRow(egg, { quantityGrams: 100, portionId: EGG_PIECE.id })).toEqual({
      unitValue: EGG_PIECE.id,
      quantity: 2,
    });
  });

  test('reopens a grams amount in grams', () => {
    expect(resolveSavedRow(egg, { quantityGrams: 137, portionId: null })).toEqual({
      unitValue: GRAMS_UNIT,
      quantity: 137,
    });
  });

  /**
   * The safety property that lets portions be editable data at all.
   *
   * `quantity_grams` was written when the dish was saved. If a portion's weight is
   * later corrected — 50 g per egg becomes 55 g — the saved recipe must keep its
   * 100 g and must not silently become 110 g. Reopening expresses the *stored*
   * grams in the *new* unit, so the weight is preserved and only the count moves.
   */
  test('a redefined portion does not rewrite the grams a recipe already holds', () => {
    const corrected = { portions: [{ ...EGG_PIECE, grams: 55 }] };

    const row = resolveSavedRow(corrected, { quantityGrams: 100, portionId: EGG_PIECE.id });

    expect(row.unitValue).toBe(EGG_PIECE.id);
    // The count shifts to keep the weight honest; the weight itself is untouched.
    expect(row.quantity).toBeCloseTo(100 / 55, 10);
    expect(rowGrams(unitOptions(corrected), row.quantity, row.unitValue)).toBeCloseTo(100, 10);
  });

  /**
   * `dish_ingredients.portion_id` is `on delete set null`, so a retired portion
   * arrives as null. Falling back to the stored weight is the only safe answer —
   * rescaling onto whatever unit is left would change the recipe.
   */
  test('falls back to grams when the saved portion no longer exists', () => {
    const retired = { portions: [] };

    expect(resolveSavedRow(retired, { quantityGrams: 100, portionId: EGG_PIECE.id })).toEqual({
      unitValue: GRAMS_UNIT,
      quantity: 100,
    });
  });

  test("falls back to grams rather than using another food's portion", () => {
    expect(resolveSavedRow(rice, { quantityGrams: 100, portionId: EGG_PIECE.id })).toEqual({
      unitValue: GRAMS_UNIT,
      quantity: 100,
    });
  });
});

describe('unit labels', () => {
  test('render a portion in the reader language, from stored labels', () => {
    const [, cupOption] = unitOptions(rice);

    expect(unitLabel(cupOption!, 'ar', 'غرام')).toBe('كوب');
    expect(unitLabel(cupOption!, 'en', 'g')).toBe('Cup');
  });

  test('render grams from the translated string, since it has no stored label', () => {
    const [grams] = unitOptions(rice);

    expect(unitLabel(grams!, 'ar', 'غرام')).toBe('غرام');
    expect(unitLabel(grams!, 'en', 'g')).toBe('g');
  });

  test('fall back to the label that exists when one language is missing', () => {
    expect(localizedPortionLabel({ labelAr: 'علبة', labelEn: '' }, 'en')).toBe('علبة');
    expect(localizedPortionLabel({ labelAr: '', labelEn: 'Container' }, 'ar')).toBe('Container');
  });
});
