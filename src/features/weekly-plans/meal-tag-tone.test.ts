import { describe, expect, test } from 'bun:test';

import { dishTagAccentClass, primaryDishTag } from './meal-tag-tone';

describe('meal tag tone', () => {
  test('uses the first recognised tag as the stable card divider', () => {
    expect(primaryDishTag(['legacy', 'quick', 'vegetarian'])).toBe('quick');
    expect(dishTagAccentClass(['legacy', 'quick', 'vegetarian'])).toBe(
      'bg-planner-tag-quick',
    );
  });

  test('falls back to the board divider for untagged dishes', () => {
    expect(primaryDishTag([])).toBeNull();
    expect(dishTagAccentClass(['legacy'])).toBe('bg-border');
  });
});
