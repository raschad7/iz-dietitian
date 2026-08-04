import { describe, expect, test } from 'bun:test';

import { newWeekMode } from './new-week';

describe('newWeekMode', () => {
  test('regenerates over a draft rather than leaving it behind', () => {
    expect(newWeekMode({ status: 'draft' })).toBe('regenerate');
  });

  test('creates a new week when the plan on screen is published', () => {
    expect(newWeekMode({ status: 'published' })).toBe('create');
  });

  test('creates a new week when there is no plan at all', () => {
    expect(newWeekMode(null)).toBe('create');
  });

  // Statuses are a text column; a value the enum does not know is not proof
  // that overwriting is safe.
  test('creates rather than overwrites on an unrecognised status', () => {
    expect(newWeekMode({ status: 'archived' })).toBe('create');
  });
});
