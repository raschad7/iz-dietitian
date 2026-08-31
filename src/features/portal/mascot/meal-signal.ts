import type { MealSignal } from './emotion';

/**
 * Whether today's meal schedule has something worth the mascot's attention —
 * derived purely from each meal's own `timeOfDay` and whether it has been
 * ticked, the same two facts `MealCheck`/`PlanDayCompletionProvider` already
 * carry. No new data source: §1 of the brief is explicit that meal status
 * comes from what already exists.
 */

/** A meal counts as "due" from its own time and for this long afterward. */
const DUE_WINDOW_MINUTES = 90;

/** Past this many minutes uncompleted, a meal reads as missed rather than due. */
const MISSED_AFTER_MINUTES = 150;

function minutesOfDay(timeOfDay: string): number {
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/**
 * `missed` outranks `due`: one overdue meal is worth surfacing even while
 * another is still inside its own due window — matching the priority
 * `resolveMascotEmotion` already gives `missedMeal` over `mealReminder`.
 */
export function todayMealSignal(
  meals: readonly { id: string; timeOfDay: string }[],
  isCompleted: (mealId: string) => boolean,
  nowMinute: number,
): MealSignal {
  let due = false;
  let missed = false;

  for (const meal of meals) {
    if (isCompleted(meal.id)) continue;

    const elapsed = nowMinute - minutesOfDay(meal.timeOfDay);
    if (elapsed < 0) continue; // not due yet

    if (elapsed > MISSED_AFTER_MINUTES) missed = true;
    else if (elapsed <= DUE_WINDOW_MINUTES) due = true;
  }

  if (missed) return 'missed';
  if (due) return 'due';
  return meals.length > 0 ? 'onTrack' : null;
}
