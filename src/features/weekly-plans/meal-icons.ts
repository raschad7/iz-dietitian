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

/**
 * The meals a dietitian actually adds, with the glyph and the hour each one
 * comes with.
 *
 * The dialog asked for the row's name in a free-text box, which is the wrong
 * question in two ways: nearly every added row is one of eight things, and the
 * eight have obvious defaults for the other two fields as well — nobody puts
 * "قبل التمرين" at 07:30. Offering the eight turns three fields into one press,
 * and the free-text box is still there behind `custom` for the clinic that
 * calls its rows something else.
 *
 * `icon` names a `MEAL_ICON_OPTIONS` id, which is what carries the meal *type*
 * into the slot key — so choosing "غداء" here files the row as lunch without
 * anyone being asked what a lunch is. The labels are in the message catalogue;
 * a suggestion is a phrase in a language, not an identifier.
 */
export const MEAL_NAME_SUGGESTIONS = [
  { id: 'breakfast', icon: 'tea', time: '07:30' },
  { id: 'morningSnack', icon: 'snack', time: '10:30' },
  { id: 'lunch', icon: 'chef', time: '14:00' },
  { id: 'afternoonSnack', icon: 'snack', time: '17:00' },
  { id: 'dinner', icon: 'plate', time: '20:00' },
  { id: 'eveningSnack', icon: 'snack', time: '21:30' },
  { id: 'preWorkout', icon: 'bottle', time: '16:00' },
  { id: 'postWorkout', icon: 'bottle', time: '18:30' },
] as const satisfies readonly {
  id: string;
  icon: (typeof MEAL_ICON_OPTIONS)[number]['id'];
  time: string;
}[];

export type MealNameSuggestion = (typeof MEAL_NAME_SUGGESTIONS)[number];

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
