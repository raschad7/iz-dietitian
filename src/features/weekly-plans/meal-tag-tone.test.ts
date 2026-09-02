import { describe, expect, test } from 'bun:test';

import {
  PROTEIN_ACCENT_CLASS,
  dishAccentClass,
  proteinAccentClass,
  proteinDotClasses,
  proteinMessageKey,
} from './meal-tag-tone';
import { PROTEIN_SOURCES } from './dish-composition';
import type { DishIngredientDetail } from './nutrition';

/** A recipe line carrying just enough for `proteinSource` to read it. */
function line(category: string, protein: number, grams: number): DishIngredientDetail {
  return {
    quantityGrams: grams,
    food: {
      id: `${category}-${protein}`,
      nameAr: category,
      nameEn: category,
      category,
      kcal: 100,
      protein,
      carbs: 0,
      fat: 0,
    } as DishIngredientDetail['food'],
    portion: null,
    portionQuantity: null,
    isPrimary: true,
    sortOrder: 0,
  } as DishIngredientDetail;
}

describe('protein source tone', () => {
  /*
   * The catalog prints a dot per protein source, the planner paints one rule per
   * meal, and the board's colour key counts them — all from this one map. Two
   * sources sharing a class is not a cosmetic slip; it is a legend that silently
   * lies on three screens.
   */
  test('every protein source has its own colour, and none is missing', () => {
    const classes = PROTEIN_SOURCES.map((source) => PROTEIN_ACCENT_CLASS[source]);

    expect(classes.every(Boolean)).toBe(true);
    expect(new Set(classes).size).toBe(classes.length);
  });

  /*
   * `none` is an answer, not a gap. A fruit snack and a plate of salad are
   * genuinely "no main protein", and the whole point of moving the colour here
   * was that every card gets one — so this must be a real class, not a fallback.
   */
  test('a dish with no protein is coloured, not left blank', () => {
    expect(PROTEIN_ACCENT_CLASS.none).toBe('bg-planner-protein-none');
    expect(proteinAccentClass('none')).toBe('bg-planner-protein-none');
  });

  test('an unrecognised value draws the neutral mark rather than nothing', () => {
    expect(proteinAccentClass('shellfish')).toBe('bg-planner-protein-none');
    expect(proteinAccentClass('')).toBe('bg-planner-protein-none');
  });

  /*
   * The reason this axis replaced `source`: it is computed from the recipe, so
   * the colour cannot be typed wrong and cannot go stale when the recipe changes.
   */
  test('a dish takes its colour from its own recipe', () => {
    const chickenAndRice = [line('poultry', 31, 150), line('grains', 2.7, 200)];
    const lentils = [line('legumes', 9, 200), line('grains', 2.7, 100)];

    expect(dishAccentClass(chickenAndRice)).toBe('bg-planner-protein-poultry');
    expect(dishAccentClass(lentils)).toBe('bg-planner-protein-legume');
  });

  test('a dot carries the fill plus the ring that makes it survive being 8px', () => {
    const dot = proteinDotClasses('fish');

    expect(dot).toContain('bg-planner-protein-fish');
    expect(dot).toContain('ring-inset');
  });

  /*
   * next-intl only accepts keys it can see. An unrecognised value must resolve to
   * a key that exists rather than throwing at render — the same guard
   * `axisMessageKey` applies to the four axes.
   */
  test('a message key is always one the catalog actually has', () => {
    expect(proteinMessageKey('fish')).toBe('proteinSources.fish');
    expect(proteinMessageKey('shellfish')).toBe('proteinSources.none');
  });
});
