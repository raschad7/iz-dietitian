import {
  mealGrams,
  mealTotals,
  scaleRecipe,
  sideLines,
  type MealIngredientLine,
  type SideRecipe,
} from './meal-ingredients';
import { combineTotals, emptyTotals, type DishDetail } from './nutrition';
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
  /**
   * One ingredient's amount, set by hand.
   *
   * Named by food rather than by row index: the board holds the meal's resolved
   * lines and the server holds rows keyed on `catalog_food_id`, so a food id is
   * the one identifier both sides already agree on.
   */
  | {
      kind: 'ingredient';
      mealId: string;
      foodId: string;
      quantityGrams: number;
      portionQuantity: number | null;
    }
  /** Puts a meal back on its dish's recipe, discarding hand-set amounts. */
  | { kind: 'resetIngredients'; mealId: string }
  /**
   * Everything standing beside one meal, replaced at once.
   *
   * The dish ids *and* their resolved recipes, because the optimistic board has
   * to recompute the meal's calories before the server answers, and a salad's
   * calories are in its recipe. Both come off the catalog the board already
   * holds, so nothing is fetched to apply this.
   */
  | { kind: 'sides'; mealId: string; sides: readonly SideRecipe[] }
  | { kind: 'clear'; mealId: string }
  | { kind: 'remove'; mealId: string }
  | { kind: 'add'; dayOfWeek: number; label: string; timeOfDay: string; slotKey: string }
  | { kind: 'addWeek'; label: string; timeOfDay: string; slotKey: string }
  | { kind: 'removeWeek'; slotKey: string }
  /** The undo of `removeWeek` — the meals it took, back in the days they came from. */
  | { kind: 'restoreWeek'; meals: readonly { dayOfWeek: number; meal: BoardMeal }[] }
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
  // A different dish means the old hand-set amounts described food that is no
  // longer in this meal, so the recipe takes over again — which is exactly what
  // `replaceMealIngredients` does on the server when the dish changes.
  //
  // The sides are carried across rather than rebuilt. They are not scaled by the
  // multiplier and they do not belong to the dish, so a salad survives a portion
  // change and survives a swap — which is what the server does too, since
  // `weekly_plan_meal_sides` is keyed on the meal, not on the dish. Rebuilding
  // from `scaleRecipe` alone is what used to make the salad blink out of the
  // ingredient list on every step of the portion control.
  const kept = meal.lines.filter((line) => line.side !== null);
  const lines = dish ? [...scaleRecipe(dish.ingredients, servings), ...kept] : [];

  return {
    ...meal,
    // An empty slot cannot carry a side — the server refuses one — so clearing
    // the dish clears them with it.
    sides: dish ? meal.sides : [],
    dish: dish ? { ...dish, servings } : null,
    // The rationale explained the dish that was there. Leaving the model's words
    // under a dish the dietitian chose would misattribute both.
    rationaleAr: dish && dish.id === meal.dish?.id ? meal.rationaleAr : null,
    lines,
    hasOwnAmounts: false,
    totals: dish ? mealTotals(lines) : emptyTotals(),
    grams: dish ? mealGrams(lines) : 0,
    // Always live. Only a draft is editable (`editablePlan` refuses anything else),
    // so an optimistic edit is by definition happening to unfrozen numbers.
    nutritionFrozen: false,
  };
}

/**
 * A meal with one ingredient moved.
 *
 * Rewrites the whole `lines` array, not only the line that changed, because that
 * is what the meal now is: the first hand-set amount turns the meal's own lines
 * into the record, and the dish multiplier stops applying. The server writes the
 * same whole-meal copy in the same moment, so the optimistic board and the row it
 * is anticipating are the same shape by construction rather than by agreement.
 */
