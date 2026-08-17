import { describe, expect, test } from 'bun:test';

import { conciseFoodName, getFoodDisplayName, getFoodSecondaryName } from './food-display';

describe('conciseFoodName', () => {
  test('keeps the food and its main preparation, dropping USDA provenance', () => {
    expect(conciseFoodName('Cauliflower, cooked, boiled, drained, without salt')).toBe(
      'Cauliflower, cooked',
    );
  });

  test('a single-segment description is returned as-is, trimmed', () => {
    expect(conciseFoodName('Rice')).toBe('Rice');
    expect(conciseFoodName('  Egg  ')).toBe('Egg');
  });

  test('a two-segment description is kept whole', () => {
    expect(conciseFoodName('Rice, white')).toBe('Rice, white');
  });

  test('an empty description stays empty', () => {
    expect(conciseFoodName('')).toBe('');
  });
});

describe('getFoodDisplayName', () => {
  test('Arabic UI shows the Arabic name when the food has one', () => {
    expect(
      getFoodDisplayName({ nameAr: 'أرز أبيض مطبوخ', description: 'Rice, white, cooked' }, 'ar'),
    ).toBe('أرز أبيض مطبوخ');
  });

  test('Arabic UI falls back to a concise English label when there is no Arabic name', () => {
    expect(
      getFoodDisplayName({ nameAr: null, description: 'Cauliflower, cooked, boiled, drained' }, 'ar'),
    ).toBe('Cauliflower, cooked');
  });

  test('English UI shows the concise English label', () => {
    expect(getFoodDisplayName({ nameAr: 'أرز', description: 'Rice, white, cooked' }, 'en')).toBe(
      'Rice, white',
    );
  });

  test('English UI falls back to the Arabic name when the description is empty', () => {
    expect(getFoodDisplayName({ nameAr: 'جميد بلدي', description: '' }, 'en')).toBe('جميد بلدي');
  });
});

describe('getFoodSecondaryName', () => {
  test('Arabic UI offers the English as a secondary line under a real Arabic name', () => {
    expect(
      getFoodSecondaryName({ nameAr: 'أرز', description: 'Rice, white, cooked' }, 'ar'),
    ).toBe('Rice, white');
  });

  test('Arabic UI has no secondary line when the English is already the primary', () => {
    expect(getFoodSecondaryName({ nameAr: null, description: 'Rice, white' }, 'ar')).toBeNull();
  });

  test('English UI offers the Arabic name as the secondary line', () => {
    expect(
      getFoodSecondaryName({ nameAr: 'أرز', description: 'Rice, white, cooked' }, 'en'),
    ).toBe('أرز');
  });
});
