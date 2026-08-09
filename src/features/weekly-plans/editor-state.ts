import { combineTotals, dishTotals, emptyTotals, type DishDetail } from './nutrition';
import type { Board, BoardDay, BoardMeal } from './queries';
import type { MealType } from './schema';

/**
 * What an edit does to the board, as a pure function.
 *
 * The board renders this through `useOptimistic` while the matching server action
 * persists the same change. Purity is what makes every drag outcome a unit test
 * with no browser, and it is why the optimistic numbers are exact rather than
 * approximate: totals are recomputed by the same `nutrition.ts` the server uses,
 * over the ingredient lists the board already carries. Nothing here guesses.
 */

const ADDED_SLOT_PREFIX = {
  breakfast: 'breakfast_extra',
  snack: 'snack_extra',
  // `extra_N` is the legacy shape and already resolves to lunch through
  // `mealTypeForSlot`, so lunch keeps it for backwards compatibility.
  lunch: 'extra',
  dinner: 'dinner_extra',
} as const satisfies Record<MealType, string>;

/**
 * A free added-slot key for the selected meal type.
 *
 * The lowest unused index, not a count: removing a numbered slot and adding
 * another meal of that type should reuse the gap, while counting would walk the
 * keys upward forever across an afternoon of edits.
 */
export function nextSlotKey(
  existingSlotKeys: readonly string[],
  mealType: MealType = 'lunch',
  customPrefix?: string,
): string {
  const taken = new Set<number>();
  const prefix = customPrefix ?? ADDED_SLOT_PREFIX[mealType];
  const addedSlot = new RegExp(`^${prefix}_(\\d+)$`);

  for (const key of existingSlotKeys) {
    const match = addedSlot.exec(key);
    if (match) taken.add(Number(match[1]));
  }

  let index = 1;
  while (taken.has(index)) index += 1;

  return `${prefix}_${index}`;
}

/** Every edit the board can make, as one closed set. */
export type BoardEdit =
  | { kind: 'place'; mealId: string; dish: DishDetail; servings: number }
  | { kind: 'servings'; mealId: string; servings: number }
  | { kind: 'clear'; mealId: string }
  | { kind: 'remove'; mealId: string }
  | { kind: 'add'; dayOfWeek: number; label: string; timeOfDay: string; slotKey: string }
  | { kind: 'addWeek'; label: string; timeOfDay: string; slotKey: string }
  | { kind: 'removeWeek'; slotKey: string }
  | { kind: 'move'; fromMealId: string; toMealId: string; mode: 'move' | 'copy' };

/** Finds a meal anywhere on the board. */
function findMeal(board: Board, mealId: string): BoardMeal | null {
  for (const day of board.days) {
    for (const meal of day.meals) if (meal.id === mealId) return meal;
  }

  return null;
}

/**
 * A meal carrying a dish at a portion, costed.
 *
 * Totals are always derived here, never carried across from the previous state —
 * a stale total is worse than no total, because it looks authoritative.
 */
function withDish(meal: BoardMeal, dish: DishDetail | null, servings: number): BoardMeal {
  return {
    ...meal,
    dish: dish ? { ...dish, servings } : null,
    // The rationale explained the dish that was there. Leaving the model's words
    // under a dish the dietitian chose would misattribute both.
    rationaleAr: dish && dish.id === meal.dish?.id ? meal.rationaleAr : null,
    totals: dish ? dishTotals(dish.ingredients, servings) : emptyTotals(),
  };
}

/** Recomputes a day's totals and gap count from its meals. */
function recountDay(day: BoardDay): BoardDay {
  return {
    ...day,
    totals: combineTotals(day.meals.map((meal) => meal.totals)),
    unfilled: day.meals.filter((meal) => meal.dish === null).length,
  };
}

/** Recomputes the week from its days. */
function recountBoard(board: Board, days: BoardDay[]): Board {
  const counted = days.map(recountDay);

  return {
    ...board,
    days: counted,
    totals: combineTotals(counted.map((day) => day.totals)),
    unfilled: counted.reduce((sum, day) => sum + day.unfilled, 0),
  };
}

