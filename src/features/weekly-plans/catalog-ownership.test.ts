import { describe, expect, test } from 'bun:test';

import { matchesOwner, parseOwnerFilter } from './catalog-ownership';

describe('parseOwnerFilter', () => {
  test('accepts the known filters', () => {
    expect(parseOwnerFilter('system')).toBe('system');
    expect(parseOwnerFilter('clinic')).toBe('clinic');
  });

  test('degrades an unknown or absent value to no filter', () => {
    expect(parseOwnerFilter('made_up')).toBeUndefined();
    expect(parseOwnerFilter(undefined)).toBeUndefined();
    expect(parseOwnerFilter('')).toBeUndefined();
  });
});

describe('matchesOwner', () => {
  const shared = null;
  const mine = 'clinic-1';

  test('no filter passes every dish', () => {
    expect(matchesOwner(shared, undefined)).toBe(true);
    expect(matchesOwner(mine, undefined)).toBe(true);
  });

  test('system keeps shared dishes only', () => {
    expect(matchesOwner(shared, 'system')).toBe(true);
    expect(matchesOwner(mine, 'system')).toBe(false);
  });

  test('clinic keeps owned dishes only', () => {
    expect(matchesOwner(mine, 'clinic')).toBe(true);
    expect(matchesOwner(shared, 'clinic')).toBe(false);
  });
});
