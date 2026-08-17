import { describe, expect, test } from 'bun:test';

import { joinName, splitName } from './name';

describe('joinName', () => {
  test('puts one space between the halves', () => {
    expect(joinName('أحمد', 'خليل')).toBe('أحمد خليل');
  });
});

describe('splitName', () => {
  test('round-trips a two-word name', () => {
    expect(splitName('أحمد خليل')).toEqual({ firstName: 'أحمد', lastName: 'خليل' });
  });

  /*
    The whole reason this is "first word / the rest" rather than "first word /
    last word": a last name of three words is ordinary in this roster, and
    taking only the final one would drop `عبد الرحمن` on the next save.
  */
  test('keeps a multi-word last name whole', () => {
    expect(splitName('أحمد عبد الرحمن الشريف')).toEqual({
      firstName: 'أحمد',
      lastName: 'عبد الرحمن الشريف',
    });
  });

  test('leaves the last name empty for a single-word record', () => {
    expect(splitName('أحمد')).toEqual({ firstName: 'أحمد', lastName: '' });
  });

  test('reads a missing name as two empty fields', () => {
    expect(splitName(null)).toEqual({ firstName: '', lastName: '' });
    expect(splitName('   ')).toEqual({ firstName: '', lastName: '' });
  });

  /*
    A name stored before the ten-character cap comes back in full, not clipped.
    The field shows all of it and the schema refuses the save, so shortening a
    patient's name stays a decision somebody makes deliberately.
  */
  test('does not truncate a stored name that predates the cap', () => {
    const long = 'عبد الرحمن الشريف';
    expect(splitName(`أحمد ${long}`).lastName).toBe(long);
  });
});
