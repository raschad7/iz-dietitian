import { describe, expect, test } from 'bun:test';

import {
  CLIENT_MIN_PASSWORD_LENGTH,
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
  test('is six, matching the Better Auth global floor', () => {
    expect(CLIENT_MIN_PASSWORD_LENGTH).toBe(6);
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

describe('isStrongClientPassword', () => {
  test('rejects a single character class, however long', () => {
    expect(isStrongClientPassword('aaaaaa')).toBe(false);
    expect(isStrongClientPassword('123456789012')).toBe(false);
  });

  test('rejects a common password', () => {
    expect(isStrongClientPassword('qwerty')).toBe(false);
  });

  test('accepts a mix at the client minimum length', () => {
    expect(isStrongClientPassword('tuff4h')).toBe(true);
    expect(isStrongClientPassword('tuffa-h')).toBe(true);
  });

  test('says nothing about length — that is the schema’s rule', () => {
    expect(isStrongClientPassword('a1')).toBe(true);
  });
});
