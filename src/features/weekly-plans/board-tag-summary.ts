import { PROTEIN_SOURCES, proteinSource, type ProteinSource } from './dish-composition';
import type { DishIngredientDetail } from './nutrition';

/**
 * The shape this needs from a board, and nothing more.
 *
 * Deliberately structural rather than `BoardDay`: the summary is arithmetic over
 * one field, and typing it against the full board would drag the whole query
 * module into a pure function — and into its test — for two properties.
 *
 * The recipe rather than a stored label, because the colour it summarises is
 * computed from the recipe. Reading the same input as the card guarantees the key
 * and the board cannot disagree.
 */
export type TaggedDays = readonly {
  readonly meals: readonly {
    readonly dish: { readonly ingredients: readonly DishIngredientDetail[] } | null;
  }[];
}[];

export type TagColorSummary = {
  /** The protein sources on this board, in legend order, with how many meals wear each. */
  rows: { tag: ProteinSource; count: number }[];
  /**
   * Filled meals whose colour could not be resolved.
   *
   * Always zero in practice — `proteinSource` returns `none` rather than nothing,
   * and `none` is a row like any other. Kept because a meal with no dish is a
   * real state and the caller draws a grey rule for it; this is the count that
   * would explain such a rule if one ever appeared.
   */
  untagged: number;
};

/**
 * Which colours a board actually shows, and how often.
 *
 * Counts each filled meal's **protein source** — the same fact the meal card
 * paints its rule with, computed from the same recipe.
 *
 * This is the third answer to "what does the colour mean". It counted a dish's
 * "primary tag" chosen from a bag by catalog order, then its `source`. Both were
 * a legend; this one is a **reading**: "chicken 7, dairy 5, fish 2, legumes 4" is
 * the single most useful sentence anyone can say about a week of meals, and it is
 * exactly what a dietitian scans the board for. It costs nothing extra — the
 * counting is already done to know which rows to draw.
 *
 * Unfilled slots are skipped: they have no dish and therefore no mark.
 */
export function summariseTagColors(days: TaggedDays): TagColorSummary {
  const counts = new Map<ProteinSource, number>();
  let untagged = 0;

  for (const day of days) {
    for (const meal of day.meals) {
      if (!meal.dish) continue;

      const source = proteinSource(meal.dish.ingredients);
      if (!PROTEIN_SOURCES.includes(source)) untagged += 1;
      else counts.set(source, (counts.get(source) ?? 0) + 1);
    }
  }

  // Legend order, so the key reads in the same sequence as the catalog's filter
  // and two boards never order their key differently.
  const rows = PROTEIN_SOURCES.filter((source) => counts.has(source)).map((source) => ({
    tag: source,
    count: counts.get(source) ?? 0,
  }));

  return { rows, untagged };
}
