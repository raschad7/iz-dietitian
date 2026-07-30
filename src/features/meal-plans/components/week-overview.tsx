'use client';

import { useTranslations } from 'next-intl';

import { roundForDisplay } from '@/features/meal-plans/nutrition';
import type { PlanDay } from '@/features/meal-plans/queries';
import { dayKey } from '@/features/meal-plans/schema';
import { formatNumber } from '@/lib/format';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The week at a glance. Each day is a button into that day's schedule.
 *
 * A read-only summary on purpose: seven editable days at once would be an
 * unreadable wall, and editing is what the day view is for. This answers "how
 * does the week look" — the question you open a weekly plan to ask.
 */
export function WeekOverview({
  locale,
  days,
  onOpenDay,
}: {
  locale: Locale;
  days: PlanDay[];
  onOpenDay: (dayOfWeek: number) => void;
}) {
  const t = useTranslations('mealPlans');

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {days.map((day) => {
        const itemCount = day.meals.reduce((count, meal) => count + meal.items.length, 0);

        return (
          <button
            key={day.dayOfWeek}
            type="button"
            onClick={() => onOpenDay(day.dayOfWeek)}
            className={cn(
              'rounded-lg border p-3 text-start transition-colors outline-none',
              'hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50',
              itemCount === 0 ? 'border-dashed border-border' : 'border-border',
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{t(`days.${dayKey(day.dayOfWeek)}`)}</span>
              <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">
                {formatNumber(locale, roundForDisplay('kcal', day.totals.kcal.value))} kcal
              </span>
            </div>

            {itemCount === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{t('emptyDay')}</p>
            ) : (
              <ul className="mt-2 space-y-0.5">
                {day.meals
                  .filter((meal) => meal.items.length > 0)
                  .map((meal) => (
                    <li key={meal.id} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="truncate text-muted-foreground">
                        <span className="tabular-nums" dir="ltr">
                          {meal.timeOfDay}
                        </span>{' '}
                        {meal.label}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground" dir="ltr">
                        {formatNumber(locale, roundForDisplay('kcal', meal.totals.kcal.value))}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </button>
        );
      })}
    </div>
  );
}
