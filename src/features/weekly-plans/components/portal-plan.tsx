import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon, type IconName } from '@/components/ui/icon';
import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import { cn } from '@/lib/utils';

import { MealCheck } from './meal-check';
import { SettledMealCheck } from './meal-check-mark';
import { PlanDayCompletionProvider } from './plan-day-completion';
import { PlanDayStrip } from './plan-day-strip';
import type { Board, BoardMeal } from '../queries';
import { mealTypeForSlot, type MealType } from '../schema';
import { dayStanding, type DayStanding, type PlanDaySummary } from '../week';

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
  today,
}: {
  board: Board;
  days: readonly PlanDaySummary[];
  selectedDay: number;
  /** Which of the selected day's meals are already ticked — see `loadPlanPage`. */
  completedMealIds: readonly string[];
  /** The clinic's own `YYYY-MM-DD`, read once per request — see `loadPlanPage`. */
  today: string;
}) {
  const t = useTranslations('portal.plan');

  const day = board.days[selectedDay];

  const meals = day?.meals ?? [];
  const dayKcal = day ? roundForDisplay('kcal', day.totals.kcal.value) : 0;
  const mealIds = meals.map((meal) => meal.id);

  /*
    Which of the three days this is, and therefore what a meal card may offer.

    Read off the *selected day's own date* rather than its weekday number: a
    published plan is not always the week today falls in, and Thursday is day 4
    whichever week it belongs to. `pickPlanDay` already learned this lesson —
    matching on the number alone would let last week's Thursday be ticked as
    though it were this one.
  */
  const standing = dayStanding(
    days.find((summary) => summary.dayOfWeek === selectedDay)?.date ?? null,
    today,
  );

  const completed = new Set(completedMealIds);

  const body = (
    <>
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
          <EmptyState icon="dish" title={t('emptyDayTitle')} description={t('emptyDayHint')} />
        ) : (
          <>
            {/*
              The day's own totals, stated rather than plotted. This is what the
              dietitian planned for the day, not what anyone has eaten — so it is
              labelled as the day's energy and never framed as progress against a
              goal the client has not been measured on.

              On the meal surface (`MEAL_SHELL`) rather than the brand-subtle
              `secondary` it used to sit on: it is the same material as the five
              cards below it, and it is a figure to read, not a thing to act on
              — see the `--meal-*` note in `globals.css` for why olive left this
              screen.

              It keeps that neutral surface on a settled day, while the meals
              below it may not. This is the dietitian's plan for the day — a
              figure that was true before anyone ate anything and stays true
              after — so tinting it with how the day went would be reporting
              against it, which is the one thing the label says it is not.
            */}
            <div
              className={cn(
                'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg px-4 py-3',
                MEAL_SHELL,
              )}
            >
              <span className="text-sm">{t('dayEnergyLabel')}</span>
              <span className="font-heading text-lg font-semibold tabular-nums">
                {t('kcalValue', { value: dayKcal })}
              </span>
            </div>

            <ul className="space-y-5">
              {meals.map((meal) => (
                <li key={meal.id}>
                  <MealCard meal={meal} standing={standing} completed={completed.has(meal.id)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );

  return (
    <div className="space-y-8 text-start">
      <header className="space-y-1.5">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-base text-muted-foreground">
          {t('weekOf', { date: board.weekStartDate })}
        </p>
      </header>

      {/*
        **The provider is only mounted on the day that can be edited**, and that
        is the whole switch: no `editable` flag threaded through it, no disabled
        branch inside `MealCheck`. A day with no provider has no `toggle` to
        reach, so a past or future day cannot be written to even by mistake.

        It also fixes the strip. `PlanDayStrip` overrides the open day's flame
        with the provider's live count so a tick moves it immediately — correct
        on today, and wrong on a future day, where a count of 0 out of 5 would
        redraw a day that has not happened as a day that was missed. With no
        provider there is nothing to override with, and the server's own
        `future` mark stands.

        Keyed on the day so switching days remounts it with the new day's own
        starting state, instead of carrying the previous day's ticks across —
        see the note on `PlanDayCompletionProvider`.
      */}
      {standing === 'today' ? (
        <PlanDayCompletionProvider
          key={selectedDay}
          dayOfWeek={selectedDay}
          mealIds={mealIds}
          initialCompletedMealIds={completedMealIds}
        >
          {body}
        </PlanDayCompletionProvider>
      ) : (
        body
      )}
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
 * One tone for every meal: what tells a breakfast from a dinner here is the icon
 * and the label, not the colour.
 */
const MEAL_SHELL = 'bg-meal-bg text-meal-fg';

/**
 * The shell a meal wears once its day has ended and it was ticked: the neutral
 * one, tinted olive-100.
 *
 * `status-on-track-bg` rather than a green invented for this — the palette
 * already owns a fill that means "this went the way it should", and the table in
 * §Status is where it is defined. It is one step off `MEAL_SHELL` (n-50), which
 * is the whole intent: a day you are looking back on should show its kept meals
 * at a glance without the list turning into a block of green.
 *
 * **The text stays `meal-fg`, and that is not an oversight.** The matching
 * `status-on-track-fg` would recolour the meal's name, its time and its dish to
 * olive-700 — a far louder change than a tint, and one that would make a
 * completed meal read as a different *kind* of thing rather than the same meal
 * in a settled state. n-900 on olive-100 measures **14.7:1** (§Status), so the
 * pair holds.
 *
 * The tick is the one thing that does take olive-700, and it has to: olive-500
 * on olive-100 is 2.96:1, under the 3:1 a graphical mark needs, which is exactly
 * the failure the `--meal-*` note in `globals.css` records having escaped by
 * lifting this surface off olive in the first place. See `SETTLED_TICK`.
 */
const SETTLED_SHELL = 'bg-status-on-track-bg text-meal-fg';

/** olive-700 on olive-100 — 6.51:1, the pair §Status verifies. */
const SETTLED_TICK = 'text-status-on-track-fg';

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
 *   than offered, and a completed meal's card carries `SETTLED_SHELL` so a
 *   glance down a past day separates what was kept from what was not without
 *   reading a single tick.
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
function MealCard({
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

  const settledAndKept = standing === 'past' && completed;

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
        'gap-0 p-1.5 transition-shadow hover:shadow-elevated',
        settledAndKept ? SETTLED_SHELL : MEAL_SHELL,
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
              className={settledAndKept ? SETTLED_TICK : undefined}
            />
          ) : null}

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
            Bare on the shell, with no disc behind it: a line glyph knocked out of
            a solid circle is a filled mark again, whatever the glyph is doing. It
            inherits `text-meal-fg`, the measured pair for this surface, and sits
            beside the chevron because the two together are now the row's quiet end
            — everything that identifies the meal is at the start, everything that
            is chrome is here.
          */}
          <Icon name={mealIcon} className="size-5 shrink-0" />

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
                  <p className="font-heading text-lg leading-snug font-semibold text-primary">
                    {dish.nameAr}
                  </p>
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
