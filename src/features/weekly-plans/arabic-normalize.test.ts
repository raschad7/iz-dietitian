import { describe, expect, test } from 'bun:test';

import { normalizeArabic } from './arabic-normalize';

/**
 * The normalizer's whole job is to make two spellings of the same Arabic word
 * compare equal, without merging words that are genuinely different. It is used
 * for search matching, alias lookup, and duplicate prevention — so a false merge
 * would hide a real food, and a missed merge would let a duplicate through.
 *
 * The transformations are deliberately conservative (alef forms, tashkeel,
 * tatweel, whitespace) — ة and ى are left alone because normalizing them
 * produces false matches, which is worse here than a missed one.
 */
describe('normalizeArabic', () => {
  test('unifies the alef hamza forms to bare alef', () => {
    // أ (hamza above), إ (hamza below), آ (madda), ٱ (wasla) → ا
    expect(normalizeArabic('أرز')).toBe('ارز');
    expect(normalizeArabic('إجاص')).toBe('اجاص');
    expect(normalizeArabic('آيس كريم')).toBe('ايس كريم');
    expect(normalizeArabic('ٱرز')).toBe('ارز');
  });

  test('strips tashkeel (harakat) so a vowelled word matches an unvowelled one', () => {
    // أَرُزّ (fatha, damma, shadda) → ارز
    expect(normalizeArabic('أَرُزّ')).toBe('ارز');
    expect(normalizeArabic('دَجَاج')).toBe('دجاج');
    // superscript alef (ٰ) is removed too
    expect(normalizeArabic('رَحْمَٰن')).toBe('رحمن');
  });

  test('removes tatweel (kashida) stretching', () => {
    expect(normalizeArabic('دجــــاج')).toBe('دجاج');
  });

  test('collapses and trims whitespace', () => {
    expect(normalizeArabic('  صدر   دجاج  ')).toBe('صدر دجاج');
    expect(normalizeArabic('صدر\tدجاج')).toBe('صدر دجاج');
  });

  test('lowercases latin text so English food names match', () => {
    expect(normalizeArabic('Chicken Breast')).toBe('chicken breast');
  });

  test('is idempotent — normalizing twice changes nothing', () => {
    const once = normalizeArabic('الأَرُزّ  الأبيض');
    expect(normalizeArabic(once)).toBe(once);
  });

  test('empty and whitespace-only input normalize to empty', () => {
    expect(normalizeArabic('')).toBe('');
    expect(normalizeArabic('   ')).toBe('');
  });

  test('does NOT merge genuinely different words', () => {
    // رز (no leading alef) is a different spelling from ارز — merging them is an
    // alias/fuzzy concern, not normalization's job.
    expect(normalizeArabic('رز')).not.toBe(normalizeArabic('ارز'));
    // ة and ى are left intact on purpose.
    expect(normalizeArabic('لبنة')).toBe('لبنة');
    expect(normalizeArabic('مربى')).toBe('مربى');
  });

  test('two orthographic variants of the same word collapse to one key', () => {
    // The core promise: "أرز أبيض" and a tatweel/tashkeel-laden spelling of the
    // same thing produce the identical normalized key.
    expect(normalizeArabic('أرز أبيض')).toBe(normalizeArabic('اَرزــ  أبْيض'));
  });
});
