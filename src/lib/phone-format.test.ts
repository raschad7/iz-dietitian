import { describe, expect, test } from 'bun:test';

import { COUNTRIES, COUNTRY_ORDER, DEFAULT_COUNTRY, type CountryCode } from './phone-countries';
import { countryForDial, joinPhone, splitPhone } from './phone-format';

/** Palestine, `+970` — the clinic's own country and the field's default. */
const HOME = COUNTRIES[DEFAULT_COUNTRY].dial;

describe('splitPhone', () => {
  test('gives the clinic\'s own code and an empty number when there is nothing stored', () => {
    expect(splitPhone(null)).toEqual({ dial: HOME, national: '' });
    expect(splitPhone(undefined)).toEqual({ dial: HOME, national: '' });
    expect(splitPhone('')).toEqual({ dial: HOME, national: '' });
    expect(splitPhone('   ')).toEqual({ dial: HOME, national: '' });
  });

  test('reads a number written with a plus', () => {
    expect(splitPhone('+970599123456')).toEqual({ dial: '970', national: '599123456' });
  });

  test('reads a number written with 00', () => {
    expect(splitPhone('00970599123456')).toEqual({ dial: '970', national: '599123456' });
  });

  test('keeps punctuation out of the result', () => {
    expect(splitPhone('+970 59-912 3456')).toEqual({ dial: '970', national: '599123456' });
  });

  test('treats a leading zero as a trunk prefix and assumes the clinic\'s country', () => {
    expect(splitPhone('0599123456')).toEqual({ dial: HOME, national: '599123456' });
  });

  test('assumes the clinic\'s country for a bare national number', () => {
    expect(splitPhone('599123456')).toEqual({ dial: HOME, national: '599123456' });
  });

  test('splits a full international number pasted without its plus', () => {
    expect(splitPhone('970599123456')).toEqual({ dial: '970', national: '599123456' });
  });

  test('prefers the longest matching code, so +1868 is not read as +1', () => {
    expect(splitPhone('+18685551234')).toEqual({ dial: '1868', national: '5551234' });
    expect(splitPhone('+12125551234')).toEqual({ dial: '1', national: '2125551234' });
  });

  test('reads other countries', () => {
    expect(splitPhone('+9721234567')).toEqual({ dial: '972', national: '1234567' });
    expect(splitPhone('+962791234567')).toEqual({ dial: '962', national: '791234567' });
    expect(splitPhone('+442071234567')).toEqual({ dial: '44', national: '2071234567' });
  });

  test('keeps every digit of an unrecognised code rather than dropping any', () => {
    // Nothing is lost: the digits stay in the field for a human to correct.
    expect(splitPhone('+9995551234')).toEqual({ dial: HOME, national: '9995551234' });
  });
});

describe('joinPhone', () => {
  test('combines the two halves', () => {
    expect(joinPhone('970', '599123456')).toBe('+970599123456');
  });

  test('is empty when no number was typed, so an untouched field stays optional', () => {
    expect(joinPhone('970', '')).toBe('');
    expect(joinPhone('970', '   ')).toBe('');
    expect(joinPhone('970', '--')).toBe('');
  });

  test('drops a national trunk zero, which E.164 does not carry', () => {
    expect(joinPhone('970', '0599123456')).toBe('+970599123456');
    expect(joinPhone('970', '00599123456')).toBe('+970599123456');
  });

  test('ignores punctuation and spacing', () => {
    expect(joinPhone('970', '059-912 3456')).toBe('+970599123456');
  });
});

describe('splitPhone and joinPhone round-trip', () => {
  /** Split, rejoin, split again: the second pass must change nothing. */
  function normalise(stored: string): string {
    const { dial, national } = splitPhone(stored);
    return joinPhone(dial, national);
  }

  test.each([
    '+970599123456',
    '0599123456',
    '599123456',
    '00970599123456',
    '+962791234567',
    '+18685551234',
    '+442071234567',
  ])('%s normalises to a stable E.164 value', (stored) => {
    const once = normalise(stored);

    expect(once).toMatch(/^\+\d{8,15}$/);
    // Re-editing a saved client must not shift the number a second time.
    expect(normalise(once)).toBe(once);
  });

  test('normalises every local spelling of one number onto the same value', () => {
    const written = ['+970599123456', '00970599123456', '0599123456', '599123456', '+970 599 123 456'];
    const stored = written.map((raw) => {
      const { dial, national } = splitPhone(raw);
      return joinPhone(dial, national);
    });

    expect(new Set(stored)).toEqual(new Set(['+970599123456']));
  });
});

describe('countryForDial', () => {
  test('resolves the clinic\'s own code', () => {
    expect(countryForDial(HOME)).toBe(DEFAULT_COUNTRY);
  });

  test('picks the expected country where several share a code', () => {
    expect(countryForDial('44')).toBe('GB');
    expect(countryForDial('1')).toBe('US');
    expect(countryForDial('7')).toBe('RU');
    expect(countryForDial('39')).toBe('IT');
  });

  test('falls back to the clinic\'s country for a code it does not know', () => {
    expect(countryForDial('99999')).toBe(DEFAULT_COUNTRY);
  });

  test('every country in the table resolves to something selectable', () => {
    for (const iso of Object.keys(COUNTRIES) as CountryCode[]) {
      expect(COUNTRIES[countryForDial(COUNTRIES[iso].dial)]).toBeDefined();
    }
  });
});

describe('the country table', () => {
  test('lists every country once per language, and nothing extra', () => {
    const isos = (Object.keys(COUNTRIES) as CountryCode[]).sort();

    for (const locale of ['ar', 'en'] as const) {
      expect([...COUNTRY_ORDER[locale]].sort()).toEqual(isos);
    }
  });

  test('has a digits-only calling code and a name in both languages for every country', () => {
    for (const [iso, country] of Object.entries(COUNTRIES)) {
      expect(country.dial).toMatch(/^\d{1,4}$/);
      expect(country.ar.length, `${iso} Arabic name`).toBeGreaterThan(0);
      expect(country.en.length, `${iso} English name`).toBeGreaterThan(0);
    }
  });
});
