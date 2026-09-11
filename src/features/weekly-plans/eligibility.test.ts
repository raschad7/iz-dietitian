import { describe, expect, test } from 'bun:test';

import {
  allergenConflicts,
  evaluateDishEligibility,
  isSupportedDietPattern,
} from './eligibility';

const food = (nameAr: string, nameEn: string, category: string) => ({
  food: { nameAr, nameEn, category },
});

const dish = (
  ingredients: readonly ReturnType<typeof food>[],
  allergenTags: readonly string[] = [],
) => ({ ingredients, allergenTags });

describe('allergen compatibility', () => {
  test('legacy umbrellas block their precise descendants in both directions', () => {
    expect(allergenConflicts(['nuts'], ['peanut'])).toEqual(['nuts']);
    expect(allergenConflicts(['peanut'], ['nuts'])).toEqual(['peanut']);
    expect(allergenConflicts(['milk'], ['lactose'])).toEqual(['milk']);
  });

  test('obvious recipe carriers are a second gate even when dish tags are missing', () => {
    const result = evaluateDishEligibility(
      dish([food('خبز عربي', 'Arabic bread', 'grains')]),
      { allergens: ['gluten'], dietPattern: null },
    );

    expect(result.eligible).toBe(false);
    expect(result.blockedBy).toEqual(['gluten']);
  });

  test('peanut butter is not inferred to contain milk', () => {
    expect(
      evaluateDishEligibility(
        dish([food('زبدة الفول السوداني', 'Peanut butter', 'nuts_seeds')]),
        { allergens: ['milk'], dietPattern: null },
      ).eligible,
    ).toBe(true);
  });
});

describe('diet pattern eligibility', () => {
  const lentils = food('عدس', 'Lentils', 'legumes');
  const egg = food('بيض', 'Egg', 'eggs');
  const chicken = food('دجاج', 'Chicken', 'poultry');

  test('vegetarian allows egg but refuses chicken', () => {
    expect(evaluateDishEligibility(dish([lentils, egg]), { allergens: [], dietPattern: 'vegetarian' }).eligible).toBe(true);
    expect(evaluateDishEligibility(dish([lentils, chicken]), { allergens: [], dietPattern: 'vegetarian' }).eligible).toBe(false);
  });

  test('vegan accepts only foods explicitly known to be plant-derived', () => {
    expect(evaluateDishEligibility(dish([lentils]), { allergens: [], dietPattern: 'vegan' }).eligible).toBe(true);
    expect(evaluateDishEligibility(dish([egg]), { allergens: [], dietPattern: 'vegan' }).eligible).toBe(false);
    expect(evaluateDishEligibility(dish([food('خلطة البيت', 'House mix', 'other')]), { allergens: [], dietPattern: 'vegan' }).eligible).toBe(false);
  });

  test('therapeutic patterns stay outside validated generation scope', () => {
    expect(isSupportedDietPattern('vegetarian')).toBe(true);
    expect(isSupportedDietPattern('renal')).toBe(false);
    expect(evaluateDishEligibility(dish([lentils]), { allergens: [], dietPattern: 'renal' }).eligible).toBe(false);
  });

  test('a typed exclusion cannot masquerade as a checked catalog constraint', () => {
    const result = evaluateDishEligibility(dish([lentils]), {
      allergens: [],
      dietPattern: null,
      unmappedExclusions: ['كيوي'],
    });

    expect(result.eligible).toBe(false);
    expect(result.violations).toContainEqual({ kind: 'unmapped_exclusion', exclusion: 'كيوي' });
  });
});
