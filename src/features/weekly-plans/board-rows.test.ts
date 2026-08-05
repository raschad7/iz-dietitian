import { describe, expect, test } from 'bun:test';

import { boardRows } from './board-rows';
import type { BoardDay, BoardMeal } from './queries';
import { emptyTotals } from './nutrition';

function meal(slotKey: string, label: string, timeOfDay: string): BoardMeal {
  return {
    id: `${slotKey}-${timeOfDay}`,
    slotKey,
    label,
    timeOfDay,
    dish: null,
    rationaleAr: null,
    totals: emptyTotals(),
    budgetKcal: 0,
    options: [],
  };
}

function day(dayOfWeek: number, meals: BoardMeal[]): BoardDay {
  return { dayOfWeek, meals, totals: emptyTotals(), unfilled: meals.length };
}

/** The shape `planSkeleton` produces: every day carrying the same slots. */
function evenWeek(): BoardDay[] {
  return [0, 1, 2].map((index) =>
    day(index, [
      meal('breakfast', 'فطور', '07:30'),
      meal('lunch', 'غداء', '14:00'),
      meal('dinner', 'عشاء', '22:00'),
    ]),
  );
}

const keys = (rows: ReturnType<typeof boardRows>) => rows.map((row) => row.slotKey);

describe('boardRows', () => {
  test('an untouched week is one row per slot, in schedule order', () => {
    const rows = boardRows(evenWeek());

    expect(keys(rows)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(rows[0]?.label).toBe('فطور');
    expect(rows[0]?.timeOfDay).toBe('07:30');
    expect(rows.every((row) => row.mealByDay.size === 3)).toBe(true);
  });

  test('a slot on one day still gets a row, with the other days absent', () => {
    const days = evenWeek();
    days[1]!.meals.push(meal('extra_1', 'وجبة إضافية', '19:00'));

    const rows = boardRows(days);
    const extra = rows.find((row) => row.slotKey === 'extra_1');

    expect(rows).toHaveLength(4);
    expect(extra?.mealByDay.size).toBe(1);
    expect(extra?.mealByDay.has(1)).toBe(true);
    expect(extra?.mealByDay.has(0)).toBe(false);
  });

  test('removing a slot from one day leaves a gap rather than shifting the rows', () => {
    const days = evenWeek();
    // Tuesday skips lunch.
    days[2]!.meals = days[2]!.meals.filter((entry) => entry.slotKey !== 'lunch');

    const rows = boardRows(days);
    const lunch = rows.find((row) => row.slotKey === 'lunch');
    const dinner = rows.find((row) => row.slotKey === 'dinner');

    // The row order is untouched, so dinner does not ride up into lunch's row.
    expect(keys(rows)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(lunch?.mealByDay.has(2)).toBe(false);
    expect(dinner?.mealByDay.get(2)?.slotKey).toBe('dinner');
  });

  test('a row dropped from every day disappears entirely', () => {
    const days = evenWeek().map((entry) => ({
      ...entry,
      meals: entry.meals.filter((one) => one.slotKey !== 'lunch'),
    }));

    expect(keys(boardRows(days))).toEqual(['breakfast', 'dinner']);
  });

  test('the label comes from a day that carries the slot, never from a gap', () => {
    const days = evenWeek();
    days[0]!.meals = days[0]!.meals.filter((entry) => entry.slotKey !== 'breakfast');

    const rows = boardRows(days);

    expect(rows.find((row) => row.slotKey === 'breakfast')?.label).toBe('فطور');
  });

  test('order is stable however the days are read', () => {
    const forwards = boardRows(evenWeek());
    const backwards = boardRows([...evenWeek()].reverse());

    expect(keys(backwards)).toEqual(keys(forwards));
  });

  test('two slots sharing a time keep the schedule order rather than swapping', () => {
    // A deliberate pair — a snack eaten alongside lunch. `sortOrder` decides,
    // and the time tie-breaker must not reorder them.
    const days = [
      day(0, [meal('lunch', 'غداء', '14:00'), meal('snack_2', 'سناك', '14:00')]),
    ];

    expect(keys(boardRows(days))).toEqual(['lunch', 'snack_2']);
  });

  test('an empty week has no rows', () => {
    expect(boardRows([day(0, []), day(1, [])])).toEqual([]);
  });
});
