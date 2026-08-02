import { describe, expect, test } from 'bun:test';

import { summariseDemographics } from './demographics';

/**
 * Pure — no database. The rules worth pinning are the edges: a birthday that
 * has not happened yet this year, the boundary between two bands, and the two
 * ways a value can be missing.
 */

const TODAY = new Date('2026-08-02T12:00:00Z');

function countOf(slices: { key: string; count: number }[], key: string): number {
  return slices.find((slice) => slice.key === key)?.count ?? 0;
}

describe('summariseDemographics', () => {
  test('buckets an age by the band it is in today, not by birth year', () => {
    const result = summariseDemographics(
      [
        // Turns 30 tomorrow — still 29 today, so still the younger band.
        { dateOfBirth: '1996-08-03', sex: 'female' },
        // Turned 30 yesterday.
        { dateOfBirth: '1996-08-01', sex: 'female' },
      ],
      TODAY,
    );

    expect(countOf(result.age, 'age18to29')).toBe(1);
    expect(countOf(result.age, 'age30to44')).toBe(1);
  });

  test('keeps missing and unparseable values as "not recorded" rather than dropping them', () => {
    const result = summariseDemographics(
      [
        { dateOfBirth: null, sex: null },
        { dateOfBirth: 'not-a-date', sex: 'other' },
        { dateOfBirth: '1990-01-01', sex: 'male' },
      ],
      TODAY,
    );

    expect(result.total).toBe(3);
    expect(countOf(result.age, 'unknown')).toBe(2);
    expect(countOf(result.sex, 'unknown')).toBe(2);
    // The denominator is the whole register, so the shares still add to 1.
    expect(result.sex.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(1);
  });

  test('drops the "not recorded" bucket only when it is empty', () => {
    const complete = summariseDemographics([{ dateOfBirth: '1990-01-01', sex: 'male' }], TODAY);

    expect(complete.age.some((slice) => slice.key === 'unknown')).toBe(false);
    expect(complete.sex.some((slice) => slice.key === 'unknown')).toBe(false);
    // Empty *bands*, though, are kept — a gap in an ordered scale is information.
    expect(complete.age).toHaveLength(5);
  });

  test('an empty register has no shares to divide', () => {
    const result = summariseDemographics([], TODAY);

    expect(result.total).toBe(0);
    expect(result.age.every((slice) => slice.share === 0)).toBe(true);
  });
});
