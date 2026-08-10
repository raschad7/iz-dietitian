import { describe, expect, test } from 'bun:test';

import { dishTagDividerClass, primaryDishTag } from './meal-tag-tone';

describe('meal tag tone', () => {
  test('uses the first recognised tag as the stable card divider', () => {
    expect(primaryDishTag(['legacy', 'quick', 'vegetarian'])).toBe('quick');
    expect(dishTagDividerClass(['legacy', 'quick', 'vegetarian'])).toBe(
      'border-planner-tag-quick',
    );
  });

  test('falls back to the board divider for untagged dishes', () => {
    expect(primaryDishTag([])).toBeNull();
    expect(dishTagDividerClass(['legacy'])).toBe('border-border');
  });
});
