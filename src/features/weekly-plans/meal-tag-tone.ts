import { DISH_SOURCES, type DishSource } from './schema';

/**
 * The colour a dish wears, and the axis it comes from.
 *
 * It used to come from `tags`, where a dish carried several and one divider had
 * to explain them all — resolved by catalog order, with a long comment about why
 * the first tag *as stored* was the wrong answer. That whole problem was the tag
 * bag's, not the colour's.
 *
 * `source` replaces it because a dish has exactly one, and because it is the
 * distinction worth seeing across a week at a glance: how much of this plan the
 * client is cooking and how much they are buying. The tokens are the ones the tag
 * map already used, so the palette on the board is unchanged.
 */
export const DISH_SOURCE_ACCENT_CLASS: Record<DishSource, string> = {
  home: 'bg-planner-tag-local',
  street: 'bg-planner-tag-portable',
  restaurant: 'bg-planner-tag-filling',
  shop: 'bg-planner-tag-economical',
};

/** The rule a meal card paints, from the dish's source. */
export function dishSourceAccentClass(source: string): string {
  return DISH_SOURCE_ACCENT_CLASS[source as DishSource] ?? 'bg-border';
}

/**
 * The full class run for a source dot: the fill above, plus the geometry and the
 * hairline that makes it survive being 8px.
 *
 * The ring is not decoration. `--planner-tag-quick` is `flame-500`, a light
 * yellow the design system reserves for graphic fills — as a 3px rule across a
 * meal card it reads fine, but as a dot on a near-white chip it dissolves. A
 * faint inset ring gives every dot an edge without touching a single hue, so the
 * colour a dietitian learns in the catalog is still exactly the colour the plan
 * paints. `--foreground` rather than black, so the ring flips with the theme.
 */
export function dishSourceDotClasses(source: string): string {
  return dotClasses(dishSourceAccentClass(source));
}

/** Every source, in offer order, for a legend. */
export const SOURCE_LEGEND = DISH_SOURCES;

export const HIGH_PROTEIN_ACCENT_CLASS = 'bg-planner-tag-high-protein';

/** The same dot, for the computed high-protein label. */
export function highProteinDotClasses(): string {
  return dotClasses(HIGH_PROTEIN_ACCENT_CLASS);
}

function dotClasses(fill: string): string {
  return `size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-foreground/15 ${fill}`;
}
