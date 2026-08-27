import { describe, expect, test } from 'bun:test';

import {
  CLIENT_MIN_PASSWORD_LENGTH,
  clientPasswordChecks,
  isStrongClientPassword,
  isStrongStaffPassword,
  generateTemporaryPassword,
  isCommonPassword,
} from './password-policy';

describe('isCommonPassword', () => {
  test('rejects the obvious ones', () => {
    expect(isCommonPassword('123456')).toBe(true);
    expect(isCommonPassword('password')).toBe(true);
    expect(isCommonPassword('qwerty')).toBe(true);
  });

  test('ignores case and surrounding whitespace', () => {
    expect(isCommonPassword('  PassWord  ')).toBe(true);
  });

  test('accepts something ordinary', () => {
    expect(isCommonPassword('tuffah-7')).toBe(false);
  });
});

describe('generateTemporaryPassword', () => {
  test('avoids glyphs that are misread when written down or read aloud', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateTemporaryPassword()).not.toMatch(/[0O1lI]/);
    }
  });

  test('is long enough to resist guessing while it is in circulation', () => {
    expect(generateTemporaryPassword().length).toBeGreaterThanOrEqual(10);
  });

  test('does not repeat', () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateTemporaryPassword()));
    expect(seen.size).toBe(100);
  });

  test('is never itself a common password', () => {
    expect(isCommonPassword(generateTemporaryPassword())).toBe(false);
  });
});

describe('CLIENT_MIN_PASSWORD_LENGTH', () => {
  test('is eight, matching the Better Auth global floor', () => {
    expect(CLIENT_MIN_PASSWORD_LENGTH).toBe(8);
  });

  test('is under the staff minimum, which is the whole reason both exist', () => {
    expect(CLIENT_MIN_PASSWORD_LENGTH).toBeLessThan(10);
  });
});

describe('isStrongStaffPassword', () => {
  test('rejects a single character class, however long', () => {
    expect(isStrongStaffPassword('aaaaaaaaaaaa')).toBe(false);
  });

  test('rejects a common password', () => {
    expect(isStrongStaffPassword('password')).toBe(false);
  });

  test('accepts letters mixed with digits', () => {
    expect(isStrongStaffPassword('dietitian24')).toBe(true);
  });

  test('accepts letters mixed with symbols', () => {
    expect(isStrongStaffPassword('dietitian!!')).toBe(true);
  });
});

describe('clientPasswordChecks', () => {
  test('answers the three rules separately', () => {
    expect(clientPasswordChecks('tuffah24')).toEqual({ length: true, letter: true, digit: true });
  });

  test('reports the short value as short without calling it letterless', () => {
    expect(clientPasswordChecks('tuf4')).toEqual({ length: false, letter: true, digit: true });
  });

  test('counts Arabic letters as letters', () => {
    expect(clientPasswordChecks('تفاحة2024').letter).toBe(true);
  });

  test('counts Arabic-Indic numerals as digits', () => {
    expect(clientPasswordChecks('tuffah٢٤').digit).toBe(true);
  });

  test('a symbol is neither a letter nor a digit', () => {
    expect(clientPasswordChecks('--------')).toEqual({
      length: true,
      letter: false,
      digit: false,
    });
  });
});

describe('isStrongClientPassword', () => {
  test('rejects a single character class, however long', () => {
    expect(isStrongClientPassword('aaaaaaaaaa')).toBe(false);
    expect(isStrongClientPassword('123456789012')).toBe(false);
  });

  test('rejects a common password', () => {
    expect(isStrongClientPassword('qwerty')).toBe(false);
  });

  test('requires a digit — a symbol cannot stand in for one', () => {
    expect(isStrongClientPassword('tuffah--')).toBe(false);
  });

  test('requires a letter — a symbol cannot stand in for one', () => {
    expect(isStrongClientPassword('2024----')).toBe(false);
  });

  test('accepts letters mixed with digits', () => {
    expect(isStrongClientPassword('tuffah24')).toBe(true);
  });

  test('accepts a symbol alongside the two required classes', () => {
    expect(isStrongClientPassword('tuffah-2024')).toBe(true);
  });

  test('says nothing about length — that is the schema’s rule', () => {
    expect(isStrongClientPassword('a1')).toBe(true);
  });
});
