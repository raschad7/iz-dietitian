import { describe, expect, test } from 'bun:test';

import { calculateAge } from './age';

const TODAY = new Date(2026, 6, 28); // 2026-07-28, local time

describe('calculateAge', () => {
  test('counts a birthday already passed this year', () => {
    expect(calculateAge('1990-06-15', TODAY)).toBe(36);
  });

  test('does not count a birthday still ahead this year', () => {
    expect(calculateAge('1990-08-15', TODAY)).toBe(35);
  });

  test('counts the birthday itself', () => {
    expect(calculateAge('1990-07-28', TODAY)).toBe(36);
  });

  test('returns 0 for an infant born this year', () => {
    expect(calculateAge('2026-01-10', TODAY)).toBe(0);
  });

  test('returns null for a malformed date', () => {
    expect(calculateAge('15/06/1990', TODAY)).toBeNull();
    expect(calculateAge('', TODAY)).toBeNull();
  });

  test('returns null for an implausible age', () => {
    expect(calculateAge('1800-01-01', TODAY)).toBeNull();
    expect(calculateAge('2030-01-01', TODAY)).toBeNull();
  });
});
