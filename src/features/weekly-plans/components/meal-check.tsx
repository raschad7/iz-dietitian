'use client';

import { MealCheckMark } from './meal-check-mark';
import { useMealCompletion } from './plan-day-completion';

/**
 * The "I had this" circle on a meal card — **today's only**.
 *
 * Ticking writes through `useMealCompletion` to `weekly_plan_meal_completions`
 * — the source of truth the whole progress tab is now derived from (see
 * `client-plan-adherence.ts`) — and flips instantly rather than waiting on
 * that write, via the same hook's optimistic state.
 *
 * **It is its own client component so the meal card is not.** `portal-plan.tsx`
 * renders the whole week's dishes on the server precisely so they never reach
 * the browser; a `useState` anywhere in `MealCard` would pull all of it into the
 * bundle. This is the only interactive part, so this is the only part that ships.
 *
 * **A day other than today never renders this at all.** `MealCard` draws
 * `SettledMealCheck` for a day that has ended and nothing whatsoever for one
 * that has not arrived — so there is no disabled state here to reason about, and
 * a past day's plan carries no click handler to the phone. The rule those three
 * branches come from is `dayStanding`, and the server enforces the same one in
 * `toggleMealCompletion`: hiding a control is a courtesy, not a guard.
 *
 * **The click is stopped from opening the card.** The button sits inside
 * `<summary>`, whose activation behaviour is what toggles a `<details>`, and a
 * click on any descendant carries that default with it as it bubbles. Ticking a
 * meal and having it unfold underneath you is not what the control promises.
 */
export function MealCheck({ mealId, label }: { mealId: string; label: string }) {
  const { checked, toggle } = useMealCompletion(mealId);

  return (
    <button
      type="button"
      // `role="checkbox"` rather than `aria-pressed`: this reports whether a
      // thing is true, not whether a mode is engaged. The design system lists a
      // checkbox among the controls not built yet — when one is genuinely
      // needed in a form, it belongs in `src/components/ui/`, built against
      // §Fields rather than extracted from this.
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }}
      // `text-meal-check-fill`, not `text-primary`: a design reference asked
      // for the same bright green the home hero uses — see that token's own
      // comment in `globals.css` for the contrast this trades away.
      className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-meal-check-fill outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo"
    >
      <MealCheckMark checked={checked} />
    </button>
  );
}
