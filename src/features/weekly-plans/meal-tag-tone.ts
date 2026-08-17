import { isMember } from '@/lib/enum';

import { DISH_TAGS, type DishTag } from './schema';

/**
 * A dish can carry several tags, but one divider cannot explain several
 * colours. The catalog order is the stable priority: the first recognised tag
 * wins, and an untagged or legacy dish keeps the neutral divider.
 */
export function primaryDishTag(tags: readonly string[]): DishTag | null {
  return tags.find((tag): tag is DishTag => isMember(DISH_TAGS, tag)) ?? null;
}

/**
 * A colour for the tags that carry one. Partial on purpose: the rarer practical
 * tags (`easy_prep`, `no_cook`) fall back to the neutral divider rather than
 * forcing a distinct hue the small palette does not have — the accent is a hint,
 * not a legend.
 */
export const DISH_TAG_ACCENT_CLASS: Partial<Record<DishTag, string>> = {
  economical: 'bg-planner-tag-economical',
  quick: 'bg-planner-tag-quick',
  portable: 'bg-planner-tag-portable',
  filling: 'bg-planner-tag-filling',
  local: 'bg-planner-tag-local',
  vegetarian: 'bg-planner-tag-vegetarian',
};

export function dishTagAccentClass(tags: readonly string[]): string {
  const tag = primaryDishTag(tags);
  return (tag && DISH_TAG_ACCENT_CLASS[tag]) || 'bg-border';
}
