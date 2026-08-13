import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import { cn } from '@/lib/utils';

import { MealCheck } from './meal-check';
import { SettledMealCheck } from './meal-check-mark';
import type { BoardMeal } from '../queries';
import { mealTypeForSlot, type MealType } from '../schema';
import type { DayStanding } from '../week';

/**
 * The icon a meal carries, from the slot it fills.
 *
 * Keyed on `mealTypeForSlot`, the same stem match the generator uses to pick a
 * dish for a slot — so a dietitian who names a slot `snack_3` gets the snack icon
 * without anything here having to know about it. Time-of-day metaphors rather
 * than specific foods: the plan's dishes are Palestinian, and a croissant is not
 * what breakfast looks like here.
 *
 * **The line set, not the app's usual Solar Bold**, and drawn bare rather than on
 * a filled disc — see the note beside these in `scripts/generate-icons.ts`. The
 * staff planner's slot rail still takes the bold four.
 */
const MEAL_ICONS = {
  breakfast: 'mealBreakfastOutline',
  snack: 'mealSnackOutline',
  lunch: 'mealLunchOutline',
  dinner: 'mealDinnerOutline',
} as const satisfies Record<MealType, IconName>;

/**
 * The meal card's surface — see the `--meal-*` block in `globals.css`.
 *
 * One tone for every meal, and for every day. A completed meal on a day
 * that has already ended used to wear a second shell, tinted olive to mark
 * it kept — that tint is gone, and today, a settled day and a day still
 * ahead all draw the exact same card. The tick itself already says which
 * meals were eaten (`MealCheckMark`'s filled circle against its empty ring),
 * so a second, whole-card signal saying the same thing was two systems
 * agreeing by coincidence rather than one system stating it once.
 */
const MEAL_SHELL = 'bg-meal-bg text-meal-fg';

/**
 * The tick's colour on a day this component does not let you edit — past or
 * future's empty ring. The same `--meal-check-fill` green `MealCheck` wears
 * on the live button — see that token's comment in `globals.css` for why it
 * replaced olive-500 here. A meal ticked today must not look like a
 * different kind of tick tomorrow, so this stays in lockstep with
 * `MealCheck`'s own colour rather than drifting back to `text-primary`.
 */
const TICK_TONE = 'text-meal-check-fill';

/**
 * One meal: a closed card that opens.
 *
 * A day is five meals, and each one fully expanded is a screen and a half of
 * scrolling before the last is reached. Closed, the whole day fits above the fold
 * and can be read at a glance; open, one meal gives everything it has. The
 * summary still carries what a client is actually scanning for — which meal, when,
 * what dish, how much energy — so the list answers the common question without
 * being opened at all.
 *
 * Built on `<details>`, not on state. It keeps this a server component, so the
 * week's dishes and ingredients are never shipped to the browser; and the
 * keyboard, the screen reader and find-in-page all work without being wired up.
 *
 * **The tick has three states, and only one of them is a control.**
 *
 * - **Today** — the live `MealCheck`. The only day whose meals can be reported
 *   on, and the only day that ships any JavaScript for it.
 * - **A day that has ended** — `SettledMealCheck`: the same mark, stated rather
 *   than offered.
 * - **A day that has not arrived** — nothing at all. Not a disabled circle: an
 *   empty ring on tomorrow's breakfast is a question ("have you eaten this?")
 *   whose only honest answer is "not yet, and you couldn't have", and five of
 *   them down a day that has not happened reads as five things already missed.
 *   The meal itself is unchanged — a future day is exactly what this screen is
 *   for reading.
 *
 * The row's shape survives all three. The tick's 44px footprint is kept on a
 * settled day and given up entirely on a future one, where nothing else is
 * competing for the inline-start edge.
 */
