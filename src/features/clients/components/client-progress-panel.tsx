import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import { formatMediumDate, formatWeekday } from '@/features/booking/format';
import { type ClientDayMeal, type ClientWeekProgress } from '@/features/clients/progress';
import { MEAL_ICONS } from '@/features/weekly-plans/components/portal-meal-card';
import { type PlanListEntry } from '@/features/weekly-plans/queries';
import { mealTypeForSlot } from '@/features/weekly-plans/schema';
import { type Locale } from '@/i18n/routing';
import { formatPercent } from '@/lib/format';
import { type IsoDate } from '@/lib/iso-date';
import { cn } from '@/lib/utils';

import { ClientProgressChart, type ProgressChartPoint } from './client-progress-chart';
import { ClientProgressRing } from './client-progress-ring';
import { ClientProgressWeekSelect } from './client-progress-week-select';

/**
 * The dietitian dashboard's Progress tab: one client's weekly and daily
 * adherence to their assigned plan, for the week the dietitian picks.
 *
 * Every figure on this panel is `ClientWeekProgress`, computed in
 * `features/clients/progress.ts` from `client_plan_adherence` — the exact
 * table and the exact arithmetic (`summariseAdherenceRun` in
 * `portal/adherence.ts`) the client's own portal reads. Nothing here derives
 * a percentage of its own, so a dietitian and the client reading the same
 * week can never disagree about what it says.
 */
