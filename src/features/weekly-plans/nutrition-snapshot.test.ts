import { describe, expect, test } from 'bun:test';

import { dishGrams, dishTotals, type DishIngredientDetail } from './nutrition';
import {
  SNAPSHOT_VERSION,
  buildMealSnapshot,
  MealSnapshotError,
  parseMealSnapshot,
  readMealSnapshot,
  requiresFrozenNutrition,
  resolveMealNutrition,
} from './nutrition-snapshot';

/**
 * The frozen-nutrition rules, asserted without a database.
 *
 * The integration side — that publishing actually writes these, and that a
 * published plan stops moving — lives in `plan-nutrition-snapshots.test.ts`. What
 * is pinned down here is the shape itself: that a snapshot round-trips through JSON
 * without losing the unmeasured counts, that a damaged blob is told apart from an
 * absent one, and that a plan which is supposed to be frozen refuses to quietly
 * recalculate when its freeze cannot be read.
 */

/**
 * A food with two nutrients deliberately unmeasured.
 *
 * `fiber` and `sugar` are null, which the whole feature reads as "nobody measured
 * this" rather than "contains none". Carrying that distinction through
 * serialization is the point of several tests below.
 */
function ingredient(quantityGrams: number): DishIngredientDetail {
  return {
    quantityGrams,
    food: {
      id: 'food-1',
      nameAr: 'مادة أساسية',
      nameEn: 'Test staple',
      kcal: 300,
      protein: 12,
      carbs: 50,
      fat: 5,
      fiber: null,
      sugar: null,
      saturatedFat: 1,
      sodium: 10,
      cholesterol: 0,
      calcium: 20,
      iron: 2,
      potassium: 100,
    },
  };
}

const recipe = [ingredient(200)];

describe('buildMealSnapshot', () => {
  test('freezes exactly what dishTotals and dishGrams produce', () => {
    const snapshot = buildMealSnapshot(recipe, 1.5);

    expect(snapshot.totals).toEqual(dishTotals(recipe, 1.5));
    expect(snapshot.grams).toBe(dishGrams(recipe, 1.5));
  });

  test('carries its version, so a later reader knows what it is holding', () => {
    expect(buildMealSnapshot(recipe, 1).version).toBe(SNAPSHOT_VERSION);
  });

  test('scales with servings rather than storing a base serving', () => {
    const single = buildMealSnapshot(recipe, 1);
    const double = buildMealSnapshot(recipe, 2);

    expect(double.totals.kcal.value).toBeCloseTo(single.totals.kcal.value * 2, 6);
    expect(double.grams).toBeCloseTo(single.grams * 2, 6);
  });
});

describe('serialization preserves the unmeasured/zero distinction', () => {
  test('an unmeasured nutrient survives a JSON round trip as unmeasured, not zero', () => {
    const snapshot = buildMealSnapshot(recipe, 1);

    // Exactly what postgres does to a jsonb column and back.
    const roundTripped = parseMealSnapshot(JSON.parse(JSON.stringify(snapshot)));

    expect(roundTripped).not.toBeNull();
    // The recipe's one food never had its fibre measured.
    expect(roundTripped!.totals.fiber.unmeasured).toBe(1);
    expect(snapshot.totals.fiber.unmeasured).toBe(1);
  });

  test('a measured zero stays measured', () => {
    const snapshot = buildMealSnapshot(recipe, 1);
    const roundTripped = parseMealSnapshot(JSON.parse(JSON.stringify(snapshot)))!;

    // Cholesterol is a real measured 0 on this food, unlike fibre.
    expect(roundTripped.totals.cholesterol.value).toBe(0);
    expect(roundTripped.totals.cholesterol.unmeasured).toBe(0);
  });

  test('every nutrient the app tracks is present after the round trip', () => {
    const snapshot = buildMealSnapshot(recipe, 1);
    const roundTripped = parseMealSnapshot(JSON.parse(JSON.stringify(snapshot)))!;

    expect(roundTripped.totals).toEqual(snapshot.totals);
  });
});

describe('parseMealSnapshot', () => {
  test('accepts what buildMealSnapshot produced', () => {
    expect(parseMealSnapshot(buildMealSnapshot(recipe, 1))).not.toBeNull();
  });

  test('treats null and undefined as "never frozen"', () => {
    expect(parseMealSnapshot(null)).toBeNull();
    expect(parseMealSnapshot(undefined)).toBeNull();
  });

  /**
   * A jsonb column accepts anything, so the reader must not assume it wrote the
   * value. `parseMealSnapshot` flattens every failure to null, which is why it is
   * only for callers that genuinely do not care why — see `readMealSnapshot` below
   * for the distinction a published plan depends on.
   */
  test('rejects a malformed blob instead of trusting it', () => {
    expect(parseMealSnapshot({ nonsense: true })).toBeNull();
    expect(parseMealSnapshot('a string')).toBeNull();
    expect(parseMealSnapshot({ version: 1, totals: {}, grams: 0 })).toBeNull();
  });

  test('rejects a total that lost its unmeasured count', () => {
    const snapshot = buildMealSnapshot(recipe, 1) as unknown as {
      totals: Record<string, unknown>;
    };
    const damaged = { ...snapshot, totals: { ...snapshot.totals, kcal: 400 } };

    expect(parseMealSnapshot(damaged)).toBeNull();
  });

  test('rejects an unknown version rather than guessing at its shape', () => {
    expect(parseMealSnapshot({ ...buildMealSnapshot(recipe, 1), version: 99 })).toBeNull();
  });
});