export function PortalMealCard({
  meal,
  standing,
  completed,
}: {
  meal: BoardMeal;
  standing: DayStanding;
  /** Server-known and fixed on a settled day; on today `MealCheck` owns it instead. */
  completed: boolean;
}) {
  const t = useTranslations('portal.plan');

  const mealType = mealTypeForSlot(meal.slotKey);
  const mealIcon = MEAL_ICONS[mealType];
  const dish = meal.dish;

  return (
    /*
      A tinted shell around a white panel, rather than one flat surface. The frame
      is what carries the meal's identity — it is visible down the whole side of
      the card instead of only across a strip at the top — and it lets the content
      itself stay on plain card white, where the measured text pairs hold.

      `gap-0 p-1.5` replaces `Card`'s own padding: here the padding belongs to the
      panel inside, not to the shell.
    */
    <Card
      className={cn(
    'gap-0 p-1.5 shadow-none ring-0 transition-colors duration-(--duration-label)',
    'group-open:bg-[#F0F0F0] group-open:ring-1 group-open:ring-meal-border-checked',
    'has-[[aria-checked=true]]:bg-[#F0F0F0] has-[[aria-checked=true]]:ring-1 has-[[aria-checked=true]]:ring-meal-border-checked',
    MEAL_SHELL, 
  )} 
    >
      <details className="q-disclosure group">
        {/*
          The whole row is the control — 56px tall and full width, so it is a
          target that cannot be missed rather than a chevron that has to be aimed
          at. `list-none` plus the WebKit marker rule removes the default triangle
          in every engine.
        */}
        {/*
          `gap-2.5` again: the kcal pill left the row, so four elements share
          three gaps where five shared four, and the eight pixels that were
          taken out of them go back.
        */}
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2.5 rounded-md px-2.5 py-2 outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo [&::-webkit-details-marker]:hidden">
          {/*
            The tick leads the row, at the **inline-start** — the edge a column of
            five is read down, so "which of these have I eaten" is answered by one
            glance straight down the margin rather than by tracking to the far side
            of five rows of different lengths. In Arabic that puts it against the
            right edge, which is where the reference design has it; in English it
            lands on the left, from the same source order.

            It stores nothing itself — see `meal-check.tsx`. Its label names the
            meal, because five identical "mark as eaten" buttons on one screen give
            a screen reader no way to tell which is which — and the settled
            labels name it too, for the same reason.

            A future day renders neither, which is why this is a three-way and
            not a `disabled` prop.
          */}
          {standing === 'today' ? (
            <MealCheck mealId={meal.id} label={t('markEaten', { meal: meal.label })} />
          ) : standing === 'past' ? (
            <SettledMealCheck
              checked={completed}
              label={t(completed ? 'wasEaten' : 'wasNotEaten', { meal: meal.label })}
              className={TICK_TONE}
            />
          ) : null}

          {/*
            `span`, not `p`: a <summary> takes phrasing content, so a paragraph
            inside it is invalid markup that browsers then reflow unpredictably.
          */}
          <span className="min-w-0 flex-1">
            {/*
              `text-heading-sm` (20px/600) rather than `text-base`: this row is
              the card's title — the one thing a client is scanning five of to
              find "which meal" — and the scale's own role table names that
              exact job (§Typography "Card titles, dialog titles"). The step
              bakes its own leading and weight, so it replaces
              `leading-snug font-semibold` rather than joining them.
            */}
            <span className="block font-heading text-heading-sm">{meal.label}</span>
            <span className="block truncate text-sm">
              {/* `dir="ltr"`: a clock time reads the same way in both languages. */}
              <span dir="ltr" className="tabular-nums">
                {meal.timeOfDay}
              </span>
              {dish ? ` · ${dish.nameAr}` : null}
            </span>
          </span>

          {/*
            `chevronDown` is not in `DIRECTIONAL`, and correctly so: it points
            down in both scripts, and mirroring it would be mirroring nothing.
            The rotation rides the system's sweep tokens rather than a literal.
          */}
          <Icon
            name="chevronDown"
            className="size-4 shrink-0 transition-transform duration-(--duration-sweep) ease-(--ease-sweep) group-open:rotate-180"
          />

          {/*
            Bare on the shell, with no disc behind it: a line glyph knocked out of
            a solid circle is a filled mark again, whatever the glyph is doing. It
            inherits `text-meal-fg`, the measured pair for this surface, and sits
            beside the chevron because the two together are now the row's quiet end
            — everything that identifies the meal is at the start, everything that
            is chrome is here.
          */}
          <Icon name={mealIcon} className="size-5 shrink-0" />
        </summary>

        {/*
          Plain `rounded-lg` on a bare fill: this is a panel inside the shell
          around it, not a card in its own right. `bg-meal-bg`, not `bg-card`
          — the panel is meant to read as part of the same tinted shell it
          opens inside of, not as a second, whiter surface floating on top.
        */}
        <div className="mt-1.5 rounded-lg bg-meal-bg p-4">
          {dish ? (
            <div className="space-y-4">
              {/*
                The dish and its portion, and nothing beside them.

                There was a 64px tinted tile with the generic `dish` glyph in it
                here. It was constant across every dish — nothing in `dishes`
                carries an image — so on a five-meal day it drew the same picture
                five times and named none of them, while pushing the one line
                that does identify the dish into two thirds of the row.

                The three macro tiles that followed are gone with it. A client
                reading their plan on a phone is being told what to eat; grams of
                protein, carbohydrate and fat are the dietitian's working
                figures, and they are still on the dietitian's own panels
                (`meal-detail-panel.tsx`) where they are acted on.

                The meal's energy is here rather than on the summary row, where
                it used to ride as a pill. A closed row is the answer to "what am
                I eating and when"; a figure nobody asked for on every one of
                five of them made the day read as a budget, and the day's own
                total is already stated once above the list. Opening the card is
                where you have asked about *this* meal, so it is where the number
                belongs.
              */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  {/*
                    `text-heading-sm` (20px/600), not `text-lg` (18px): opened,
                    this line is the answer to the question the card exists to
                    answer — what to eat — so it takes the scale's "card title"
                    step rather than sitting one below it. The portion line under
                    it stays `text-sm`, the scale's description size, so the two
                    keep the same two-step gap `kcalValue`/`mealEnergyLabel` uses
                    on the other side of this row.
                  */}
                  <p className="font-heading text-heading-sm text-primary">{dish.nameAr}</p>
                  <p className="text-sm text-secondary-foreground">
                    {t('portion', { servings: dish.servings, label: dish.baseServingLabel })}
                  </p>
                </div>

                {/*
                  The same label-and-figure relationship the day's own tile above
                  the list uses, one step down: `text-sm` label under a
                  `text-base` semibold figure. Two steps of the scale as they come,
                  rather than a step with its weight overridden — a step owns its
                  weight (§Typography), and the pill this replaces was the only
                  place on the screen reaching past that.

                  `text-end`, not `text-start`: the figure and its label sit at the
                  inline-end of a row that reads from the other side, so they hang
                  off the edge they are against in both scripts.
                */}
                <p className="shrink-0 text-end">
                  <span className="block font-heading text-base font-semibold tabular-nums">
                    {t('kcalValue', { value: roundForDisplay('kcal', meal.totals.kcal.value) })}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {t('mealEnergyLabel')}
                  </span>
                </p>
              </div>

              {meal.rationaleAr ? (
                <p className="rounded-lg bg-muted px-4 py-3 text-center text-sm leading-relaxed text-muted-foreground">
                  {meal.rationaleAr}
                </p>
              ) : null}

              {meal.options.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{t('orInstead')}</p>
                  <ul className="flex flex-wrap gap-2">
                    {meal.options.map((option) => (
                      <li key={option.id}>
                        {/*
                          Default `Badge` — brand-subtle olive, which carries no
                          status meaning. `onTrack` would look identical and would be
                          claiming these alternatives are "on track" (§06).
                        */}
                        <Badge className="px-3 py-1">
                          {option.nameAr} ·{' '}
                          {t('kcalValue', { value: roundForDisplay('kcal', option.kcal) })}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/*
                The ingredient-and-gram list that used to close this card is gone.
                It was the longest thing in it — a dish runs to a dozen rows — and
                it is a recipe, which is a different document from a plan. The
                dish name and the portion say what to eat; the breakdown behind it
                remains on the dietitian's side, where it is what the arithmetic
                is checked against.

                `dish.ingredients` is still loaded and still summed: `foods` is
                what every calorie on this screen is derived from at read time
                (see `docs/architecture.md`), so the join stays whether or not it
                is drawn.
              */}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('noMeal')}</p>
          )}
        </div>
      </details>
    </Card>
  );
}
