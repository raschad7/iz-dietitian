'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import type { BoardMeal } from '../queries';

/**
 * How far a meal may sit from its budget before the card says so.
 *
 * The same 15% band `similar.ts` uses for substitution — a meal that would not
 * count as a swap for its own slot is a meal worth a second look.
 */
const TOLERANCE = 0.15;

/**
 * One meal in a day column.
 *
 * A button, not a div with a click handler: opening the detail panel is an action,
 * and it has to be reachable from the keyboard. `aria-pressed` carries the selected
 * state, which the ring alone does not.
 */
export function MealCard({
  meal,
  selected,
  onSelect,
}: {
  meal: BoardMeal;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('weeklyPlans');

  const kcal = roundForDisplay('kcal', meal.totals.kcal.value);
  const drift = meal.budgetKcal > 0 ? (kcal - meal.budgetKcal) / meal.budgetKcal : 0;
  const offTarget = meal.dish !== null && Math.abs(drift) > TOLERANCE;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'w-full rounded-md border p-2 text-start text-xs transition-colors',
        selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-accent/50',
        // An empty slot is a gap the dietitian has to close before publishing, so
        // it is marked as unfinished rather than merely blank.
        meal.dish === null && 'border-dashed bg-muted/40',
      )}
    >
      <span className="block truncate text-[10px] uppercase tracking-wide text-muted-foreground">
        {meal.label}
      </span>

      {meal.dish ? (
        <>
          <span className="mt-0.5 block font-medium leading-snug">{meal.dish.nameAr}</span>

          <span className="mt-0.5 flex items-baseline gap-1 text-[10px] text-muted-foreground">
            <span className={cn(offTarget && 'font-medium text-amber-600 dark:text-amber-500')}>
              {t('kcalValue', { value: kcal })}
            </span>
            {meal.budgetKcal > 0 && <span>/ {meal.budgetKcal}</span>}
          </span>
        </>
      ) : (
        <span className="mt-0.5 block leading-snug text-muted-foreground">{t('emptySlot')}</span>
      )}
    </button>
  );
}