describe('readMealSnapshot', () => {
  test('an absent value is a draft, not damage', () => {
    expect(readMealSnapshot(null)).toEqual({ status: 'absent' });
    expect(readMealSnapshot(undefined)).toEqual({ status: 'absent' });
  });

  test('a snapshot this build wrote reads back as valid', () => {
    const read = readMealSnapshot(buildMealSnapshot(recipe, 1));

    expect(read.status).toBe('valid');
  });

  test('a future version is unsupported, which is not the same as malformed', () => {
    // Worth telling apart: an unsupported blob may be perfectly good data a later
    // build can read, and a malformed one never will be.
    const read = readMealSnapshot({ ...buildMealSnapshot(recipe, 1), version: 2 });

    expect(read).toEqual({ status: 'unsupported', version: 2 });
  });

  test('nonsense is malformed', () => {
    expect(readMealSnapshot({ nonsense: true }).status).toBe('malformed');
    expect(readMealSnapshot('a string').status).toBe('malformed');
    expect(readMealSnapshot({ version: 1, totals: {}, grams: 0 }).status).toBe('malformed');
  });
});

describe('resolveMealNutrition', () => {
  const draft = { requiresSnapshot: false };
  const published = { requiresSnapshot: true };

  test('uses the snapshot when there is one, ignoring the current recipe', () => {
    const snapshot = buildMealSnapshot(recipe, 1);

    // A recipe that is now four times the size. The snapshot must win.
    const resolved = resolveMealNutrition({
      ...published,
      snapshot: readMealSnapshot(snapshot),
      ingredients: [ingredient(800)],
      servings: 1,
    });

    expect(resolved.frozen).toBe(true);
    expect(resolved.totals).toEqual(snapshot.totals);
    expect(resolved.grams).toBe(snapshot.grams);
  });

  test('a draft with no snapshot calculates live', () => {
    const resolved = resolveMealNutrition({
      ...draft,
      snapshot: readMealSnapshot(null),
      ingredients: recipe,
      servings: 2,
    });

    expect(resolved.frozen).toBe(false);
    expect(resolved.totals).toEqual(dishTotals(recipe, 2));
    expect(resolved.grams).toBe(dishGrams(recipe, 2));
  });

  test('an empty slot with no snapshot totals zero rather than NaN', () => {
    const resolved = resolveMealNutrition({
      ...draft,
      snapshot: readMealSnapshot(null),
      ingredients: null,
      servings: 1,
    });

    expect(resolved.frozen).toBe(false);
    expect(resolved.grams).toBe(0);
    expect(resolved.totals.kcal.value).toBe(0);
    expect(resolved.totals.kcal.unmeasured).toBe(0);
  });

  test('an empty slot on a published plan is fine — there is nothing to freeze', () => {
    const resolved = resolveMealNutrition({
      ...published,
      snapshot: readMealSnapshot(null),
      ingredients: null,
      servings: 1,
    });

    expect(resolved.grams).toBe(0);
  });

  test('a snapshot on a dish that no longer loads still resolves', () => {
    const snapshot = buildMealSnapshot(recipe, 1);
    const resolved = resolveMealNutrition({
      ...published,
      snapshot: readMealSnapshot(snapshot),
      ingredients: null,
      servings: 1,
    });

    expect(resolved.frozen).toBe(true);
    expect(resolved.totals.kcal.value).toBe(snapshot.totals.kcal.value);
  });

  /**
   * The three ways a published plan can fail, and the one thing they must never
   * do: quietly produce today's numbers under yesterday's prescription.
   *
   * Before this pass all three returned live figures with `frozen: false`, which
   * is indistinguishable on screen from a plan that was never published.
   */
  test('a published meal with no snapshot throws rather than calculating live', () => {
    expect(() =>
      resolveMealNutrition({
        ...published,
        snapshot: readMealSnapshot(null),
        ingredients: recipe,
        servings: 1,
      }),
    ).toThrow(MealSnapshotError);
  });

  test('a published meal with a malformed snapshot throws', () => {
    expect(() =>
      resolveMealNutrition({
        ...published,
        snapshot: readMealSnapshot({ version: 1, totals: {}, grams: 0 }),
        ingredients: recipe,
        servings: 1,
      }),
    ).toThrow(MealSnapshotError);
  });

  test('a published meal with an unsupported version throws, and says which', () => {
    expect(() =>
      resolveMealNutrition({
        ...published,
        snapshot: readMealSnapshot({ ...buildMealSnapshot(recipe, 1), version: 7 }),
        ingredients: recipe,
        servings: 1,
      }),
    ).toThrow(/version 7/);
  });

  test('a draft holding a damaged blob still calculates live — a draft is live anyway', () => {
    const resolved = resolveMealNutrition({
      ...draft,
      snapshot: readMealSnapshot({ nonsense: true }),
      ingredients: recipe,
      servings: 1,
    });

    expect(resolved.frozen).toBe(false);
    expect(resolved.totals).toEqual(dishTotals(recipe, 1));
  });
});

describe('requiresFrozenNutrition', () => {
  test('published and archived plans are records; a draft is a working copy', () => {
    expect(requiresFrozenNutrition('published')).toBe(true);
    expect(requiresFrozenNutrition('archived')).toBe(true);
    expect(requiresFrozenNutrition('draft')).toBe(false);
  });
});
