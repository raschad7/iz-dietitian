import { describe, expect, test } from 'bun:test';

import { generatedMealSchema } from './schema';

/**
 * The week that was thrown away because of a number nothing reads.
 *
 * A refinement pass answered with `servings: 3.5` on one meal of thirty-five, and
 * the whole response was rejected — thirty-five good dish choices lost to a hint
 * that `chooseServings` was about to discard anyway.
 */
describe('generatedMealSchema — the servings hint', () => {
  const meal = (servings: unknown) =>
    generatedMealSchema.parse({ dish: 'chicken-rice', servings, rationaleAr: '', sides: [] });

  test('an out-of-range hint is clamped, not rejected', () => {
    expect(meal(3.5).servings).toBe(3);
    expect(meal(0.1).servings).toBe(0.25);
    expect(meal(999).servings).toBe(3);
  });

  test('a usable hint survives untouched', () => {
    expect(meal(1.5).servings).toBe(1.5);
    expect(meal('2').servings).toBe(2);
  });

  test('nonsense falls back to one serving rather than failing the week', () => {
    expect(meal('not a number').servings).toBe(1);
    expect(meal(null).servings).toBe(1);
  });
});
