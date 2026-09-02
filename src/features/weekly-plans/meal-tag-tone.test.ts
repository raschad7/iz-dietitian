import { describe, expect, test } from 'bun:test';

import {
  DISH_SOURCE_ACCENT_CLASS,
  HIGH_PROTEIN_ACCENT_CLASS,
  dishSourceAccentClass,
  dishSourceDotClasses,
} from './meal-tag-tone';
import { DISH_SOURCES } from './schema';

describe('dish source tone', () => {
  /*
   * The catalog prints a dot per source and the planner paints one rule per meal
   * from the same map, so two sources sharing a class is not a cosmetic slip — it
   * is a legend that silently lies on both screens.
   */
  test('every source, and the computed high-protein label, has its own colour', () => {
    const classes = [
      ...DISH_SOURCES.map((source) => DISH_SOURCE_ACCENT_CLASS[source]),
      HIGH_PROTEIN_ACCENT_CLASS,
    ];

    expect(classes.every(Boolean)).toBe(true);
    expect(new Set(classes).size).toBe(classes.length);
  });

  /*
   * The regression the tag bag caused, and the reason `source` replaced it:
   * everything that *listed* a dish's tags ran them through
   * `membersOf(DISH_TAGS, …)` and showed catalog order, while the meal card took
   * the first tag *as stored*. A dish saved `['local', 'filling']` led with lime
   * in the catalog and painted clay on the board.
   *
   * A dish has exactly one source, so there is no order to disagree about. That
   * is the whole fix, and it is why this file no longer has a priority rule to
   * test.
   */
  test('the colour is the source itself, with nothing to resolve', () => {
    expect(dishSourceAccentClass('home')).toBe('bg-planner-tag-local');
    expect(dishSourceAccentClass('street')).toBe('bg-planner-tag-portable');
  });

  test('an unrecognised source falls back to the neutral divider', () => {
    // A clinic row written before the axes existed, or a value from a future
    // release. It draws grey rather than nothing.
    expect(dishSourceAccentClass('takeaway')).toBe('bg-border');
    expect(dishSourceAccentClass('')).toBe('bg-border');
  });

  test('a dot carries the fill plus the ring that makes it survive being 8px', () => {
    const dot = dishSourceDotClasses('home');

    expect(dot).toContain('bg-planner-tag-local');
    expect(dot).toContain('ring-inset');
  });
});
