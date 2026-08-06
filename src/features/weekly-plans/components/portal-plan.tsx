import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon, type IconName } from '@/components/ui/icon';
import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import { cn } from '@/lib/utils';

import { MealCheck } from './meal-check';
import { PlanDayCompletionProvider } from './plan-day-completion';
import { PlanDayStrip } from './plan-day-strip';
import type { Board, BoardMeal } from '../queries';
import { mealTypeForSlot, type MealType } from '../schema';
import { type PlanDaySummary } from '../week';

/**
 * The client's own view of their published week.
 *
 * Three movements, each given room to be one thing: what the week is for, which
 * day is being read, and what that day holds. The dietitian's board is a planning
 * tool that shows a whole week at once; this is a shopping list and a daily
 * reminder, read on a phone, so it shows one day properly rather than seven
 * badly.
 *
 * **Separated by surface, not by rule.** Almost nothing here draws a border. The
 * page is a stack of filled cards and tinted blocks on a sunken canvas, which is
 * what keeps it calm at this density — a divider under every heading and a rule
 * beside every note reads as a form, not as a plan someone wrote for you.
 *
 * Read-only by design. The alternatives are shown as "you can eat this instead" —
 * the feature that makes a plan survive a real week — but nothing writes back, so
 * the plan the dietitian published stays the plan of record.
 *
 * Everything is drawn from the board. A day with no meals renders as a day with
 * no meals; nothing is invented to fill the space.
 */
