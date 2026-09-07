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

/** As USDA publishes them, including the ounce that used to become a حبة. */
const ALMONDS = [
  { grams: 143, label: '1 cup, whole' },
  { grams: 92, label: '1 cup, sliced' },
  { grams: 28.4, label: '1 oz (23 whole kernels)' },
  { grams: 1.2, label: '1 almond' },
];

const HAZELNUTS = [
  { grams: 115, label: '1 cup, chopped' },
  { grams: 28.4, label: '1 oz (21 whole kernels)' },
  { grams: 14, label: '10 nuts' },
];

const PINE_NUTS = [
  { grams: 135, label: '1 cup' },
  { grams: 28.4, label: '1 oz (167 kernels)' },
  { grams: 1.7, label: '10 nuts' },
];

const GRAPES = [
  { grams: 151, label: '1 cup' },
  { grams: 49, label: '10 grapes' },
];

const OLIVES = [{ grams: 2.7, label: '1 olive' }];

function labels(
  portions: readonly { grams: number; label: string }[],
  category = 'fruits',
  nameEn = '',
) {
  return derivePortions({ category, nameEn, portions }).map(
    (row) => [row.labelEn, row.grams] as const,
  );
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

/**
 * The second bug of the same family, and the one the clinic reported.
 *
 * A plan said **لوز ١ حبة** and meant 28.4 grams — twenty-three almonds — because
 * USDA writes the ounce as `1 oz (23 whole kernels)` and the word scan found
 * `whole` in it. The number was right for an ounce and the word was wrong, which
 * is the watermelon failure exactly, arrived at from the other direction: there
 * the unit was too big for the word, here the word was too small for the unit.
 *
 * The dietitian's own sentence for it: nuts are counted, not weighed.
 */
describe('nuts are counted, and an ounce is not one of them', () => {
  test('an ounce described as kernels is an ounce, not a piece', () => {
    const rows = labels(ALMONDS, 'nuts_seeds', 'Almonds');

    expect(rows).not.toContainEqual(['Piece', 28.4]);
  });

  test('one almond is the piece, and the food starts in it', () => {
    const rows = labels(ALMONDS, 'nuts_seeds', 'Almonds');

    expect(rows[0]).toEqual(['Piece', 1.2]);
    expect(rows).toContainEqual(['Cup', 143]);
  });

  /* USDA gives no single hazelnut, only the handful — which is still a count. */
  test('ten nuts is ten of one thing, so the thing is 1.4 g', () => {
    expect(labels(HAZELNUTS, 'nuts_seeds', 'Hazelnuts')[0]).toEqual(['Piece', 1.4]);
  });

  /*
   * A pine nut is 0.17 g. `30 حبة صنوبر` is an instruction to count out thirty
   * pine nuts for five grams of food, which is not how anybody serves them.
   */
  test('a piece too light to count is refused, and the cup is kept', () => {
    const rows = labels(PINE_NUTS, 'nuts_seeds', 'Pine nuts');

    expect(rows.map(([label]) => label)).not.toContain('Piece');
    expect(rows[0]).toEqual(['Cup', 135]);
  });

  test('one olive is a piece — the same rule, on a food nobody weighs', () => {
    expect(labels(OLIVES, 'prepared', 'Olives, pickled')[0]).toEqual(['Piece', 2.7]);
  });

  /*
   * The restriction that keeps the name rule honest. `10 grapes = 49 g` is a
   * weight for a handful — the ten is there because one grape is too small to
   * publish — and reading it as a unit would put حبة عنب on a plan next to حبة
   * بطيخ meaning a melon ball.
   */
  test('a label counting ten of the food is a handful, not a unit', () => {
    const rows = labels(GRAPES, 'fruits', 'Grapes');

    expect(rows.map(([label]) => label)).not.toContain('Piece');
    expect(rows[0]).toEqual(['Cup', 151]);
  });
});
