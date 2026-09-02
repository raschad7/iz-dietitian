import { describe, expect, test } from 'bun:test';

import { classifyUnit, derivePortions, parsePortionLabel } from './portion-derivation';

/** The measures as USDA publishes them, so the fixture is the real input. */
const WATERMELON = [
  { grams: 154, label: '1 cup, balls' },
  { grams: 152, label: '1 cup, diced' },
  { grams: 4518, label: '1 melon (15" long x 7-1/2" dia)' },
  { grams: 286, label: '1 wedge (approx 1/16 of melon)' },
  { grams: 280, label: '1 NLEA serving' },
];

const CANTALOUPE = [
  { grams: 177, label: '1 cup, balls' },
  { grams: 814, label: '1 melon, large (about 6-1/2" dia)' },
  { grams: 552, label: '1 melon, medium (about 5" dia)' },
  { grams: 69, label: '1 wedge, medium (1/8 of medium melon)' },
];

const CAULIFLOWER = [
  { grams: 107, label: '1 cup chopped (1/2" pieces)' },
  { grams: 840, label: '1 head large (6-7" dia.)' },
  { grams: 588, label: '1 head medium (5-6" dia.)' },
  { grams: 265, label: '1 head small (4" dia.)' },
];

const LEMON_JUICE = [
  { grams: 244, label: '1 cup' },
  { grams: 48, label: '1 lemon yields' },
  { grams: 5.9, label: '1 wedge yields' },
];

const CANNED_CORN = [
  { grams: 164, label: '1 cup' },
  { grams: 211, label: '1 can (12 oz) yields' },
];

const APPLE = [
  { grams: 182, label: '1 medium (3" dia)' },
  { grams: 109, label: '1 cup, quartered or chopped' },
];

const MANGO = [
  { grams: 165, label: '1 cup pieces' },
  { grams: 336, label: '1 fruit without refuse' },
];

function labels(portions: readonly { grams: number; label: string }[], category = 'fruits') {
  return derivePortions({ category, portions }).map((row) => [row.labelEn, row.grams] as const);
}

/**
 * The bug this suite exists for.
 *
 * A generated plan said **بطيخ 1 حبة**, and the client reading it had been told
 * to eat a watermelon. The weight was right — 286 g, USDA's own figure — and the
 * *word* was wrong, which is the worse failure of the two, because the number
 * looks correct to anyone checking the arithmetic.
 */
describe('a piece is something one person eats', () => {
  test('a wedge is a slice, not a piece — the watermelon case', () => {
    expect(classifyUnit('wedge')).toBe('slice');
    expect(labels(WATERMELON)).toEqual([
      ['Slice', 286],
      ['Cup', 154],
      ['Half cup', 77],
      ['Quarter cup', 38.5],
    ]);
  });

  /*
   * "1 melon, medium" reads as countable to `classifyPortion` because of the word
   * `medium`, so a whole cantaloupe became one حبة at 552 g. A melon is a
   * purchase; the serving is the wedge or the cup.
   */
  test('a whole melon is a purchase, and never the unit offered', () => {
    const rows = labels(CANTALOUPE);

    expect(rows.map(([label]) => label)).not.toContain('Piece');
    expect(rows[0]).toEqual(['Slice', 69]);
  });

  test('a whole head of cauliflower is a purchase too', () => {
    const rows = labels(CAULIFLOWER, 'vegetables');

    expect(rows.map(([label]) => label)).not.toContain('Piece');
    expect(rows[0]).toEqual(['Cup', 107]);
  });

  /*
   * The ceiling is on the piece family alone, and it is set just above the
   * heaviest thing anyone genuinely eats whole in this catalog.
   */
  test('a mango is still one piece; nothing under the ceiling is lost', () => {
    expect(labels(MANGO)[0]).toEqual(['Piece', 336]);
    expect(labels(APPLE)[0]).toEqual(['Piece', 182]);
  });
});

describe('a measure that describes something other than a serving', () => {
  /*
   * "1 wedge yields 5.9 g" is the juice out of a lemon wedge. Read as a portion of
   * lemon juice it offers شريحة of a liquid, which is not a thing.
   */
  test('a countable unit that only *yields* the food is refused', () => {
    const rows = labels(LEMON_JUICE);

    expect(rows.map(([label]) => label)).not.toContain('Slice');
    expect(rows[0]).toEqual(['Cup', 244]);
  });

  /*
   * But a *container* that yields is the most useful number a canned food has:
   * 211 g is what comes out of a drained 12 oz tin, and علبة is what a dietitian
   * writes against it.
   */
  test('a container that yields is kept — it is the drained weight', () => {
    expect(labels(CANNED_CORN, 'prepared')).toContainEqual(['Container', 211]);
  });

  test('an NLEA serving is a label construct and never a portion', () => {
    expect(labels(WATERMELON).map(([label]) => label)).not.toContain('Container');
  });
});

describe('parsing a measured label', () => {
  test('reads the leading count and the unit word after it', () => {
    expect(parsePortionLabel('0.5 cup, diced')).toEqual({ amount: 0.5, unit: 'cup' });
    expect(parsePortionLabel('1 wedge (approx 1/16 of melon)')).toEqual({
      amount: 1,
      unit: 'wedge',
    });
  });

  test('a label with no leading count yields nothing', () => {
    expect(parsePortionLabel('cup')).toBeNull();
    expect(parsePortionLabel('')).toBeNull();
  });
});
