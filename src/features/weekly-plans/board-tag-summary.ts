import { DISH_SOURCES, type DishSource } from './schema';

/**
 * The shape this needs from a board, and nothing more.
 *
 * Deliberately structural rather than `BoardDay`: the summary is arithmetic over
 * one field, and typing it against the full board would drag the whole query
 * module into a pure function — and into its test — for two properties.
 */
export type TaggedDays = readonly {
  readonly meals: readonly { readonly dish: { readonly source: string } | null }[];
}[];

export type TagColorSummary = {
  /** The sources on this board, in offer order, with how many meals wear each. */
  rows: { tag: DishSource; count: number }[];
  /** Filled meals whose dish carries no recognised source — the grey rules. */
  untagged: number;
};

/**
 * Which colours a board actually shows, and how often.
 *
 * Counts each filled meal's `source` — the axis the meal card paints its rule
 * with. It used to count a dish's "primary tag", chosen from a bag by catalog
 * order, and the long comment explaining that choice was the tag bag's problem
 * rather than the colour's: a dish has exactly one source, so there is nothing
 * to resolve.
 *
 * It also answers a question a dietitian has: **how much of this week is this
 * client cooking, and how much are they buying.** The old summary answered "how
 * many of these dishes did someone type `quick` on".
 *
 * Unfilled slots are skipped: they have no dish and therefore no mark.
 */
export function summariseTagColors(days: TaggedDays): TagColorSummary {
  const counts = new Map<DishSource, number>();
  let untagged = 0;

  for (const day of days) {
    for (const meal of day.meals) {
      if (!meal.dish) continue;

      const source = meal.dish.source as DishSource;
      if (!DISH_SOURCES.includes(source)) untagged += 1;
      else counts.set(source, (counts.get(source) ?? 0) + 1);
    }
  }

  // Offer order, so the key reads in the same sequence as every filter in the
  // app and two boards never order their key differently.
  const rows = DISH_SOURCES.filter((source) => counts.has(source)).map((source) => ({
    tag: source,
    count: counts.get(source) ?? 0,
  }));

  return { rows, untagged };
}
