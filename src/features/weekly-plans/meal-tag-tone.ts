import { DISH_TAGS, type DishTag } from './schema';

/**
 * A dish can carry several tags, but one divider cannot explain several
 * colours. The **catalog order** is the stable priority: whichever of the dish's
 * tags comes first in `DISH_TAGS` wins, and an untagged or legacy dish keeps the
 * neutral divider.
 *
 * ⚠ Resolved through `DISH_TAGS`, not through the dish's own array. This read
 * `tags.find(...)` for a long time, which picked the first tag *as stored* — and
 * that is a different answer. A dish saved as `['local', 'filling']` listed
 * "مُشبِع، محلي" in the catalog, because everything that renders a tag list runs
 * it through `membersOf(DISH_TAGS, …)` and gets catalog order back, while the
 * meal card painted itself clay from `local`. So the first colour a dietitian
 * saw on the row and the colour of the card it became were two different tags,
 * and the connection the whole map exists for was quietly broken — by the
 * insertion order of an array nobody looks at.
 */
export function primaryDishTag(tags: readonly string[]): DishTag | null {
  const present = new Set(tags);
  return DISH_TAGS.find((tag) => present.has(tag)) ?? null;
}

/**
 * The colour every practical tag carries.
 *
 * `Record`, not `Partial<Record>` — total on purpose, and the type is what
 * enforces it. `easy_prep` and `no_cook` used to fall through to the neutral
 * divider because the warm palette had run out of hues; the three cool identity
 * stops in `globals.css` exist so they no longer have to, and a tag added to
 * `DISH_TAGS` without a colour is now a compile error rather than a silently
 * grey dot nobody notices until it is in front of a dietitian.
 */
export const DISH_TAG_ACCENT_CLASS: Record<DishTag, string> = {
  economical: 'bg-planner-tag-economical',
  quick: 'bg-planner-tag-quick',
  easy_prep: 'bg-planner-tag-easy-prep',
  no_cook: 'bg-planner-tag-no-cook',
  portable: 'bg-planner-tag-portable',
  filling: 'bg-planner-tag-filling',
  local: 'bg-planner-tag-local',
  vegetarian: 'bg-planner-tag-vegetarian',
};

/**
 * The computed high-protein label's colour.
 *
 * Kept out of the map above because it is not a `DishTag` and must never become
 * one: it is derived from the recipe by `nutritionCategory()`, so it cannot be
 * hand-set to disagree with the dish's own numbers. It reads as a tag in the
 * catalog because that is how a dietitian scans for it; it is simply not one
 * anybody typed, and the type system should keep saying so.
 */
export const HIGH_PROTEIN_ACCENT_CLASS = 'bg-planner-tag-high-protein';

export function dishTagAccentClass(tags: readonly string[]): string {
  const tag = primaryDishTag(tags);
  return (tag && DISH_TAG_ACCENT_CLASS[tag]) || 'bg-border';
}

/**
 * The fill for **one** named tag, rather than for a dish's winning tag.
 *
 * The catalog lists every tag a dish carries, each with its own dot, so it needs
 * the colour per tag; the meal card draws one rule and needs
 * `dishTagAccentClass` above. Same map behind both, which is the whole point —
 * the dot beside "سريع" in the catalog and the rule on top of a quick meal in
 * the plan are the same token, so recognising one teaches the other.
 */
export function dishTagDotClass(tag: DishTag): string {
  return DISH_TAG_ACCENT_CLASS[tag];
}

/**
 * The full class run for a tag dot: the fill above, plus the geometry and the
 * hairline that makes it survive being 8px.
 *
 * The ring is not decoration. `--planner-tag-quick` is `flame-500`, a light
 * yellow the design system reserves for graphic fills — as a 3px rule across a
 * meal card it reads fine, but as a dot on a near-white chip it dissolves. A
 * faint inset ring gives every dot an edge without touching a single hue, so the
 * colour a dietitian learns here is still exactly the colour the plan paints.
 * Darkening the pale ones instead would have been the easy fix and the wrong
 * one: it breaks the equivalence this whole map exists to guarantee.
 *
 * `--foreground` rather than black, so the ring flips with the theme: it has to
 * darken the edge of a pale dot on a light ground and lighten the edge of a deep
 * one on a dark ground, and a fixed black does only the first.
 */
export function dishTagDotClasses(tag: DishTag): string {
  return dotClasses(dishTagDotClass(tag));
}

/** The same dot, for the computed high-protein label. */
export function highProteinDotClasses(): string {
  return dotClasses(HIGH_PROTEIN_ACCENT_CLASS);
}

function dotClasses(fill: string): string {
  return `size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-foreground/15 ${fill}`;
}
