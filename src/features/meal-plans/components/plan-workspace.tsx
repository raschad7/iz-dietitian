'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { addMealAction } from '@/features/meal-plans/actions';
import { AnalysisPanel } from '@/features/meal-plans/components/analysis-panel';
import { CopyDayForm } from '@/features/meal-plans/components/copy-day-form';
import { MealBlock } from '@/features/meal-plans/components/meal-block';
import { WeekOverview } from '@/features/meal-plans/components/week-overview';
import { DAYS_OF_WEEK, dayKey } from '@/features/meal-plans/schema';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * `import type`, not `import { type … }`. Both erase in TypeScript, but only the
 * top-level form keeps `queries.ts` out of the bundler's client module graph —
 * with the inline form Turbopack follows it to `@/db` and tries to bundle
 * `postgres` for the browser, which fails on `node:net`.
 */
import type { PlanDetail } from '@/features/meal-plans/queries';

/**
 * The two halves of the meal-plan page: the week's schedule, and the analysis of
 * whatever is currently in focus.
 *
 * This is the only client component that holds state, and it holds exactly two
 * things — which day is open, and which meal within it is selected. Everything
 * else is server-rendered and re-fetched by `revalidatePath` after each edit, so
 * the totals on screen are always the totals in the database.
 */
export function PlanWorkspace({
  locale,
  plan,
  categories,
}: {
  locale: Locale;
  plan: PlanDetail;
  categories: string[];
}) {
  const t = useTranslations('mealPlans');

  /** null = the whole week. */
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [selectedMealId, setSelectedMealId] = useState<string | null>(null);

  /**
   * Both are resolved from the plan rather than stored, so a day or meal deleted
   * in another tab cannot leave the panel analysing something that is gone.
   */
  const day = openDay === null ? null : (plan.days[openDay] ?? null);
  const selectedMeal = day?.meals.find((meal) => meal.id === selectedMealId) ?? null;

  /**
   * The analysis scope, narrowest first. This is the whole of what "the analysis
   * part must be dynamic" means: one panel, three levels, and the level is
   * whatever the dietitian is currently looking at.
   */
  const scope = selectedMeal
    ? {
        totals: selectedMeal.totals,
        label: `${selectedMeal.timeOfDay} · ${selectedMeal.label}`,
        itemCount: selectedMeal.items.length,
      }
    : day
      ? {
          totals: day.totals,
          label: t(`days.${dayKey(day.dayOfWeek)}`),
          itemCount: day.meals.reduce((count, meal) => count + meal.items.length, 0),
        }
      : {
          totals: plan.totals,
          label: null,
          itemCount: plan.days.reduce(
            (count, each) => count + each.meals.reduce((n, meal) => n + meal.items.length, 0),
            0,
          ),
        };

  /** Days with something to lose, so `CopyDayForm` only warns when it matters. */
  const filledDays = plan.days
    .filter((each) => each.meals.some((meal) => meal.items.length > 0))
    .map((each) => each.dayOfWeek);

  const openWeek = () => {
    setOpenDay(null);
    setSelectedMealId(null);
  };

  const open = (dayOfWeek: number) => {
    setOpenDay(dayOfWeek);
    setSelectedMealId(null);
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {/* Part one: the schedule. */}
      <div className="space-y-4">
        <DayTabs openDay={openDay} onOpenWeek={openWeek} onOpenDay={open} />

        {day === null ? (
          <WeekOverview locale={locale} days={plan.days} onOpenDay={open} />
        ) : (
          <div className="space-y-3">
            <CopyDayForm
              locale={locale}
              planId={plan.id}
              fromDay={day.dayOfWeek}
              filledDays={filledDays}
            />

            {day.meals.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {t('emptySchedule')}
              </p>
            ) : (
              day.meals.map((meal) => (
                <MealBlock
                  key={meal.id}
                  locale={locale}
                  planId={plan.id}
                  meal={meal}
                  categories={categories}
                  selected={meal.id === selectedMealId}
                  onSelect={() => setSelectedMealId(meal.id === selectedMealId ? null : meal.id)}
                />
              ))
            )}

            <AddMealForm locale={locale} planId={plan.id} dayOfWeek={day.dayOfWeek} />
          </div>
        )}
      </div>

      {/*
       * Part two: the analysis. Sticky on a wide screen so it stays beside the
       * schedule while scrolling; it simply follows underneath on a narrow one.
       */}
      <aside className="lg:sticky lg:top-6">
        <AnalysisPanel
          locale={locale}
          totals={scope.totals}
          scope={scope.label}
          itemCount={scope.itemCount}
        />
      </aside>
    </div>
  );
}

/** Whole week, then the seven days. The one control that drives both halves. */
function DayTabs({
  openDay,
  onOpenWeek,
  onOpenDay,
}: {
  openDay: number | null;
  onOpenWeek: () => void;
  onOpenDay: (dayOfWeek: number) => void;
}) {
  const t = useTranslations('mealPlans');

  const tab = 'rounded-md px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50';
  const active = 'bg-primary text-primary-foreground';
  const idle = 'text-muted-foreground hover:bg-muted hover:text-foreground';

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border p-1">
      <button
        type="button"
        onClick={onOpenWeek}
        aria-pressed={openDay === null}
        className={cn(tab, openDay === null ? active : idle)}
      >
        {t('wholeWeek')}
      </button>

      <span aria-hidden className="mx-1 h-5 w-px bg-border" />

      {DAYS_OF_WEEK.map((dayOfWeek) => (
        <button
          key={dayOfWeek}
          type="button"
          onClick={() => onOpenDay(dayOfWeek)}
          aria-pressed={openDay === dayOfWeek}
          className={cn(tab, openDay === dayOfWeek ? active : idle)}
        >
          {t(`days.${dayKey(dayOfWeek)}`)}
        </button>
      ))}
    </div>
  );
}

/** Adds a block to the open day. Collapsed until asked for. */
function AddMealForm({
  locale,
  planId,
  dayOfWeek,
}: {
  locale: Locale;
  planId: string;
  dayOfWeek: number;
}) {
  const t = useTranslations('mealPlans');
  const tCommon = useTranslations('common');

  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t('actions.addMeal')}
      </Button>
    );
  }

  return (
    <form
      action={addMealAction}
      onSubmit={() => setOpen(false)}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="dayOfWeek" value={dayOfWeek} />

      <Input
        name="timeOfDay"
        type="time"
        required
        dir="ltr"
        defaultValue="21:00"
        className="w-32"
        aria-label={t('fields.timeOfDay')}
      />
      <Input
        name="label"
        required
        maxLength={60}
        placeholder={t('fields.mealLabel')}
        className="w-44"
        aria-label={t('fields.mealLabel')}
      />

      <Button type="submit" size="sm">
        {t('actions.addMeal')}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
        {tCommon('cancel')}
      </Button>
    </form>
  );
}
