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

export const DISH_TAG_DIVIDER_CLASS: Record<DishTag, string> = {
  cheap: 'border-planner-tag-cheap',
  portable: 'border-planner-tag-portable',
  quick: 'border-planner-tag-quick',
  vegetarian: 'border-planner-tag-vegetarian',
  high_protein: 'border-planner-tag-high-protein',
  diabetic_friendly: 'border-planner-tag-diabetic-friendly',
};

export function dishTagDividerClass(tags: readonly string[]): string {
  const tag = primaryDishTag(tags);
  return tag ? DISH_TAG_DIVIDER_CLASS[tag] : 'border-border';
}
