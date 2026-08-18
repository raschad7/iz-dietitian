import { describe, expect, test } from 'bun:test';

import { isArabicLocale, localizedName, localizedPortionLabel, secondaryName } from './food-display';

/**
 * Which stored name gets printed.
 *
 * This file used to test `conciseFoodName`, which cut a USDA description down to
 * something printable. There is no description to cut any more — a catalog food
 * carries both names as data — so what is worth pinning down instead is the
 * locale choice and, more importantly, the fallback: a clinic food that has only
 * an Arabic name must still render, in English, as that Arabic name.
 */

const rice = { nameAr: 'أرز أبيض مطبوخ', nameEn: 'White rice, cooked' };
const arabicOnly = { nameAr: 'جميد بلدي', nameEn: '' };
const englishOnly = { nameAr: '', nameEn: 'Imported supplement' };

describe('localizedName', () => {
  test('prints Arabic in an Arabic locale and English in an English one', () => {
    expect(localizedName(rice, 'ar')).toBe('أرز أبيض مطبوخ');
    expect(localizedName(rice, 'en')).toBe('White rice, cooked');
  });

  /**
   * The explicit fallback. Clinic foods were created when the English name was
   * optional, and migrated ones may carry only what the dietitian typed. Printing
   * nothing would drop an ingredient off a recipe rather than merely showing it in
   * the wrong language.
   */
  test('falls back to the name that exists rather than rendering blank', () => {
    expect(localizedName(arabicOnly, 'en')).toBe('جميد بلدي');
    expect(localizedName(englishOnly, 'ar')).toBe('Imported supplement');
  });

  test('treats null, undefined and whitespace as missing', () => {
    expect(localizedName({ nameAr: null, nameEn: 'Olive oil' }, 'ar')).toBe('Olive oil');
    expect(localizedName({ nameAr: undefined, nameEn: 'Olive oil' }, 'ar')).toBe('Olive oil');
    expect(localizedName({ nameAr: '   ', nameEn: 'Olive oil' }, 'ar')).toBe('Olive oil');
  });

  test('returns an empty string only when there is genuinely no name', () => {
    expect(localizedName({ nameAr: null, nameEn: null }, 'ar')).toBe('');
  });
});

describe('secondaryName', () => {
  test('is the other language when it differs', () => {
    expect(secondaryName(rice, 'ar')).toBe('White rice, cooked');
    expect(secondaryName(rice, 'en')).toBe('أرز أبيض مطبوخ');
  });

  /** Null, not '': the caller renders no element at all rather than an empty line. */
  test('is null when it would repeat the primary or does not exist', () => {
    expect(secondaryName(arabicOnly, 'en')).toBeNull();
    expect(secondaryName(arabicOnly, 'ar')).toBeNull();
    expect(secondaryName({ nameAr: 'زيت', nameEn: 'زيت' }, 'ar')).toBeNull();
  });
});

describe('localizedPortionLabel', () => {
  test('reads label_ar / label_en with the same rules', () => {
    const cup = { labelAr: 'كوب', labelEn: 'Cup' };

    expect(localizedPortionLabel(cup, 'ar')).toBe('كوب');
    expect(localizedPortionLabel(cup, 'en')).toBe('Cup');
  });
});

describe('isArabicLocale', () => {
  test('matches the Arabic locale and its regional variants only', () => {
    expect(isArabicLocale('ar')).toBe(true);
    expect(isArabicLocale('ar-PS')).toBe(true);
    expect(isArabicLocale('en')).toBe(false);
  });
});
