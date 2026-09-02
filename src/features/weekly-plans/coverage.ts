/**
 * Whether the catalog can actually plan a week, and where it cannot.
 *
 * A client was once prescribed a guava as a 218 kcal snack. Nothing was wrong
 * with the code: the 200–300 kcal snack band was empty, and the generator picked
 * the closest thing that existed. That failure is invisible from inside a plan —
 * it looks like a bad choice rather than a missing option — so it gets measured
 * here instead of noticed later.
 *
 * The grid is the answer to "is the catalog finished". Not a dish count, which
 * can be large and still leave a slot with nothing in its budget band; not a
 * feeling. See `docs/catalog.md`.
 *
 * Everything here reads the committed datasets, so it runs without a database and
 * cannot disagree with what a correct seed would produce.
 */

import { carbBase, proteinSource } from './dish-composition';
import type { DishIngredientDetail } from './nutrition';
import { DISH_COSTS, DISH_EFFORTS, DISH_OCCASIONS, DISH_SOURCES } from './schema';

/**
 * The energy bands each slot has to be stocked across.
 *
 * Chosen to span the clients this clinic actually plans for — roughly 1,400 to
 * 2,800 kcal a day — so that a slot's budget lands inside a band whatever the
 * target. A dish is counted in the band its **base serving** falls in; the
 * multiplier can carry it a little either way, which is why the bands touch
 * rather than overlap.
 */
export const SLOT_BANDS: Record<string, readonly (readonly [number, number])[]> = {
  breakfast: [
    [250, 400],
    [400, 550],
    [550, 700],
  ],
  snack: [
    [100, 200],
    [200, 300],
    [300, 400],
  ],
  lunch: [
    [450, 650],
    [650, 850],
    [850, 1050],
  ],
  dinner: [
    [300, 450],
    [450, 650],
    [650, 850],
  ],
};

/**
 * How many dishes a cell needs before a week can avoid repeating itself.
 *
 * Twelve, because a client is planned for many weeks in a row and
 * `MAX_WEEK_USES` allows a dish three times in one of them. Fewer than a dozen in
 * a cell and the same plate returns every fortnight whatever the variety rules
 * do.
 */
export const MIN_PER_CELL = 12;

/** Every slot that takes a protein needs a few of each, or a day cannot be filled. */
export const MIN_PER_PROTEIN = 3;

/**
 * How many dishes in a slot must be obtainable without cooking.
 *
 * A client who buys lunch near work is not a special case, and a slot where every
 * option is home-cooked cannot be planned for them at all.
 */
export const MIN_AWAY_FROM_HOME = 8;

/** The slots that must offer something a client can buy rather than cook. */
export const AWAY_SLOTS = ['breakfast', 'snack', 'lunch'] as const;

/**
 * A tag on almost everything, or almost nothing, is not a filter.
 *
 * `local` sat on 16 of 113 dishes in a catalog written for Palestine, and
 * `vegetarian` on 64 — one said nothing because it was rare, the other because it
 * was the majority. Both passed every check that existed at the time.
 */
export const DEAD_VALUE_FLOOR = 0.05;
export const DEAD_VALUE_CEILING = 0.6;

/** What the grid needs to know about one dish. */
export type CoverageDish = {
  slug: string;
  mealTypes: readonly string[];
  source: string;
  effort: string;
  cost: string;
  occasion: string;
  isSide: boolean;
  baseKcal: number;
  recipe: readonly DishIngredientDetail[];
};

export type CoverageCell = {
  slot: string;
  band: readonly [number, number];
  count: number;
  short: number;
};

export type ProteinGap = { slot: string; proteinSource: string; count: number };
export type AwayGap = { slot: string; count: number };
export type AxisSpread = { axis: string; value: string; count: number; share: number };

export type CoverageReport = {
  /** Mains only. A side is not a meal and is never counted toward a slot. */
  dishes: number;
  sides: number;
  cells: CoverageCell[];
  /** The cells still short, worst first — the actual worklist. */
  gaps: CoverageCell[];
  proteinGaps: ProteinGap[];
  awayGaps: AwayGap[];
  /** Axis values sitting on too few or too many dishes to filter anything. */
  deadValues: AxisSpread[];
  /** True when every cell and every floor is met. */
  complete: boolean;
};

const AXES = [
  ['source', DISH_SOURCES],
  ['effort', DISH_EFFORTS],
  ['cost', DISH_COSTS],
  ['occasion', DISH_OCCASIONS],
] as const;

/** The protein sources a slot is expected to stock. `none` is not one of them. */
const PROTEINS = ['red_meat', 'poultry', 'fish', 'egg', 'dairy', 'legume'] as const;

/** Snacks are allowed to have no protein source at all — an apple is a snack. */
const PROTEIN_SLOTS = ['breakfast', 'lunch', 'dinner'] as const;

