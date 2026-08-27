/**
 * The week, as the document a client takes home and eats from.
 *
 * ## Who this is for, and what that settles
 *
 * Not the dietitian — they have the board. This is read at a kitchen counter by
 * someone deciding what to put on a plate, which settles every question the
 * layout raises:
 *
 *   - **The amounts are the point.** A plan that says "chicken and rice" is not
 *     a plan, it is a suggestion. Each meal carries its resolved ingredient
 *     lines so the sheet can say 120 g, one loaf, six spoons.
 *   - **Alternatives travel with the meal.** A client who cannot face the
 *     planned lunch will substitute *something*; the plan should be what tells
 *     them what, rather than leaving it to guesswork. Same precedence the meal
 *     panel uses on screen — the AI's own alternatives when the meal has them,
 *     the deterministic swap candidates otherwise.
 *   - **It is a document, not a timetable.** An earlier version compressed the
 *     week into a one-page grid. It fit, and it could hold neither of the two
 *     things above, because a cell 30mm wide cannot carry a recipe.
 *
 * Pure and free of React, so the shape of the page is testable without
 * rendering it. It reads the board the editor is already holding — the
 * optimistic one — which is what lets a plan be printed the instant an edit
 * lands rather than after a round trip to fetch it back.
 *
 * ## Nothing here is a second nutrition path
 *
 * Every figure is copied out of `BoardMeal.totals` / `BoardDay.totals` and
 * rounded with `roundForDisplay`, the same call every on-screen surface makes.
 * The ingredient lines travel through untouched: `meal-ingredients.ts` already
 * resolved them to absolute amounts, and `ingredientAmount` spells them at the
 * point of render. A printed plan that disagreed with the board about a portion
 * would be worse than no printed plan.
 */

import { localizedName } from './food-display';
import type { MealIngredientLine } from './meal-ingredients';
import { MACRO_KEYS, type MacroKey, roundForDisplay } from './nutrition';
import type { Board, SwapCandidate } from './queries';
import { orderedWeekdays, planColumnDates } from './week';

/**
 * How many substitutes one meal offers.
 *
 * Three, the same number the meal panel shows on screen — so the client is
 * reading the list the dietitian was looking at when they built the week. More
 * than three stops being a choice and starts being a menu.
 */
const ALTERNATIVES_PER_MEAL = 3;

/** One substitute a client may put in this meal's place. */
export type PrintAlternative = {
  id: string;
  name: string;
  kcal: number;
};

/** One meal: what it is, when it is eaten, what is in it, and what could replace it. */
export type PrintMeal = {
  id: string;
  slotKey: string;
  /** The slot's name — "Breakfast", "فطور". */
  label: string;
  timeOfDay: string;
  /** The dish in the reader's language, or null for a slot nobody filled. */
  dishName: string | null;
  /** Already resolved and already absolute — see `meal-ingredients.ts`. */
  lines: readonly MealIngredientLine[];
  kcal: number;
  alternatives: PrintAlternative[];
};

/** One day, in the order the week is lived. */
export type PrintDay = {
  dayOfWeek: number;
  /** `YYYY-MM-DD`, or null when the plan's `week_start_date` is unreadable. */
  date: string | null;
  meals: PrintMeal[];
  kcal: number;
  /** Protein, carbs and fat in grams, rounded the way every other surface rounds them. */
  macros: Record<MacroKey, number>;
};

/** The whole handout. */
export type PrintPlan = {
  clientName: string;
  weekStartDate: string;
  /** The target the plan was built against, frozen with it. */
  kcalTarget: number;
  /** True once the client can read this week in their portal. */
  published: boolean;
  days: PrintDay[];
  /** Empty slots across the week — the one caveat the sheet has to carry. */
  unfilled: number;
};

/**
 * The board as a client's handout.
 *
 * Days come out in the order the week is experienced, not in Sunday-to-Saturday
 * order: a plan may start on any weekday (`orderedWeekdays`), and a handout
 * whose first section is Sunday for a week beginning on Wednesday is one the
 * client reads in the wrong order. Dates ride along from `planColumnDates`,
 * keyed by weekday for exactly the same reason the board keys them that way.
 *
 * A weekday the board carries no day for is dropped rather than printed empty —
 * a blank section on paper cannot be filled in later the way a board column can.
 */
