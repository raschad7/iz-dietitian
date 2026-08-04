import { describe, expect, test } from 'bun:test';

import { railTabsForPlan } from './rail-state';

describe('railTabsForPlan', () => {
  test('keeps every planner tab available before the first week is created', () => {
    expect(railTabsForPlan(false)).toEqual(['client', 'dishes', 'meal', 'past']);
  });

  test('keeps the same tab order once a plan exists', () => {
    expect(railTabsForPlan(true)).toEqual(['client', 'dishes', 'meal', 'past']);
  });
});
