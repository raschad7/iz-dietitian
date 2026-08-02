'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import { nextSlotKey } from '../editor-state';
import type { BoardDay } from '../queries';
import { dayKey } from '../schema';

import { useEditorActions } from './board-dnd';
import { MealCard, type GhostMeal } from './meal-card';
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
  ghosts,
  compareDate,
}: {
  day: BoardDay;
  dailyTarget: number;
  planId: string;
  locale: string;
  editable: boolean;
  selectedMealId: string | null;
  onSelectMeal: (mealId: string) => void;
  /** The previous plan's dish for each slot key on this day, when compare is on. */
  ghosts?: Record<string, GhostMeal>;
  compareDate?: string;
}) {
  const t = useTranslations('weeklyPlans');
  const tDays = useTranslations('weeklyPlans.days');

  const kcal = roundForDisplay('kcal', day.totals.kcal.value);
  const drift = dailyTarget > 0 ? (kcal - dailyTarget) / dailyTarget : 0;
  const offTarget = day.meals.length > 0 && Math.abs(drift) > 0.1;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="rounded-md bg-muted/60 px-2 py-1.5">
        <div className="flex items-baseline justify-between gap-1">
          <span className="truncate text-xs font-semibold">{tDays(dayKey(day.dayOfWeek))}</span>

          {editable && (
            <RegenerateDayButton planId={planId} dayOfWeek={day.dayOfWeek} locale={locale} />
          )}
        </div>

        <span className="mt-0.5 block text-[10px] text-muted-foreground">
          <span className={cn(offTarget && 'font-medium text-status-attention-fg')}>
            {t('kcalValue', { value: kcal })}
          </span>
          {dailyTarget > 0 && <span> / {dailyTarget}</span>}
        </span>
      </div>

      {day.meals.length === 0 && !editable ? (
        <p className="rounded-md border border-dashed border-border p-2 text-[10px] text-muted-foreground">
          {t('emptyDay')}
        </p>
      ) : (
        day.meals.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            selected={meal.id === selectedMealId}
            onSelect={() => onSelectMeal(meal.id)}
            ghost={ghosts?.[meal.slotKey] ?? null}
            compareDate={compareDate}
            editable={editable}
          />
        ))
      )}

      {editable && <AddMeal day={day} />}
    </div>
  );
}

/**
 * Adds a slot to this day only.
 *
 * Label and time are asked for rather than defaulted: the dietitian is inventing a
 * meal that is not in the client's schedule, and a card reading "Meal 6" at 00:00
 * would be worse than one more small form.
 */
function AddMeal({ day }: { day: BoardDay }) {
  const t = useTranslations('weeklyPlans');
  const { add } = useEditorActions();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('17:00');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-dashed border-border p-1 text-[10px] text-muted-foreground hover:bg-accent"
      >
        + {t('addMeal')}
      </button>
    );
  }

  function submit(): void {
    const trimmed = label.trim();
    if (!trimmed) return;

    add(day.dayOfWeek, nextSlotKey(day.meals.map((meal) => meal.slotKey)), trimmed, time);
    setLabel('');
    setOpen(false);
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border p-1.5">
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder={t('addMeal')}
        maxLength={60}
        className="h-7 text-[11px]"
        autoFocus
      />

      <Input
        type="time"
        value={time}
        onChange={(event) => setTime(event.target.value)}
        className="h-7 text-[11px]"
      />

      <div className="flex gap-1">
        <Button type="button" size="sm" className="h-6 flex-1 text-[10px]" onClick={submit}>
          {t('save')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 text-[10px]"
          onClick={() => setOpen(false)}
        >
          {t('close')}
        </Button>
      </div>
    </div>
  );
}