function withIngredient(
  meal: BoardMeal,
  foodId: string,
  quantityGrams: number,
  portionQuantity: number | null,
): BoardMeal {
  const lines: MealIngredientLine[] = meal.lines.map((line) =>
    // `line.side === null` as well as the food id: a salad standing beside a
    // maqluba can hold the same tomato the maqluba does, and without this the
    // one control would move both. The server never writes a side's amount at
    // all — `setMealIngredient` resolves the main's lines only — so matching it
    // here is what keeps the optimistic board honest about what was changed.
    line.side === null && line.food.id === foodId
      ? { ...line, quantityGrams, portionQuantity }
      : line,
  );

  return {
    ...meal,
    lines,
    hasOwnAmounts: true,
    totals: mealTotals(lines),
    grams: mealGrams(lines),
    nutritionFrozen: false,
  };
}

/**
 * A meal with a different set of things standing beside it.
 *
 * The main is kept exactly as it is — its own lines, hand-set or scaled, are not
 * touched — and only the side block is rebuilt, which is precisely the write the
 * server performs. Totals are recomputed rather than adjusted, so removing the
 * salad takes its calories off the card in the same frame the salad leaves it.
 */
function withSides(meal: BoardMeal, sides: readonly SideRecipe[]): BoardMeal {
  const lines = [...meal.lines.filter((line) => line.side === null), ...sideLines(sides)].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  return {
    ...meal,
    sides: sides.map(({ id, nameAr, nameEn }) => ({ id, nameAr, nameEn })),
    lines,
    totals: mealTotals(lines),
    grams: mealGrams(lines),
    nutritionFrozen: false,
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

    case 'ingredient':
      return mapMeals(board, (meal) =>
        meal.id === edit.mealId && meal.dish
          ? withIngredient(meal, edit.foodId, edit.quantityGrams, edit.portionQuantity)
          : meal,
      );

    case 'resetIngredients':
      // `withDish` rebuilds the lines from the recipe, which is exactly what
      // dropping the stored rows leaves behind on the server. The multiplier is
      // already 1 there — materialising spent it — so both sides land together.
      return mapMeals(board, (meal) =>
        meal.id === edit.mealId && meal.dish
          ? withDish(meal, meal.dish, meal.dish.servings)
          : meal,
      );

    case 'sides':
      return mapMeals(board, (meal) =>
        meal.id === edit.mealId && meal.dish ? withSides(meal, edit.sides) : meal,
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
        sides: [],
        lines: [],
        hasOwnAmounts: false,
        rationaleAr: null,
        totals: emptyTotals(),
        grams: 0,
        nutritionFrozen: false,
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

    /*
     * The undo of `removeWeek`, replaying the exact meals that were taken.
     *
     * Not `addWeek` with a slot key: that builds seven empty cells, and what
     * this puts back is seven cells with a week of dishes in them. The caller
     * captured the real `BoardMeal` objects before the removal, so the
     * optimistic board is not a reconstruction — it is the rows themselves,
     * totals included. The ids will differ once the server's own insert comes
     * back on revalidation, which is invisible: nothing on the board keys off a
     * meal id between one render and the next.
     *
     * Guarded per day, the same way `addWeek` is: a day that somehow already
     * carries the slot is left alone rather than given a duplicate row, which
     * would make the board's slot lookup ambiguous.
     */
    case 'restoreWeek': {
      const byDay = new Map<number, BoardMeal[]>();
      for (const meal of edit.meals) {
        byDay.set(meal.dayOfWeek, [...(byDay.get(meal.dayOfWeek) ?? []), meal.meal]);
      }

      return recountBoard(
        board,
        board.days.map((day) => {
          const restored = (byDay.get(day.dayOfWeek) ?? []).filter(
            (meal) => !day.meals.some((existing) => existing.slotKey === meal.slotKey),
          );

          return restored.length ? { ...day, meals: [...day.meals, ...restored] } : day;
        }),
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
                    sides: [],
                    lines: [],
                    hasOwnAmounts: false,
                    rationaleAr: null,
                    totals: emptyTotals(),
                    grams: 0,
                    nutritionFrozen: false,
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
