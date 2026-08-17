import { primaryDishTag } from './meal-tag-tone';
import { DISH_TAGS, type DishTag } from './schema';

/**
 * The shape this needs from a board, and nothing more.
 *
 * Deliberately structural rather than `BoardDay`: the summary is arithmetic over
 * tags, and typing it against the full board would drag the whole query module
 * into a pure function — and into its test — for two fields.
 */
export type TaggedDays = readonly {
  readonly meals: readonly { readonly dish: { readonly tags: string[] } | null }[];
}[];

export type TagColorSummary = {
  /** The tags on this board, in `DISH_TAGS` order, with how many meals wear each. */
  rows: { tag: DishTag; count: number }[];
  /** Filled meals whose dish carries no recognised tag — the grey rules. */
  untagged: number;
};

/**
 * Which colours a board actually shows, and how often.
 *
 * Counts the **primary** tag of each filled meal — the one `primaryDishTag`
 * picks and the meal card paints its rule with — so the summary describes the
 * marks on screen rather than every tag every dish happens to carry. A dish
 * tagged both `quick` and `local` draws one rule, and it is counted once, under
 * the tag that rule is coloured for.
 *
 * Unfilled slots are skipped: they have no dish and therefore no mark.
 */
export function summariseTagColors(days: TaggedDays): TagColorSummary {
  const counts = new Map<DishTag, number>();
  let untagged = 0;

  for (const day of days) {
    for (const meal of day.meals) {
      if (!meal.dish) continue;

      const tag = primaryDishTag(meal.dish.tags);
      if (tag === null) untagged += 1;
      else counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  // Catalog order, so the key reads in the same sequence as every tag list in
  // the app and two boards never order their key differently.
  const rows = DISH_TAGS.filter((tag) => counts.has(tag)).map((tag) => ({
    tag,
    count: counts.get(tag) ?? 0,
  }));

  return { rows, untagged };
}