export async function ClientProgressPanel({
  clientId,
  locale,
  weeks,
  progress,
  mealsByDay,
}: {
  clientId: string;
  locale: Locale;
  /** This client's plan weeks, newest first — the week selector's whole list. */
  weeks: PlanListEntry[];
  progress: ClientWeekProgress;
  /** The selected week's plan meals, keyed by day of week — the "which meals" detail per day. */
  mealsByDay: Map<number, ClientDayMeal[]>;
}) {
  const [t, tPlans] = await Promise.all([
    getTranslations('clients.progress'),
    getTranslations('weeklyPlans'),
  ]);

  if (weeks.length === 0) {
    return (
      <EmptyState icon="mealPlans" title={t('noWeeks.title')} description={t('noWeeks.body')} />
    );
  }

  /*
    `weeks` is `listPlans` — one row per **plan**, and a week can hold more
    than one (a draft beside an already-published one, or an old draft left
    over after a regeneration). The week picker is choosing a *week*, not a
    plan, so it collapses to one option per `weekStartDate` — first occurrence
    wins, and `listPlans` orders newest `updatedAt` first within a week, so
    that is the most current plan for it. Two `<SelectItem>`s sharing one
    `value` is invalid and was what broke picking an earlier week.
  */
  const weekOptions = Array.from(new Map(weeks.map((plan) => [plan.weekStartDate, plan])).values()).map((plan) => ({
    value: plan.weekStartDate,
    label: tPlans('weekOf', { date: formatMediumDate(locale, plan.weekStartDate) }),
  }));

  /*
    The week always reads left to right in the plotted order — Sunday first —
    regardless of `direction`. SVG lays a chart's own path out by array order
    no matter the page's `dir`, and Recharts' `reversed` axis prop only flips
    which end the *tick labels* render at, not reliably the plotted geometry
    underneath a category (band) scale, so mirroring the data for RTL used to
    keep the curve and its labels in agreement. The chart is drawn
    chronologically instead now: the first day of the week sits at the left
    in both languages, so a client's diary always climbs the same direction
    on the page it climbed in the calendar.
  */
  const chartData: ProgressChartPoint[] = progress.days.map((day) => ({
    label: formatWeekday(locale, day.date, 'short'),
    value: day.fraction === null ? null : Math.round(day.fraction * 100),
    mealsLabel: t('chart.mealsTooltip', { completed: day.completedMeals, total: day.totalMeals }),
    isToday: day.state === 'today',
  }));

  return (
    <div className="space-y-4" id={`client-${clientId}-progress`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body-sm text-muted-foreground">{t('weekLabel')}</p>
        <ClientProgressWeekSelect weeks={weekOptions} selected={progress.weekStartDate} />
      </div>

      {!progress.hasData ? (
        <EmptyState icon="mealPlans" title={t('empty.title')} description={t('empty.body')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle as="h2" icon="progress" size="sm">
                {t('summary.title')}
              </CardTitle>
            </CardHeader>

            <CardContent className="flex flex-col items-center gap-6 sm:flex-row">
              <ClientProgressRing fraction={progress.averageFraction} locale={locale} caption={t('summary.average')} />

              <StatGrid columns={3} className="w-full flex-1">
                <StatTile label={t('summary.recordedDays')} value={`${progress.recordedCount} / ${progress.dates.length}`} />
                <StatTile
                  label={t('summary.completedDays')}
                  value={`${progress.fullyCompletedCount} / ${progress.dates.length}`}
                />
                <StatTile
                  label={t('summary.meals')}
                  value={`${progress.totalCompletedMeals} / ${progress.totalPlannedMeals}`}
                />
              </StatGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2" size="sm">
                {t('chart.title')}
              </CardTitle>
              <CardDescription>{t('chart.subtitle')}</CardDescription>
            </CardHeader>

            <CardContent>
              <ClientProgressChart data={chartData} seriesLabel={t('chart.seriesLabel')} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle as="h2" size="sm">
                {t('days.title')}
              </CardTitle>
            </CardHeader>

            <CardContent className="divide-y divide-border">
              {progress.days.map((day) => (
                <DayRow
                  key={day.date}
                  date={day.date}
                  locale={locale}
                  fraction={day.fraction}
                  completedMeals={day.completedMeals}
                  totalMeals={day.totalMeals}
                  meals={mealsByDay.get(day.weekday) ?? []}
                />
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

async function DayRow({
  date,
  locale,
  fraction,
  completedMeals,
  totalMeals,
  meals,
}: {
  date: IsoDate;
  locale: Locale;
  fraction: number | null;
  completedMeals: number;
  totalMeals: number;
  /** This day's plan meals, named — empty when the day has no plan or no meals in it. */
  meals: ClientDayMeal[];
}) {
  const t = await getTranslations('clients.progress');
  const hasMeals = meals.length > 0;

  const summary = (
    <>
      <div className="min-w-0 sm:w-36 sm:shrink-0">
        <p className="font-medium text-foreground">{formatWeekday(locale, date, 'long')}</p>
        <p dir="auto" className="text-caption text-muted-foreground">
          {formatMediumDate(locale, date)}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Progress value={fraction === null ? 0 : Math.round(fraction * 100)} className="flex-1" />
        <span className="w-12 shrink-0 text-end text-body-sm font-medium tabular-nums text-foreground">
          {fraction === null ? '—' : formatPercent(locale, fraction)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:w-56 sm:justify-end">
        <span className="text-caption text-muted-foreground">
          {totalMeals > 0 ? t('days.meals', { completed: completedMeals, total: totalMeals }) : t('days.noMeals')}
        </span>
        {hasMeals ? (
          <Icon
            name="chevronDown"
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--duration-sweep) ease-(--ease-sweep) group-open:rotate-180"
          />
        ) : null}
      </div>
    </>
  );

  if (!hasMeals) {
    return (
      <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
        {summary}
      </div>
    );
  }

  return (
    // Native disclosure, the same idiom `PortalMealCard` uses: no client JS,
    // keyboard and find-in-page work for free, and "which meals were missed"
    // stays a click away rather than crowding the row by default.
    <details className="group q-disclosure py-3 first:pt-0 last:pb-0">
      <summary className="flex cursor-pointer list-none flex-col gap-2 rounded-md px-1 py-1 outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-focus-halo sm:flex-row sm:items-center sm:gap-4 [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>

      {/*
        Flush with the summary row above it, not indented under it — the same
        width the card's own edge already sets, so this reads as more of the
        card rather than a nested block quoted away from it.

        One flat `bg-muted/60` for the whole row — the meal icon and the
        record mark sit directly on it rather than on their own paler
        circles, so five rows read as one quiet list instead of each one
        carrying a second, whiter surface inside it.
      */}
      <div className="mt-2 space-y-1.5">
        {meals.map((meal) => (
          <div key={meal.id} className="flex items-center gap-2.5 rounded-lg bg-muted/60 px-2.5 py-2">
            <Icon
              name={MEAL_ICONS[mealTypeForSlot(meal.slotKey)]}
              className="size-4 shrink-0 text-muted-foreground"
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-caption font-medium text-foreground">{meal.label}</p>
              <p className="truncate text-caption text-muted-foreground">
                {meal.dishNameAr ?? t('days.unnamedMeal')}
              </p>
            </div>

            <MealRecordMark completed={meal.completed} label={meal.completed ? t('days.mealEaten') : t('days.mealNotEaten')} />
          </div>
        ))}
      </div>
    </details>
  );
}

/**
 * Whether a meal was eaten, stated rather than offered: `role="img"` and no
 * hover, cursor or focus ring, because this is a dietitian reading a past
 * week's record, not a control anyone here can tick — unlike the client's
 * own portal, where a past day's meal stays live (`MealCheck`,
 * `weekly-plans/components/meal-check.tsx`) so they can correct it
 * themselves. The dietitian's record of it is read-only regardless.
 *
 * A small outline ring rather than a filled disc: a solid green/red pair
 * reads as an alert pair, and a missed meal is not an error (§Design
 * principles — "Missing or incomplete data is not automatically an error").
 * Both states draw the same weight, an open circle with its own glyph inside
 * — a check in `status-on-track`, an × in a quiet neutral rather than clay,
 * which this app reserves for medical risk — so "eaten" and "not eaten" read
 * as two facts, not a pass/fail grade.
 */
function MealRecordMark({ completed, label }: { completed: boolean; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-full border-[1.5px]',
        completed
          ? 'border-status-on-track-fg text-status-on-track-fg'
          : 'border-muted-foreground/40 text-muted-foreground/50',
      )}
    >
      <Icon name={completed ? 'check' : 'close'} className="size-3" strokeWidth={2.75} />
    </span>
  );
}
