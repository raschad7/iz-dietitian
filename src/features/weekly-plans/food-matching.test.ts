import { beforeEach, describe, expect, test } from 'bun:test';

import { db } from '@/db';
import { foods } from '@/db/schema';
import { createTestClinic, resetDatabase } from '../../../tests/helpers';

import { rememberFoodAlias } from './catalog-mutations';
import { createStubTranslator } from './food-translate';
import { findFoodMatches } from './food-matching';

let clinicId: string;

beforeEach(async () => {
  await resetDatabase();
  clinicId = await createTestClinic();
});

describe('findFoodMatches', () => {
  test('a remembered alias resolves first, marked as remembered, with no translator call', async () => {
    const [food] = await db
      .insert(foods)
      .values({ description: 'Chicken breast', category: 'Poultry', kcal: 165, protein: 31, carbs: 0, fat: 3.6 })
      .returning({ id: foods.id });
    await rememberFoodAlias(clinicId, food!.id, 'دجاج');

    let called = false;
    const translator = { async toKeywords() { called = true; return 'unused'; } };

    const result = await findFoodMatches(clinicId, 'دجاج', { translator });
    expect(result.source).toBe('alias');
    expect(result.matches[0]!.id).toBe(food!.id);
    expect(called).toBe(false);
  });

  test('falls back to translate + search when no alias exists', async () => {
    await db
      .insert(foods)
      .values({ description: 'Chicken breast', category: 'Poultry', kcal: 165, protein: 31, carbs: 0, fat: 3.6 });

    // Stub translator echoes; use an English term the description contains.
    const result = await findFoodMatches(clinicId, 'chicken', { translator: createStubTranslator() });
    expect(result.source).toBe('search');
    expect(result.matches.map((m) => m.description)).toContain('Chicken breast');
  });

  test('returns no matches (not an error) when nothing is found', async () => {
    const result = await findFoodMatches(clinicId, 'zzzznothing', { translator: createStubTranslator() });
    expect(result.matches).toHaveLength(0);
  });

  test('degrades to a raw-name search when the translator throws, instead of crashing', async () => {
    const translator = {
      async toKeywords(): Promise<string> {
        throw new Error('translator down');
      },
    };
    const result = await findFoodMatches(clinicId, 'دجاج', { translator });
    expect(result.source).toBe('search');
    expect(result.matches).toEqual([]);
  });
});
