'use client';

import { Icon } from '@/components/ui/icon';

import { useMealCompletion } from './plan-day-completion';

/**
 * The "I had this" circle on a meal card.
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
      className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo"
    >
      {/*
        `check` is `solar:check-circle-bold` — a filled circle with the tick cut
        *out* of it (`fill-rule="evenodd"`), so the tick paints as whatever sits
        behind the glyph. White behind it is therefore the only way to get a
        white tick; against the card's olive-100 shell the knockout would be a
        pale olive tick on an olive circle.

        **The white has to be smaller than the circle, not the same size.** That
        circle is `r=10` in a 24 viewBox, so it covers 20/24 of the glyph's box
        and leaves an eighth of it empty at the edge — a full-size white disc
        behind a 28px icon showed as a 2px white ring around the green. A 20px
        disc is comfortably inside the circle's 23.3px and comfortably outside
        the tick's ~9×7px, so the green reaches its own edge and the only white
        left is the tick itself.
      */}
      <span className="relative grid size-7 place-items-center">
        {checked ? (
          <>
            <span aria-hidden className="absolute size-5 rounded-full bg-card" />
            <Icon name="check" className="relative size-7 text-primary" />
          </>
        ) : (
          // Unchecked is an empty ring rather than a faint glyph: an outline
          // reads as "not yet", where a grey tick reads as a disabled one. 24px
          // against the checked circle's 23.3px, so the mark does not resize as
          // it is tapped.
          <span className="size-6 rounded-full border-2 border-muted-foreground/45 bg-card" />
        )}
      </span>
    </button>
  );
}
