import { PROTEIN_SOURCES, proteinSource, type ProteinSource } from './dish-composition';
import type { DishIngredientDetail } from './nutrition';

/**
 * What a colour means in the planner, in one table.
 *
 * **It means the dish's protein source, and nothing else.** The meal card's top
 * rule, the dot beside a name in the catalog, the board's colour key and the
 * catalog's protein filter all come through here, so a hue learned on one screen
 * is the same fact on every other.
 *
 * ## Why protein, after two previous answers
 *
 * The colour came from `tags` first, where a dish carried several and one
 * divider had to explain them all — resolved by catalog order, with a long
 * comment about why the first tag *as stored* was the wrong answer. Then from
 * `source`, which at least gave every dish exactly one value.
 *
 * `source` was still the wrong fact to spend a palette on. 82% of the catalog is
 * `home`, so the board came out thirty-five cards in one colour: not a legend, a
 * background. And the question it answered — did they cook this or buy it — is
 * one a dietitian asks about a *plan*, once, not about each of thirty-five cards.
 *
 * Protein source is the fact that earns it:
 *
 * - **Computed, never typed.** `proteinSource()` reads the recipe, so a colour
 *   cannot disagree with the food and cannot go stale when the recipe changes.
 *   Same law as the nutrition label.
 * - **Exactly one, always.** There is never a question of which of a dish's
 *   labels to paint, because it has one. `none` is an answer, so no card is left
 *   uncoloured.
 * - **It is what a week is read for.** Chicken three days running is the thing a
 *   dietitian scans a board to catch, and nothing else on the board says it.
 * - **It spreads.** The eight values run 55 / 48 / 42 / 34 / 31 / 24 / 22 / 21
 *   across the catalog, so a week is a mix rather than a monotone.
 *
 * `source`, `effort`, `cost` and `occasion` keep their place in the catalog as
 * words. They read perfectly well as words; only one of them was ever coloured,
 * which is the inconsistency this removes.
 */
export const PROTEIN_ACCENT_CLASS: Record<ProteinSource, string> = {
  red_meat: 'bg-planner-protein-red-meat',
  poultry: 'bg-planner-protein-poultry',
  fish: 'bg-planner-protein-fish',
  egg: 'bg-planner-protein-egg',
  dairy: 'bg-planner-protein-dairy',
  legume: 'bg-planner-protein-legume',
  nuts: 'bg-planner-protein-nuts',
  none: 'bg-planner-protein-none',
};

/**
 * The rule a meal card paints.
 *
 * Takes a plain `string` because that is how a protein source arrives from a
 * board row that computed it — anything unrecognised falls to the neutral mark
 * rather than to no mark at all.
 */
export function proteinAccentClass(source: string): string {
  return PROTEIN_ACCENT_CLASS[source as ProteinSource] ?? 'bg-planner-protein-none';
}

/**
 * The full class run for a protein dot: the fill above, plus the geometry and the
 * hairline that makes it survive being 8px.
 *
 * The ring is not decoration. `--planner-protein-egg` is `flame-300`, a light
 * orange — as a 3px rule across a meal card it reads fine, but as a dot on a
 * near-white chip it dissolves. A faint inset ring gives every dot an edge
 * without touching a single hue, so the colour a dietitian learns in the catalog
 * is still exactly the colour the plan paints. `--foreground` rather than black,
 * so the ring flips with the theme.
 */
export function proteinDotClasses(source: string): string {
  return `size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-foreground/15 ${proteinAccentClass(source)}`;
}

/** Every protein source, in legend order. */
export const PROTEIN_LEGEND = PROTEIN_SOURCES;

/**
 * A dish's colour, straight from its recipe.
 *
 * The one entry point for anything holding a whole dish rather than a computed
 * label, so no caller has to remember to run `proteinSource` first — and none of
 * them can run it on the wrong thing.
 */
export function dishAccentClass(recipe: readonly DishIngredientDetail[]): string {
  return proteinAccentClass(proteinSource(recipe));
}

/** The same, as a dot. */
export function dishDotClasses(recipe: readonly DishIngredientDetail[]): string {
  return proteinDotClasses(proteinSource(recipe));
}

/**
 * A protein source's message key, as a literal.
 *
 * next-intl only accepts keys it can see, and `t(`proteinSources.${value}`)` on a
 * plain `string` widens to every key that could ever be written — which is not a
 * key at all. This narrows once, here, so every surface naming a protein source
 * does it the same way and an unrecognised value reads as "no main protein"
 * rather than throwing at render.
 *
 * The same guard `axisMessageKey` applies to the four axes, for the same reason.
 */
export type ProteinMessageKey = `proteinSources.${ProteinSource}`;

export function proteinMessageKey(value: string): ProteinMessageKey {
  const known = PROTEIN_SOURCES.find((one) => one === value) ?? 'none';
  return `proteinSources.${known}`;
}