export function printPlan(
  board: Board,
  locale: string,
  /**
   * Deterministic swap candidates by meal id, as the plan page already computes
   * them. Optional: without it a meal with no AI alternatives simply offers
   * none, which is the honest answer rather than a missing feature.
   */
  candidates: Record<string, SwapCandidate[]> = {},
): PrintPlan {
  const byWeekday = new Map(board.days.map((day) => [day.dayOfWeek, day]));
  const dateByWeekday = new Map(
    planColumnDates(board.weekStartDate).map((column) => [column.dayOfWeek, column.date]),
  );

  const days = orderedWeekdays(board.weekStartDate).flatMap<PrintDay>((dayOfWeek) => {
    const day = byWeekday.get(dayOfWeek);
    if (!day) return [];

    const macros = {} as Record<MacroKey, number>;
    for (const key of MACRO_KEYS) macros[key] = roundForDisplay(key, day.totals[key].value);

    return [
      {
        dayOfWeek,
        date: dateByWeekday.get(dayOfWeek) ?? null,
        meals: day.meals.map((meal) => ({
          id: meal.id,
          slotKey: meal.slotKey,
          label: meal.label,
          timeOfDay: meal.timeOfDay,
          dishName: meal.dish ? localizedName(meal.dish, locale) : null,
          lines: meal.lines,
          kcal: roundForDisplay('kcal', meal.totals.kcal.value),
          alternatives: mealAlternatives(meal, candidates[meal.id] ?? [], locale),
        })),
        kcal: roundForDisplay('kcal', day.totals.kcal.value),
        macros,
      },
    ];
  });

  return {
    clientName: board.clientName,
    weekStartDate: board.weekStartDate,
    kcalTarget: board.kcalTargetSnapshot,
    published: board.status === 'published',
    days,
    unfilled: board.unfilled,
  };
}

/**
 * What a client may eat instead, in the order the app already ranks them.
 *
 * The AI's own alternatives lead when the meal has any, because those were
 * chosen against this client's week; the deterministic swap candidates stand in
 * when it has none. That is the precedence `MealDetailPanel` uses, and the two
 * surfaces disagreeing about what a meal's substitutes are would be worse than
 * either list being shorter.
 *
 * An unfilled slot offers nothing. There is no meal to replace.
 */
function mealAlternatives(
  meal: Board['days'][number]['meals'][number],
  candidates: readonly SwapCandidate[],
  locale: string,
): PrintAlternative[] {
  if (!meal.dish) return [];

  if (meal.options.length > 0) {
    return meal.options.slice(0, ALTERNATIVES_PER_MEAL).map((option) => ({
      id: option.id,
      name: localizedName(option, locale),
      kcal: roundForDisplay('kcal', option.kcal),
    }));
  }

  return candidates.slice(0, ALTERNATIVES_PER_MEAL).map((match) => ({
    id: match.candidate.id,
    name: localizedName(match.candidate, locale),
    kcal: roundForDisplay('kcal', match.kcal),
  }));
}

/**
 * Characters a saved file cannot carry on the platforms this app is printed
 * from. A clinic or client name is free text and may hold any of them.
 */
const UNSAFE_IN_FILENAME = /[\\/:*?"<>|]/g;

/**
 * The name the saved file arrives under, for both formats.
 *
 * A browser's print-to-PDF takes its default file name from `document.title`,
 * so this is not decoration — it is the difference between the dietitian
 * finding "Sara Haddad - 2026-08-30.pdf" in their downloads and finding
 * "Weekly Plans.pdf" for the fourth time this morning. The print path sets the
 * title around `print()`; the Word path passes the same string to the download
 * attribute, so the two formats of one week sit next to each other in a folder.
 *
 * The clinic leads so a folder groups by clinic, the client follows because
 * that is what is being looked for, and the week's start date closes it because
 * it is the one part that is already sortable. A clinic with no name recorded
 * is left out rather than printed as an empty segment.
 */
export function printFileName({
  clinicName,
  clientName,
  weekStartDate,
}: {
  clinicName?: string | null;
  clientName: string;
  weekStartDate: string;
}): string {
  return [clinicName, clientName, weekStartDate]
    .map((part) => (part ?? '').replace(UNSAFE_IN_FILENAME, ' ').replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0)
    .join(' - ');
}
