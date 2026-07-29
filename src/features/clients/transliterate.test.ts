import { describe, expect, test } from 'bun:test';

import { suggestUsername, transliterateArabic } from './transliterate';

describe('transliterateArabic', () => {
  test('maps a common Arabic name to Latin letters', () => {
    expect(transliterateArabic('أحمد')).toBe('ahmd');
  });

  test('folds alef variants and taa marbuta before mapping', () => {
    expect(transliterateArabic('سارة')).toBe('sarh');
  });

  test('strips tashkeel rather than transliterating it', () => {
    expect(transliterateArabic('مُحَمَّد')).toBe('mhmd');
  });

  test('maps digraphs to their two-letter forms', () => {
    expect(transliterateArabic('خالد')).toBe('khald');
    expect(transliterateArabic('شادي')).toBe('shady');
  });

  test('leaves Latin input untouched', () => {
    expect(transliterateArabic('Layla')).toBe('Layla');
  });
});

describe('suggestUsername', () => {
  test('produces lowercase latin with a four-digit suffix', () => {
    const suggestion = suggestUsername('Layla Haddad');
    expect(suggestion).toMatch(/^layla-haddad-\d{4}$/);
  });

  test('transliterates an Arabic name', () => {
    expect(suggestUsername('أحمد خليل')).toMatch(/^ahmd-khlyl-\d{4}$/);
  });

  test('contains only lowercase letters, digits and hyphens', () => {
    expect(suggestUsername("O'Brien  Anne-Marie")).toMatch(/^[a-z0-9-]+$/);
  });

  test('collapses runs of separators rather than leaving doubles', () => {
    expect(suggestUsername('Anne   --  Marie')).not.toContain('--');
  });

  test('falls back to "client" when nothing usable survives', () => {
    expect(suggestUsername('!!! ???')).toMatch(/^client-\d{4}$/);
  });

  test('never starts or ends with a hyphen', () => {
    const suggestion = suggestUsername('-- Sara --');
    expect(suggestion.startsWith('-')).toBe(false);
    expect(suggestion.endsWith('-')).toBe(false);
  });
});