export function PortalPlan({
  board,
  days,
  selectedDay,
  completedMealIds,
}: {
  board: Board;
  days: readonly PlanDaySummary[];
  selectedDay: number;
  /** Which of the selected day's meals are already ticked — see `loadPlanPage`. */
  completedMealIds: readonly string[];
}) {
  const t = useTranslations('portal.plan');

  const day = board.days[selectedDay];

  const meals = day?.meals ?? [];
  const dayKcal = day ? roundForDisplay('kcal', day.totals.kcal.value) : 0;
  const mealIds = meals.map((meal) => meal.id);

  return (
    <div className="space-y-8 text-start">
      <header className="space-y-1.5">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-base text-muted-foreground">
          {t('weekOf', { date: board.weekStartDate })}
        </p>
      </header>

      {/*
        Keyed on the day so switching days remounts this with the new day's
        own starting state, instead of carrying the previous day's ticks
        across — see the note on `PlanDayCompletionProvider`.
      */}
      <PlanDayCompletionProvider
        key={selectedDay}
        dayOfWeek={selectedDay}
        mealIds={mealIds}
        initialCompletedMealIds={completedMealIds}
      >
        <PlanDayStrip days={days} selectedDay={selectedDay} />

        {/*
          No day heading here, deliberately.

          It used to repeat the selected day's name and full date directly under
          the strip that had just been tapped to choose them — and the strip marks
          its selection with a solid olive fill and its today with a badge, so the
          heading restated, one line lower, the only two facts already drawn above
          it. What follows the strip is the day's meals, and they start immediately.
        */}
        <section className="space-y-4">
          {meals.length === 0 ? (
            <EmptyState
              icon="dish"
              title={t('emptyDayTitle')}
              description={t('emptyDayHint')}
            />
          ) : (
            <>
              {/*
                The day's own totals, stated rather than plotted. This is what the
                dietitian planned for the day, not what anyone has eaten — so it is
                labelled as the day's energy and never framed as progress against a
                goal the client has not been measured on.
              */}
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-secondary px-4 py-3 text-secondary-foreground">
                <span className="text-sm">{t('dayEnergyLabel')}</span>
                <span className="font-heading text-lg font-semibold tabular-nums">
                  {t('kcalValue', { value: dayKcal })}
                </span>
              </div>

              <ul className="space-y-5">
                {meals.map((meal) => (
                  <li key={meal.id}>
                    <MealCard meal={meal} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </PlanDayCompletionProvider>
    </div>
  );
}

/**
 * The icon a meal carries, from the slot it fills.
 *
 * Keyed on `mealTypeForSlot`, the same stem match the generator uses to pick a
 * dish for a slot — so a dietitian who names a slot `snack_3` gets the snack icon
 * without anything here having to know about it. Time-of-day metaphors rather
 * than specific foods: the plan's dishes are Palestinian, and a croissant is not
 * what breakfast looks like here.
 */
const MEAL_ICONS = {
  breakfast: 'mealBreakfast',
  snack: 'mealSnack',
  lunch: 'mealLunch',
  dinner: 'mealDinner',
} as const satisfies Record<MealType, IconName>;

/**
 * The meal card's surface, and the same pair inverted for the icon disc — see the
 * `--meal-*` block in `globals.css`.
 *
 * One tone for every meal: what tells a breakfast from a dinner here is the icon
 * and the label, not the colour. Being the same pair either way round, the disc
 * carries the same measured contrast as the text on the shell.
 */
const MEAL_SHELL = 'bg-meal-bg text-meal-fg';
const MEAL_BADGE = 'bg-meal-fg text-meal-bg';

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
 */
function MealCard({ meal }: { meal: BoardMeal }) {
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
    <Card className={cn('gap-0 p-1.5 transition-shadow hover:shadow-elevated', MEAL_SHELL)}>
      <details className="q-disclosure group">
        {/*
          The whole row is the control — 56px tall and full width, so it is a
          target that cannot be missed rather than a chevron that has to be aimed
          at. `list-none` plus the WebKit marker rule removes the default triangle
          in every engine.
        */}
        {/*
          `gap-2` rather than `gap-2.5`: the row gained a fifth element with the
          check, and eight pixels of it came back out of the four gaps.
        */}
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2 rounded-md px-2.5 py-2 outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo [&::-webkit-details-marker]:hidden">
          {/*
            The shell's own pair, inverted: a dark disc on the three light tones and
            a light one on the deep tone, from a single rule. Same pair either way
            round, so the contrast is the measured one.
          */}
          <span
            aria-hidden
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full',
              MEAL_BADGE,
            )}
          >
            <Icon name={mealIcon} className="size-4.5" />
          </span>

          {/*
            `span`, not `p`: a <summary> takes phrasing content, so a paragraph
            inside it is invalid markup that browsers then reflow unpredictably.
          */}
          <span className="min-w-0 flex-1">
            <span className="block font-heading text-base leading-snug font-semibold">
              {meal.label}
            </span>
            <span className="block truncate text-sm">
              {/* `dir="ltr"`: a clock time reads the same way in both languages. */}
              <span dir="ltr" className="tabular-nums">
                {meal.timeOfDay}
              </span>
              {dish ? ` · ${dish.nameAr}` : null}
            </span>
          </span>

          {/*
            Solid, with its own foreground: inheriting the shell's text colour would
            put the dinner card's near-white numerals on a near-white pill.
          */}
          <span className="shrink-0 rounded-full bg-card px-2.5 py-1 font-heading text-sm font-semibold text-foreground tabular-nums">
            {t('kcalValue', { value: roundForDisplay('kcal', meal.totals.kcal.value) })}
          </span>

          {/*
            The tick sits at the inline-end, nearest the thumb, so the meal's own
            mark keeps leading the row. It stores nothing yet — see `meal-check.tsx`.

            Its label names the meal, because five identical "mark as eaten"
            buttons on one screen give a screen reader no way to tell which is
            which.
          */}
          <MealCheck mealId={meal.id} label={t('markEaten', { meal: meal.label })} />

          {/*
            `chevronDown` is not in `DIRECTIONAL`, and correctly so: it points
            down in both scripts, and mirroring it would be mirroring nothing.
            The rotation rides the system's sweep tokens rather than a literal.
          */}
          <Icon
            name="chevronDown"
            className="size-4 shrink-0 transition-transform duration-(--duration-sweep) ease-(--ease-sweep) group-open:rotate-180"
          />
        </summary>

        {/*
          Plain `rounded-lg` on a bare fill: this is a panel inside the shell
          around it, not a card in its own right.
        */}
        <div className="mt-1.5 rounded-lg bg-card p-4">
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
                (`meal-detail-panel.tsx`) where they are acted on. The meal's
                energy stays — it is on the summary row above, where it can be
                read without opening the card at all.
              */}
              <div className="min-w-0 space-y-1">
                <p className="font-heading text-lg leading-snug font-semibold text-primary">
                  {dish.nameAr}
                </p>
                <p className="text-sm text-secondary-foreground">
                  {t('portion', { servings: dish.servings, label: dish.baseServingLabel })}
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
