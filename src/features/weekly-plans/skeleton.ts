import { DAYS_OF_WEEK, type MealScheduleInput } from './schema';
import { slotBudgets } from './targets';

/**
 * Laying out the week a plan is written into.
 *
 * Pure, and the single source of a plan's shape. Three doors lead into a plan —
 * generation, a copy of an earlier week, and an empty week — and all three must
 * produce the same slots for the same client, or "start from last week" would
 * quietly mean something different from "generate".
 *
 * The skeleton always comes from the client's CURRENT schedule and target, never
 * from the plan being copied. Removing the afternoon snack from a profile and then
 * copying July's plan gives four meals a day, not five and seven deletions.
 */

/** One meal row, before it has an id. Matches `weekly_plan_meals`. */
export type SkeletonMeal = {
  dayOfWeek: number;
  slotKey: string;
  label: string;
  timeOfDay: string;
  budgetKcal: number;
  sortOrder: number;
  dishId: string | null;
  servings: number;
};

/** What may be dropped into a slot. */
export type SlotFill = { dishId: string; servings: number };

/**
 * The key a fill map is addressed by.
 *
 * A function rather than a bare template literal at each call site, so the two
 * sides of the map can never disagree about the separator.
 */
export function slotFillKey(dayOfWeek: number, slotKey: string): string {
  return `${dayOfWeek}:${slotKey}`;
}

/**
 * Seven days of slots, optionally filled.
 *
 * `fill` is consulted, never trusted: a key naming a slot the schedule no longer
 * has is ignored rather than added back. That is what makes a copy follow the
 * client's current schedule instead of resurrecting the old one.
 */
export function planSkeleton(input: {
  schedule: MealScheduleInput;
  dailyKcal: number;
  fill?: ReadonlyMap<string, SlotFill>;
}): SkeletonMeal[] {
  const budgets = slotBudgets(input.dailyKcal, input.schedule);

  return DAYS_OF_WEEK.flatMap((dayOfWeek) =>
    budgets.map((slot, index) => {
      const filled = input.fill?.get(slotFillKey(dayOfWeek, slot.slotKey));

      return {
        dayOfWeek,
        slotKey: slot.slotKey,
        label: slot.label,
        timeOfDay: slot.timeOfDay,
        budgetKcal: slot.kcal,
        // Position in the schedule, not time of day: the schedule is the order the
        // dietitian arranged, and two slots may share a time.
        sortOrder: index,
        dishId: filled?.dishId ?? null,
        servings: filled?.servings ?? 1,
      };
    }),
  );
}
