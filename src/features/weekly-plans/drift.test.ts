import { describe, expect, test } from 'bun:test';

import { DAY_TOLERANCE, MEAL_TOLERANCE, driftState } from './drift';

describe('driftState', () => {
  test('says nothing while the value is inside the tolerance', () => {
    expect(driftState(2005, 2000, DAY_TOLERANCE)).toBeNull();
    expect(driftState(1900, 2000, DAY_TOLERANCE)).toBeNull();
  });

  test('marks a value above the tolerance as over', () => {
    expect(driftState(2380, 2000, DAY_TOLERANCE)).toBe('over');
    expect(driftState(870, 700, MEAL_TOLERANCE)).toBe('over');
  });

  test('marks a value below the tolerance as under', () => {
    expect(driftState(1600, 2000, DAY_TOLERANCE)).toBe('under');
    expect(driftState(520, 700, MEAL_TOLERANCE)).toBe('under');
  });

  // The boundary is the case a hardcoded `>` or `>=` gets wrong, and the one a
  // reader will hit constantly — a 10% day is exactly 2200 on a 2000 target.
  test('treats a value exactly on the tolerance as inside it', () => {
    expect(driftState(2200, 2000, DAY_TOLERANCE)).toBeNull();
    expect(driftState(1800, 2000, DAY_TOLERANCE)).toBeNull();
  });

  // A slot with no budget and a plan with no target both reach here. Neither is
  // a drift; there is nothing to drift from.
  test('says nothing when there is no target to compare against', () => {
    expect(driftState(500, 0, MEAL_TOLERANCE)).toBeNull();
    expect(driftState(500, -1, MEAL_TOLERANCE)).toBeNull();
  });
});
