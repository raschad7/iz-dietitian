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

export const DISH_TAG_ACCENT_CLASS: Record<DishTag, string> = {
  cheap: 'bg-planner-tag-cheap',
  portable: 'bg-planner-tag-portable',
  quick: 'bg-planner-tag-quick',
  vegetarian: 'bg-planner-tag-vegetarian',
  high_protein: 'bg-planner-tag-high-protein',
  diabetic_friendly: 'bg-planner-tag-diabetic-friendly',
};

export function dishTagAccentClass(tags: readonly string[]): string {
  const tag = primaryDishTag(tags);
  return tag ? DISH_TAG_ACCENT_CLASS[tag] : 'bg-border';
}
