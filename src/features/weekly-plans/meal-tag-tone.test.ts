import { describe, expect, test } from 'bun:test';

import {
  DISH_TAG_ACCENT_CLASS,
  HIGH_PROTEIN_ACCENT_CLASS,
  dishTagAccentClass,
  primaryDishTag,
} from './meal-tag-tone';
import { DISH_TAGS } from './schema';
import { membersOf } from '@/lib/enum';

describe('meal tag tone', () => {
  /*
   * The catalog prints one dot per tag and the planner paints one rule per meal
   * from the same map, so two tags sharing a class is not a cosmetic slip — it
   * is a legend that silently lies on both screens. Cheap to assert, and it is
   * the thing a future tag added to `DISH_TAGS` is most likely to break.
   */
  test('every tag, and the computed high-protein label, has its own colour', () => {
    const classes = [...DISH_TAGS.map((tag) => DISH_TAG_ACCENT_CLASS[tag]), HIGH_PROTEIN_ACCENT_CLASS];

    expect(classes.every(Boolean)).toBe(true);
    expect(new Set(classes).size).toBe(classes.length);
  });

  test('uses the first recognised tag as the stable card divider', () => {
    expect(primaryDishTag(['legacy', 'quick', 'vegetarian'])).toBe('quick');
    expect(dishTagAccentClass(['legacy', 'quick', 'vegetarian'])).toBe(
      'bg-planner-tag-quick',
    );
  });

  /*
   * The regression that broke the colour link between the catalog and the board:
   * everything that *lists* a dish's tags runs them through
   * `membersOf(DISH_TAGS, …)` and so shows them in catalog order, but the meal
   * card used to take the first tag as *stored*. A dish saved `['local',
   * 'filling']` therefore led with lime in the catalog and painted clay on the
   * board. The priority has to come from `DISH_TAGS`, never from the array.
   */
  test('priority comes from DISH_TAGS, not from how the dish stored its tags', () => {
    expect(primaryDishTag(['local', 'filling'])).toBe('filling');
    expect(primaryDishTag(['filling', 'local'])).toBe('filling');
    // Whatever the storage order, the winner is the tag a tag list shows first.
    for (const stored of [['vegetarian', 'quick'], ['quick', 'vegetarian']]) {
      expect(primaryDishTag(stored)).toBe(membersOf(DISH_TAGS, stored)[0] ?? null);
    }
  });

  test('falls back to the board divider for untagged dishes', () => {
    expect(primaryDishTag([])).toBeNull();
    expect(dishTagAccentClass(['legacy'])).toBe('bg-border');
  });
});