/** Rewrites every meal through `map`, dropping the ones it returns null for. */
function mapMeals(board: Board, map: (meal: BoardMeal) => BoardMeal | null): Board {
  return recountBoard(
    board,
    board.days.map((day) => ({
      ...day,
      meals: day.meals.flatMap((meal) => {
        const next = map(meal);
        return next ? [next] : [];
      }),
    })),
  );
}

/**
 * The board after one edit.
 *
 * Every branch returns a new board rather than mutating, because `useOptimistic`
 * compares by reference. An edit naming a meal the board does not have is a no-op:
 * it means the server state moved under the optimistic one, and the revalidation
 * that follows is the correct answer, not this.
 */
export function applyEdit(board: Board, edit: BoardEdit): Board {
  switch (edit.kind) {
    case 'place':
      return mapMeals(board, (meal) =>
        meal.id === edit.mealId ? withDish(meal, edit.dish, edit.servings) : meal,
      );

    case 'servings':
      return mapMeals(board, (meal) =>
        meal.id === edit.mealId && meal.dish ? withDish(meal, meal.dish, edit.servings) : meal,
      );

    case 'clear':
      return mapMeals(board, (meal) => (meal.id === edit.mealId ? withDish(meal, null, 1) : meal));

    case 'remove':
      return mapMeals(board, (meal) => (meal.id === edit.mealId ? null : meal));

    case 'add': {
      const added: BoardMeal = {
        // Replaced by the real row on the next revalidation. Prefixed so a stray
        // optimistic id can never be mistaken for a uuid the server issued.
        id: `optimistic-${edit.dayOfWeek}-${edit.slotKey}`,
        slotKey: edit.slotKey,
        label: edit.label,
        timeOfDay: edit.timeOfDay,
        dish: null,
        rationaleAr: null,
        totals: emptyTotals(),
        // Unbudgeted. 0 already means "no budget" everywhere in this feature, and
        // recomputing the day's other budgets to make room would rewrite the
        // numbers the rest of the week was generated against.
        budgetKcal: 0,
        options: [],
      };

      return recountBoard(
        board,
        board.days.map((day) =>
          day.dayOfWeek === edit.dayOfWeek ? { ...day, meals: [...day.meals, added] } : day,
        ),
      );
    }

    case 'removeWeek': {
      return recountBoard(
        board,
        board.days.map((day) => ({
          ...day,
          meals: day.meals.filter((meal) => meal.slotKey !== edit.slotKey),
        })),
      );
    }

    case 'addWeek': {
      return recountBoard(
        board,
        board.days.map((day) =>
          // Skipped where the day already carries the slot, matching what
          // `addMealToWeek` writes — otherwise the optimistic board would show a
          // duplicate row for a moment and then drop it on revalidation.
          day.meals.some((meal) => meal.slotKey === edit.slotKey)
            ? day
            : {
                ...day,
                meals: [
                  ...day.meals,
                  {
                    id: `optimistic-${day.dayOfWeek}-${edit.slotKey}`,
                    slotKey: edit.slotKey,
                    label: edit.label,
                    timeOfDay: edit.timeOfDay,
                    dish: null,
                    rationaleAr: null,
                    totals: emptyTotals(),
                    budgetKcal: 0,
                    options: [],
                  },
                ],
              },
        ),
      );
    }

    case 'move': {
      const source = findMeal(board, edit.fromMealId);
      if (!source?.dish) return board;

      const moved = source.dish;
      const target = findMeal(board, edit.toMealId);
      if (!target) return board;
      const displaced = target.dish;

      return mapMeals(board, (meal) => {
        // The dish and its portion move; the target's own label, time and budget
        // stay. A lunch dropped on a breakfast slot becomes breakfast at
        // breakfast's budget, which is what the dietitian sees and expects.
        if (meal.id === edit.toMealId) return withDish(meal, moved, moved.servings);
        if (meal.id === edit.fromMealId && edit.mode === 'move') {
          return withDish(meal, displaced, displaced?.servings ?? 1);
        }
        return meal;
      });
    }
  }
}