function inBand(kcal: number, [low, high]: readonly [number, number]): boolean {
  return kcal >= low && kcal < high;
}

/**
 * The catalog measured against the grid.
 *
 * Counts mains only, and counts a dish once per slot it claims: a dish that suits
 * both lunch and dinner genuinely fills a hole in both, because the client eats
 * it at one of them and the other still has it available.
 */
export function coverage(catalog: readonly CoverageDish[]): CoverageReport {
  const mains = catalog.filter((dish) => !dish.isSide);
  const cells: CoverageCell[] = [];

  for (const [slot, bands] of Object.entries(SLOT_BANDS)) {
    for (const band of bands) {
      const count = mains.filter(
        (dish) => dish.mealTypes.includes(slot) && inBand(dish.baseKcal, band),
      ).length;

      cells.push({ slot, band, count, short: Math.max(0, MIN_PER_CELL - count) });
    }
  }

  const proteinGaps: ProteinGap[] = [];
  for (const slot of PROTEIN_SLOTS) {
    const inSlot = mains.filter((dish) => dish.mealTypes.includes(slot));

    for (const protein of PROTEINS) {
      const count = inSlot.filter((dish) => proteinSource(dish.recipe) === protein).length;
      if (count < MIN_PER_PROTEIN) proteinGaps.push({ slot, proteinSource: protein, count });
    }
  }

  const awayGaps: AwayGap[] = [];
  for (const slot of AWAY_SLOTS) {
    const count = mains.filter(
      (dish) => dish.mealTypes.includes(slot) && dish.source !== 'home',
    ).length;

    if (count < MIN_AWAY_FROM_HOME) awayGaps.push({ slot, count });
  }

  return {
    dishes: mains.length,
    sides: catalog.length - mains.length,
    cells,
    gaps: cells.filter((cell) => cell.short > 0).sort((a, b) => b.short - a.short),
    proteinGaps,
    awayGaps,
    deadValues: deadAxisValues(mains),
    complete:
      cells.every((cell) => cell.short === 0) && proteinGaps.length === 0 && awayGaps.length === 0,
  };
}

/**
 * Axis values that cannot narrow anything.
 *
 * Reported rather than failed while the catalog is being grown: `source` is
 * almost entirely `home` until the street food exists, and that is a statement of
 * work remaining, not a defect.
 */
export function deadAxisValues(mains: readonly CoverageDish[]): AxisSpread[] {
  if (!mains.length) return [];

  const spread: AxisSpread[] = [];

  for (const [axis, values] of AXES) {
    for (const value of values) {
      const count = mains.filter((dish) => dish[axis] === value).length;
      const share = count / mains.length;

      if (share < DEAD_VALUE_FLOOR || share > DEAD_VALUE_CEILING) {
        spread.push({ axis, value, count, share });
      }
    }
  }

  return spread;
}

/** The report as a person reads it — one block per slot, then the floors. */
export function formatCoverage(report: CoverageReport): string {
  const out: string[] = [];

  out.push(`${report.dishes} mains, ${report.sides} sides`);

  for (const [slot, bands] of Object.entries(SLOT_BANDS)) {
    const row = bands.map((band) => {
      const cell = report.cells.find(
        (one) => one.slot === slot && one.band[0] === band[0] && one.band[1] === band[1],
      );

      const count = cell?.count ?? 0;
      return `${band[0]}-${band[1]}: ${String(count).padStart(2)}${count < MIN_PER_CELL ? ' *' : '  '}`;
    });

    out.push(`  ${slot.padEnd(10)} ${row.join('   ')}`);
  }

  if (report.gaps.length) {
    out.push(`  ${report.gaps.length} cell(s) below ${MIN_PER_CELL} — marked *`);
  }

  for (const gap of report.awayGaps) {
    out.push(
      `  ${gap.slot}: ${gap.count} dish(es) a client can buy rather than cook, wants ${MIN_AWAY_FROM_HOME}`,
    );
  }

  const proteins = new Map<string, string[]>();
  for (const gap of report.proteinGaps) {
    proteins.set(gap.slot, [...(proteins.get(gap.slot) ?? []), `${gap.proteinSource}=${gap.count}`]);
  }
  for (const [slot, list] of proteins) {
    out.push(`  ${slot}: thin on ${list.join(', ')} (wants ${MIN_PER_PROTEIN} each)`);
  }

  for (const value of report.deadValues) {
    out.push(
      `  ${value.axis}=${value.value} sits on ${value.count} dish(es) (${Math.round(value.share * 100)}%) — filters nothing`,
    );
  }

  return out.join('\n');
}

/** Re-exported so a caller reporting variety does not import two modules. */
export { carbBase, proteinSource };
