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
 * question in two ways: nearly every added row is one of a dozen things, and
 * each of those has an obvious answer to the other two fields as well — nobody
 * puts "قبل التمرين" at 07:30. Offering the list turns three fields into one
 * press. The free-text box that used to sit at the end of it is gone: a typed
 * name is the one entry that answers none of the other questions, and it was
 * the last row of a list long enough that reaching it took more work than
 * finding the name it was standing in for.
 *
 * `icon` names a `MEAL_ICON_OPTIONS` id, which is what carries the meal *type*
 * into the slot key — so choosing "غداء" here files the row as lunch without
 * anyone being asked what a lunch is. The labels are in the message catalogue;
 * a suggestion is a phrase in a language, not an identifier.
 */
/**
 * Every row a clinic is likely to add, in the order of the day rather than by
 * kind.
 *
 * Ordered by the hour each one carries, because that is the order a schedule is
 * read in and the order a dietitian builds one: a list that groups the two
 * training meals together, or all four snacks, asks the reader to hold the
 * clock in their head while they scan it.
 *
 * Grown from eight to thirteen. The eight covered the standard five plus snacks
 * and the two training rows, which is most weeks and not all of them — a second
 * breakfast, a late brunch and a bedtime snack are ordinary prescriptions, and
 * سحور and إفطار are the two meals a Ramadan week is entirely made of. Every one
 * of them was reachable before only through the free-text box, which is
 * precisely the case that box existed for and precisely the case it handled
 * worst: a typed name carries no hour and no glyph, so the reader answered
 * three questions instead of one.
 */
export const MEAL_NAME_SUGGESTIONS = [
  { id: 'suhoor', icon: 'tea', time: '04:00' },
  { id: 'breakfast', icon: 'tea', time: '07:30' },
  { id: 'secondBreakfast', icon: 'tea', time: '10:00' },
  { id: 'morningSnack', icon: 'snack', time: '10:30' },
  { id: 'brunch', icon: 'chef', time: '11:30' },
  { id: 'lunch', icon: 'chef', time: '14:00' },
  { id: 'preWorkout', icon: 'bottle', time: '16:00' },
  { id: 'afternoonSnack', icon: 'snack', time: '17:00' },
  { id: 'iftar', icon: 'plate', time: '18:15' },
  { id: 'postWorkout', icon: 'bottle', time: '18:30' },
  { id: 'dinner', icon: 'plate', time: '20:00' },
  { id: 'eveningSnack', icon: 'snack', time: '21:30' },
  { id: 'beforeSleep', icon: 'hotDrink', time: '22:30' },
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
