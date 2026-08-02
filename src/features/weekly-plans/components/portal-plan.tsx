import { useLocale, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon, type IconName } from '@/components/ui/icon';
import { formatLongDate } from '@/features/booking/format';
import { MACRO_KEYS, NUTRIENT_UNITS, roundForDisplay } from '@/features/weekly-plans/nutrition';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { PlanDayStrip } from './plan-day-strip';
import type { Board, BoardMeal } from '../queries';
import { dayKey, mealTypeForSlot, type MealType } from '../schema';
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
}: {
  board: Board;
  days: readonly PlanDaySummary[];
  selectedDay: number;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('portal.plan');
  const tDays = useTranslations('weeklyPlans.days');

  const day = board.days[selectedDay];
  const summary = days.find((entry) => entry.dayOfWeek === selectedDay);

  const meals = day?.meals ?? [];
  const dayKcal = day ? roundForDisplay('kcal', day.totals.kcal.value) : 0;

  return (
    <div className="space-y-8 text-start">
      <header className="space-y-1.5">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-base text-muted-foreground">
          {t('weekOf', { date: board.weekStartDate })}
        </p>
      </header>

      <PlanDayStrip days={days} selectedDay={selectedDay} locale={locale} />

      <section className="space-y-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="font-heading text-xl font-semibold">{tDays(dayKey(selectedDay))}</h3>
            {summary?.isToday ? <Badge>{t('today')}</Badge> : null}
          </div>

          {summary?.date ? (
            <p className="text-sm text-muted-foreground">{formatLongDate(locale, summary.date)}</p>
          ) : null}
        </div>

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
  const tNutrients = useTranslations('weeklyPlans.nutrients');
  const tPlans = useTranslations('weeklyPlans');

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
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-2.5 rounded-md px-2.5 py-2 outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo [&::-webkit-details-marker]:hidden">
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
          Plain `rounded-lg`, no sweep: the shell around it already carries the one
          tail this surface is allowed (design-system.md, "one tail per surface").
        */}
        <div className="mt-1.5 rounded-lg bg-card p-4">
          {dish ? (
            <div className="space-y-4">
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
                  A second, larger mark for the dish itself. Constant across dishes —
                  nothing in `dishes` carries an image or an icon, and inventing one
                  per dish would be inventing a fact about the food.
                */}
                <span
                  aria-hidden
                  className={cn(
                    'flex size-16 shrink-0 items-center justify-center rounded-lg',
                    MEAL_SHELL,
                  )}
                >
                  <Icon name="dish" className="size-7" />
                </span>
              </div>

              {/*
                The three macros, which `MACRO_KEYS` documents as the only nutrients
                present on every food. A total built partly from foods that were
                never measured is a floor rather than an answer, so it is marked
                with the same trailing `+` the dietitian's own panels use.
              */}
              <dl className="grid grid-cols-3 gap-2">
                {MACRO_KEYS.map((key) => {
                  const total = meal.totals[key];

                  return (
                    <div key={key} className="rounded-lg bg-muted px-2 py-2.5 text-center">
                      <dt className="text-sm text-muted-foreground">{tNutrients(key)}</dt>
                      <dd className="font-heading text-base font-semibold tabular-nums">
                        {roundForDisplay(key, total.value)} {NUTRIENT_UNITS[key]}
                        {total.unmeasured > 0 ? (
                          <span
                            className="text-muted-foreground"
                            title={tPlans('unmeasuredCount', { count: total.unmeasured })}
                          >
                            {' '}
                            +
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  );
                })}
              </dl>

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

              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">{t('ingredientsTitle')}</p>

                {/*
                  Striped rather than ruled: on a list this long, alternating fills
                  track the eye across a row without adding a border per line. No
                  longer behind its own disclosure — the card is the disclosure now,
                  and two levels of "open this to see" is one too many.
                */}
                <ul className="overflow-hidden rounded-lg text-sm">
                  {dish.ingredients.map((ingredient) => (
                    <li
                      key={ingredient.food.id}
                      className="flex items-baseline justify-between gap-4 px-3 py-2.5 even:bg-muted"
                    >
                      <span className="min-w-0 font-medium text-primary">
                        {ingredient.food.description}
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {t('grams', {
                          grams: roundForDisplay(
                            'protein',
                            ingredient.quantityGrams * dish.servings,
                          ),
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('noMeal')}</p>
          )}
        </div>
      </details>
    </Card>
  );
}
