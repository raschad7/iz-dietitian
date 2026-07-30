import { describe, expect, test } from 'bun:test';

import {
  bestServings,
  deviation,
  findSimilar,
  isSimilar,
  MAX_SERVINGS,
  MIN_SERVINGS,
  snapServings,
  type SimilarCandidate,
} from './similar';

describe('snapServings', () => {
  test('rounds to the nearest quarter', () => {
    expect(snapServings(1.1)).toBe(1);
    expect(snapServings(1.13)).toBe(1.25);
    expect(snapServings(1.37)).toBe(1.25);
    expect(snapServings(1.4)).toBe(1.5);
  });

  test('clamps to the legal range', () => {
    expect(snapServings(0.01)).toBe(MIN_SERVINGS);
    expect(snapServings(99)).toBe(MAX_SERVINGS);
  });

  test('does not leak floating point noise', () => {
    // 7 × 0.25 = 1.75, but the division and multiplication can produce
    // 1.7500000000000002, which would render as that in a UI.
    expect(snapServings(1.7499)).toBe(1.75);
    expect(Number.isInteger(snapServings(1.75) * 100)).toBe(true);
  });
});

describe('bestServings', () => {
  test('finds the multiplier closest to the budget', () => {
    // 620 / 400 = 1.55 → 1.5
    expect(bestServings(400, 620)).toBe(1.5);
  });

  test('is null for a dish with no energy', () => {
    expect(bestServings(0, 600)).toBeNull();
  });

  test('is null for a budget of nothing', () => {
    expect(bestServings(400, 0)).toBeNull();
  });
});

describe('deviation', () => {
  test('is signed', () => {
    expect(deviation(552, 600)).toBeCloseTo(-0.08, 6);
    expect(deviation(648, 600)).toBeCloseTo(0.08, 6);
  });

  test('is zero against a zero budget rather than infinite', () => {
    expect(deviation(500, 0)).toBe(0);
  });
});

describe('isSimilar', () => {
  test('accepts within 15% either way', () => {
    expect(isSimilar(510, 600)).toBe(true);
    expect(isSimilar(690, 600)).toBe(true);
  });

  test('rejects beyond the band', () => {
    expect(isSimilar(500, 600)).toBe(false);
    expect(isSimilar(700, 600)).toBe(false);
  });

  test('the boundary itself counts as similar', () => {
    expect(isSimilar(600 * 0.85, 600)).toBe(true);
    expect(isSimilar(600 * 1.15, 600)).toBe(true);
  });
});

describe('findSimilar', () => {
  const catalog: SimilarCandidate[] = [
    { slug: 'mujaddara', mealTypes: ['lunch', 'dinner'], allergenTags: [], baseKcal: 620 },
    { slug: 'maqluba', mealTypes: ['lunch'], allergenTags: ['nuts'], baseKcal: 600 },
    { slug: 'musakhan', mealTypes: ['lunch'], allergenTags: ['gluten', 'nuts'], baseKcal: 700 },
    { slug: 'fasolia', mealTypes: ['lunch', 'dinner'], allergenTags: [], baseKcal: 590 },
    { slug: 'labaneh', mealTypes: ['breakfast'], allergenTags: ['lactose'], baseKcal: 380 },
    { slug: 'cucumber', mealTypes: ['snack'], allergenTags: [], baseKcal: 0 },
  ];

  test('returns dishes for the right meal type only', () => {
    const matches = findSimilar({ candidates: catalog, mealType: 'lunch', budgetKcal: 620 });

    expect(matches.map((match) => match.candidate.slug)).not.toContain('labaneh');
  });

  test('excludes dishes carrying a blocked allergen', () => {
    const matches = findSimilar({
      candidates: catalog,
      mealType: 'lunch',
      budgetKcal: 620,
      allergens: ['nuts'],
    });

    const slugs = matches.map((match) => match.candidate.slug);
    expect(slugs).not.toContain('maqluba');
    expect(slugs).not.toContain('musakhan');
    expect(slugs).toContain('mujaddara');
  });

  test('ranks by closeness to the budget', () => {
    const matches = findSimilar({ candidates: catalog, mealType: 'lunch', budgetKcal: 620 });

    expect(matches[0]?.candidate.slug).toBe('mujaddara');
    expect(matches[0]?.deviation).toBeCloseTo(0, 6);
  });

  test('drops dishes that cannot reach the budget at any legal portion', () => {
    const matches = findSimilar({ candidates: catalog, mealType: 'snack', budgetKcal: 200 });

    expect(matches.map((match) => match.candidate.slug)).not.toContain('cucumber');
  });

  test('honours excludeSlugs so the panel never offers what is on screen', () => {
    const matches = findSimilar({
      candidates: catalog,
      mealType: 'lunch',
      budgetKcal: 620,
      excludeSlugs: ['mujaddara'],
    });

    expect(matches.map((match) => match.candidate.slug)).not.toContain('mujaddara');
  });

  test('reports the servings and calories it would use', () => {
    const matches = findSimilar({ candidates: catalog, mealType: 'lunch', budgetKcal: 300 });
    const maqluba = matches.find((match) => match.candidate.slug === 'maqluba');

    // 300 / 600 = 0.5 exactly.
    expect(maqluba?.servings).toBe(0.5);
    expect(maqluba?.kcal).toBe(300);
  });

  test('is stable for equally close candidates', () => {
    const tied: SimilarCandidate[] = [
      { slug: 'zeta', mealTypes: ['lunch'], allergenTags: [], baseKcal: 600 },
      { slug: 'alpha', mealTypes: ['lunch'], allergenTags: [], baseKcal: 600 },
    ];

    const matches = findSimilar({ candidates: tied, mealType: 'lunch', budgetKcal: 600 });

    expect(matches.map((match) => match.candidate.slug)).toEqual(['alpha', 'zeta']);
  });

  test('respects the limit', () => {
    const matches = findSimilar({
      candidates: catalog,
      mealType: 'lunch',
      budgetKcal: 620,
      limit: 1,
    });

    expect(matches).toHaveLength(1);
  });
});
