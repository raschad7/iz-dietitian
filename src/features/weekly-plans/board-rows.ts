import type { BoardDay, BoardMeal } from './queries';

/**
 * One row of the board: a slot, and which days actually carry it.
 *
 * The board is drawn as a table — days across, slots down — and a row label is
 * only honest if every cell in that row is the same meal. That is true the
 * moment a plan is created, because `planSkeleton` builds all seven days from
 * one `mealSchedule`, so `slotKey`, `label` and `timeOfDay` are identical
 * across the week and `sortOrder` is the schedule's own order.
 *
 * It stops being true as soon as the plan is edited: adding a slot or removing
 * one acts on a single day. Rather than forbid that, the grid is built from the
 * **union** of the week's slot keys — so a row exists if *any* day has it, and a
 * day that does not carry it renders an empty cell instead of shifting every
 * meal below it up by one.
 *
 * That is what keeps the row label truthful with no schema change and no
 * "these days are ragged" state to maintain: a missing meal is simply a gap in
 * a row that still means what it says.
 */
export type BoardRow = {
  slotKey: string;
  /** The slot's name, taken from the first day that carries it. */
  label: string;
  timeOfDay: string;
  /** The meal for each `dayOfWeek`, absent where that day does not carry the slot. */
  mealByDay: Map<number, BoardMeal>;
};

/**
 * The week's rows, in the order they are eaten.
 *
 * Ordered by the earliest `sortOrder` any day gives the slot, then by time, then
 * by key. `sortOrder` leads because it is the order the dietitian arranged the
 * schedule in and two slots may deliberately share a time; the other two are
 * tie-breakers that exist so the order is total and therefore stable — a row
 * order that depends on which day happened to be read first would reshuffle the
 * board on an unrelated edit.
 */
export function boardRows(days: readonly BoardDay[]): BoardRow[] {
  const rows = new Map<string, BoardRow & { sortOrder: number }>();

  for (const day of days) {
    for (const [index, meal] of day.meals.entries()) {
      const existing = rows.get(meal.slotKey);

      if (!existing) {
        rows.set(meal.slotKey, {
          slotKey: meal.slotKey,
          label: meal.label,
          timeOfDay: meal.timeOfDay,
          sortOrder: index,
          mealByDay: new Map([[day.dayOfWeek, meal]]),
        });
        continue;
      }

      existing.mealByDay.set(day.dayOfWeek, meal);
      existing.sortOrder = Math.min(existing.sortOrder, index);
    }
  }

  return [...rows.values()]
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.timeOfDay.localeCompare(b.timeOfDay) ||
        a.slotKey.localeCompare(b.slotKey),
    )
    .map(({ sortOrder: _sortOrder, ...row }) => row);
}
