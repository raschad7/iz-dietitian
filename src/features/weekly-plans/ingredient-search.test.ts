import { describe, expect, test } from 'bun:test';

import { mergeFoodResults } from './ingredient-search';
import type { FoodSearchResult } from './queries';

/**
 * The unified ingredient search shows the dietitian one list, drawn from several
 * internal sources (clinic foods, shared foods, alias/translated USDA). The merge
 * is what makes that one list honest: a food that turns up in two sources is the
 * SAME food and must appear once, and the source that found it first — the more
 * local, more relevant one — decides where it sits.
 */
function food(id: string, description: string): FoodSearchResult {
  return {
    id,
    description,
    nameAr: null,
    category: 'x',
    portionGrams: null,
    portionLabel: null,
    kcal: 100,
    protein: 1,
    fat: 1,
    carbs: 1,
    fiber: null,
    sugar: null,
    saturatedFat: null,
    cholesterol: null,
    sodium: null,
    calcium: null,
    iron: null,
    potassium: null,
  };
}

describe('mergeFoodResults', () => {
  test('keeps source priority order: clinic first, then shared, then translated', () => {
    const clinic = [food('a', 'clinic rice')];
    const shared = [food('b', 'shared rice')];
    const translated = [food('c', 'usda rice')];
    expect(mergeFoodResults(clinic, shared, translated).map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });

  test('a food found by two sources appears once, at its highest-priority position', () => {
    const clinic = [food('a', 'clinic rice')];
    // The same food id resolved again by the shared search and again by USDA.
    const shared = [food('a', 'rice'), food('b', 'basmati')];
    const translated = [food('a', 'rice'), food('b', 'basmati'), food('c', 'brown rice')];
    expect(mergeFoodResults(clinic, shared, translated).map((f) => f.id)).toEqual(['a', 'b', 'c']);
  });

  test('is stable within a source and drops nothing unique', () => {
    const shared = [food('x', 'a'), food('y', 'b'), food('z', 'c')];
    expect(mergeFoodResults([], shared).map((f) => f.id)).toEqual(['x', 'y', 'z']);
  });

  test('empty groups merge to an empty list', () => {
    expect(mergeFoodResults([], [], [])).toEqual([]);
  });
});
