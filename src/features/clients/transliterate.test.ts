import { describe, expect, test } from 'bun:test';

import { pickUsername, randomUsernameCode, transliterateArabic, usernameBase } from './transliterate';

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

describe('usernameBase', () => {
  test('keeps the first name and drops the rest', () => {
    expect(usernameBase('علي حسن سلوكة')).toBe('aly');
    expect(usernameBase('Layla Haddad')).toBe('layla');
  });

  test('transliterates an Arabic first name', () => {
    expect(usernameBase('أحمد خليل')).toBe('ahmd');
  });

  test('contains only lowercase letters, digits and hyphens', () => {
    expect(usernameBase("O'Brien  Anne-Marie")).toMatch(/^[a-z0-9-]+$/);
  });

  test('keeps a hyphenated or apostrophised first name whole', () => {
    expect(usernameBase("O'Brien Anne")).toBe('o-brien');
  });

  test('collapses runs of separators rather than leaving doubles', () => {
    expect(usernameBase('Anne---Marie Haddad')).not.toContain('--');
  });

  test('skips a word that slugs to nothing instead of giving up on the name', () => {
    expect(usernameBase('-- Sara --')).toBe('sara');
  });

  test('falls back to "client" when nothing usable survives', () => {
    expect(usernameBase('!!! ???')).toBe('client');
  });

  test('never starts or ends with a hyphen', () => {
    const base = usernameBase('-- Sara --');
    expect(base.startsWith('-')).toBe(false);
    expect(base.endsWith('-')).toBe(false);
  });

  test('leaves room for a counter under the 60-character cap', () => {
    const base = usernameBase('a'.repeat(200));
    expect(base.length).toBeLessThanOrEqual(51);
    expect(`${base}-99999999`.length).toBeLessThanOrEqual(60);
  });
});

describe('randomUsernameCode', () => {
  test('omits every character that can be confused for another', () => {
    // 4,000 characters is enough that a present character would show up.
    const drawn = Array.from({ length: 1000 }, () => randomUsernameCode()).join('');
    expect(drawn).not.toMatch(/[ilo01]/);
    expect(drawn).toMatch(/^[a-z0-9]+$/);
  });

  test('is four characters unless another length is asked for', () => {
    expect(randomUsernameCode()).toHaveLength(4);
    expect(randomUsernameCode(6)).toHaveLength(6);
  });

  test('does not repeat itself across many draws', () => {
    const draws = Array.from({ length: 500 }, () => randomUsernameCode());
    // 923,521 codes: 500 draws colliding more than a handful of times would
    // mean the generator is not spreading across the alphabet.
    expect(new Set(draws).size).toBeGreaterThan(495);
  });
});

describe('pickUsername', () => {
  /** A generator that hands back a known sequence, then repeats the last one. */
  function codes(...sequence: string[]): (length: number) => string {
    let index = 0;
    return () => sequence[Math.min(index++, sequence.length - 1)] ?? 'zzzz';
  }

  test('always appends a code, even to the first client on a name', () => {
    expect(pickUsername('rmdan', new Set(), codes('h7kp'))).toBe('rmdan-h7kp');
  });

  test('never offers the bare name, which would be confusable with a coded one', () => {
    expect(pickUsername('rmdan', new Set(), codes('h7kp'))).not.toBe('rmdan');
  });

  test('draws again when the first code is already in use', () => {
    const taken = new Set(['rmdan-h7kp']);
    expect(pickUsername('rmdan', taken, codes('h7kp', 'q3mx'))).toBe('rmdan-q3mx');
  });

  test('keeps drawing until it finds one free', () => {
    const taken = new Set(['aly-aaaa', 'aly-bbbb', 'aly-cccc']);
    expect(pickUsername('aly', taken, codes('aaaa', 'bbbb', 'cccc', 'dddd'))).toBe('aly-dddd');
  });

  test('grows the code rather than giving up when a length is exhausted', () => {
    // Every 4-character draw collides; the 5-character one does not.
    const taken = new Set(['aly-aaaa']);
    const result = pickUsername('aly', taken, (length) => 'a'.repeat(length));
    expect(result).toBe('aly-aaaaa');
  });

  test('ignores usernames built on a different name', () => {
    expect(pickUsername('aly', new Set(['ahmd-h7kp']), codes('h7kp'))).toBe('aly-h7kp');
  });

  test('carries a short name over the three-character minimum', () => {
    expect(pickUsername('ly', new Set(), codes('h7kp'))).toBe('ly-h7kp');
    expect(pickUsername('ly', new Set(), codes('h7kp')).length).toBeGreaterThanOrEqual(3);
  });

  /*
    The property the whole scheme exists for: feed it every name it has already
    produced and it can never produce one of them again.
  */
  test('never returns a username already in use, over many draws on one name', () => {
    const taken = new Set<string>();
    for (let i = 0; i < 2000; i += 1) {
      const username = pickUsername('aly', taken);
      expect(taken.has(username)).toBe(false);
      taken.add(username);
    }
    expect(taken.size).toBe(2000);
  });
});
