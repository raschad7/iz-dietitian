'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { roundForDisplay } from '@/features/meal-plans/nutrition';
import type { BoardDay } from '../queries';
import { dayKey } from '../schema';

import { MealCard } from './meal-card';
import { RegenerateDayButton } from './regenerate-buttons';

/**
 * One day of the week, as a column of meal cards.
 *
 * The header carries the day's total against the daily target, coloured only when
 * it drifts — a board where every column is amber teaches the dietitian to ignore
 * the colour.
 */
export function DayColumn({
  day,
  dailyTarget,
  planId,
  locale,
  editable,
  selectedMealId,
  onSelectMeal,
}: {
  day: BoardDay;
  dailyTarget: number;
  planId: string;
  locale: string;
  editable: boolean;
  selectedMealId: string | null;
  onSelectMeal: (mealId: string) => void;
}) {
  const t = useTranslations('weeklyPlans');
  const tDays = useTranslations('mealPlans.days');

  const kcal = roundForDisplay('kcal', day.totals.kcal.value);
  const drift = dailyTarget > 0 ? (kcal - dailyTarget) / dailyTarget : 0;
  const offTarget = day.meals.length > 0 && Math.abs(drift) > 0.1;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="rounded-md bg-muted/60 px-2 py-1.5">
        <div className="flex items-baseline justify-between gap-1">
          <span className="truncate text-xs font-semibold">{tDays(dayKey(day.dayOfWeek))}</span>

          {editable && <RegenerateDayButton planId={planId} dayOfWeek={day.dayOfWeek} locale={locale} />}
        </div>

        <span className="mt-0.5 block text-micro text-muted-foreground">
          <span className={cn(offTarget && 'font-medium text-status-attention-fg')}>
            {t('kcalValue', { value: kcal })}
          </span>
          {dailyTarget > 0 && <span> / {dailyTarget}</span>}
        </span>
      </div>

      {day.meals.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-2 text-micro text-muted-foreground">
          {t('emptyDay')}
        </p>
      ) : (
        day.meals.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            selected={meal.id === selectedMealId}
            onSelect={() => onSelectMeal(meal.id)}
          />
        ))
      )}
    </div>
  );
}
