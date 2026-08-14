import type { IconName } from '@/components/ui/icon';

import { mealTypeForSlot, type MealType } from './schema';

/** Food-first glyph choices for a newly added meal row. */
export const MEAL_ICON_OPTIONS = [
  {
    id: 'tea',
    type: 'breakfast',
    icon: 'plannerMealBreakfast',
    slotPrefix: 'breakfast_tea',
  },
  {
    id: 'hotDrink',
    type: 'breakfast',
    icon: 'plannerMealHotDrink',
    slotPrefix: 'breakfast_hot_drink',
  },
  {
    id: 'snack',
    type: 'snack',
    icon: 'plannerMealSnack',
    slotPrefix: 'snack_donut',
  },
  {
    id: 'bottle',
    type: 'snack',
    icon: 'plannerMealBottle',
    slotPrefix: 'snack_bottle',
  },
  {
    id: 'chef',
    type: 'lunch',
    icon: 'plannerMealLunch',
    slotPrefix: 'lunch_chef',
  },
  {
    id: 'chefHeart',
    type: 'lunch',
    icon: 'plannerMealChefHeart',
    slotPrefix: 'lunch_heart',
  },
  {
    id: 'plate',
    type: 'dinner',
    icon: 'plannerMealDinner',
    slotPrefix: 'dinner_plate',
  },
  {
    id: 'chefMinimal',
    type: 'dinner',
    icon: 'plannerMealChefMinimal',
    slotPrefix: 'dinner_chef',
  },
] as const satisfies readonly {
  id: string;
  type: MealType;
  icon: IconName;
  slotPrefix: string;
}[];

const ICON_BY_TYPE = {
  breakfast: 'plannerMealBreakfast',
  snack: 'plannerMealSnack',
  lunch: 'plannerMealLunch',
  dinner: 'plannerMealDinner',
} as const satisfies Record<MealType, IconName>;

const ICONS_BY_PREFIX = [...MEAL_ICON_OPTIONS].sort(
  (a, b) => b.slotPrefix.length - a.slotPrefix.length,
);

export function mealIconForSlot(slotKey: string): IconName {
  const selected = ICONS_BY_PREFIX.find(
    ({ slotPrefix }) => slotKey === slotPrefix || slotKey.startsWith(`${slotPrefix}_`),
  );

  if (selected) return selected.icon;

  return ICON_BY_TYPE[mealTypeForSlot(slotKey)];
}
