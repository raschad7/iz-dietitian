import { describe, expect, test } from 'bun:test';

import { normalizeForSearch } from './search';

describe('normalizeForSearch', () => {
  test('folds every alef variant to bare alef', () => {
    expect(normalizeForSearch('أحمد')).toBe('احمد');
    expect(normalizeForSearch('إبراهيم')).toBe('ابراهيم');
    expect(normalizeForSearch('آدم')).toBe('ادم');
  });

  test('folds alef maqsura to yaa', () => {
    expect(normalizeForSearch('مصطفى')).toBe('مصطفي');
  });

  test('folds taa marbuta to haa', () => {
    expect(normalizeForSearch('فاطمة')).toBe('فاطمه');
  });

  test('strips tashkeel', () => {
    expect(normalizeForSearch('سُمَيَّة')).toBe('سميه');
  });

  test('a typed query and the stored name converge on the same value', () => {
    expect(normalizeForSearch('احمد')).toBe(normalizeForSearch('أحمد'));
  });

  test('trims and lowercases Latin input, leaving letters intact', () => {
    expect(normalizeForSearch('  Ahmad Khalil  ')).toBe('ahmad khalil');
  });

  test('handles an empty string', () => {
    expect(normalizeForSearch('')).toBe('');
  });
});
