'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { ComfortBand } from '@/components/ui/comfort-band';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import { bandGeometry } from '../band';
import { nextSlotKey } from '../editor-state';
import type { BoardDay } from '../queries';
import { dayKey } from '../schema';

import { useEditorActions } from './board-dnd';
import { MealCard, type GhostMeal } from './meal-card';
import { RegenerateDayButton } from './regenerate-buttons';

/**
 * Pins the add control to the last row of the week's grid.
 *
 * Everything else in the column is auto-placed, which is right for the header and
 * the cards. The add control is not: a day holding fewer meals than the week's
 * longest would place it one row early and end out of line with its neighbours.
 * `-2 / -1` is the last row of whatever template the column inherited, so it does
 * not need to know the slot count.
 */
const LAST_ROW = { gridRow: '-2 / -1' } as const;

/**
 * One day of the week, as a column of meal cards.
 *
 * The header carries the day's total and a band drawn against the daily target,
 * coloured only when it drifts — a board where every column is amber teaches the
 * dietitian to ignore the colour.
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
  showOnPhone,
}: {
  day: BoardDay;
  dailyTarget: number;
  planId: string;
  locale: string;
  editable: boolean;
  selectedMealId: string | null;
  onSelectMeal: (mealId: string) => void;
  /**
   * Whether this is the day the phone is showing. Below `md` the week is one
   * column, chosen from the strip above it; the other six are `display: none`
   * and so generate no grid item at all, which is what lets the survivor take
   * the single column rather than a seventh of seven.
   */
  showOnPhone: boolean;
  /** The previous plan's dish for each slot key on this day, when compare is on. */
  ghosts?: Record<string, GhostMeal>;
  compareDate?: string;
}) {
  const t = useTranslations('weeklyPlans');
  const tDays = useTranslations('weeklyPlans.days');

  const dayName = tDays(dayKey(day.dayOfWeek));
  const kcal = roundForDisplay('kcal', day.totals.kcal.value);
  // A day with no meals has not missed its target, it has nothing to measure —
  // drawing a band hard against zero would claim otherwise.
  const band = day.meals.length > 0 ? bandGeometry(kcal, dailyTarget) : null;

  return (
    /* A subgrid of the week's rows rather than seven days flattened into one
       grid: the per-day grouping is what carries the drop targets, the day's
       regenerate control, and the order a screen reader reads a column in.
       `row-span-full` is `grid-row: 1 / -1` — a subgrid only inherits the tracks
       it actually spans, so the span has to cover the whole template. No gap
       here: the parent's row gutter is inherited, and restating it is how the
       two come apart. `grid-cols-1` is `minmax(0,1fr)`, not the implicit `auto`
       column a bare `grid` would generate — an auto column takes its width from
       the widest card, which is the raggedness this whole change removes.

       Hiding the other six below `md` does not disturb any of that. The row
       template lives on the parent, so the one column left over still spans it
       and still subgrids the same tracks; a `display: none` day generates no
       grid item at all, which is what lets the survivor take the whole single
       column instead of a seventh of it. */
    <div
      className={cn(
        'row-span-full grid min-w-0 grid-cols-1 grid-rows-subgrid',
        !showOnPhone && 'max-md:hidden',
      )}
    >
      <div className="rounded-lg bg-muted/60 px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-1.5">
          <span className="truncate text-body-sm font-semibold">{dayName}</span>

          {editable && (
            <RegenerateDayButton planId={planId} dayOfWeek={day.dayOfWeek} locale={locale} />
          )}
        </div>

        {/* The total alone. The target is what the band underneath is drawn
            against, so printing it seven more times says the same thing twice.
            The arrow is decorative — the amber figure beside it already carries
            the meaning, and labelling both makes a screen reader say it twice. */}
        <span
          className={cn(
            'mt-0.5 flex items-baseline gap-1 text-label',
            band?.state ? 'font-semibold text-status-attention-fg' : 'text-muted-foreground',
          )}
        >
          {band?.state && (
            <Icon
              name={band.state === 'over' ? 'driftUp' : 'driftDown'}
              className="size-3.5 self-center"
            />
          )}
          {t('kcalValue', { value: kcal })}
        </span>

        {band ? (
          <ComfortBand
            rangeStart={band.rangeStart}
            rangeWidth={band.rangeWidth}
            marker={band.marker}
            offTarget={band.state !== null}
            label={t('dayBandLabel', { day: dayName })}
            valueText={t('dayBandValue', { value: kcal, target: dailyTarget })}
            className="mt-2"
          />
        ) : (
          /* No band on a day with nothing in it — "under target" is not news
             about a day nobody has planned yet. But the target is what the band
             would have carried, and the dietitian looking at an unplanned day is
             the one who most needs it, so print it. */
          dailyTarget > 0 && (
            <span className="mt-1 block text-caption text-muted-foreground">
              {t('dailyTargetShort', { value: dailyTarget })}
            </span>
          )
        )}
      </div>

      {day.meals.length === 0 && !editable ? (
        /* Spans every meal row rather than auto-placing into the first one. The
           tracks are shared, so the lines would stay put either way — but the
           column would read as a small dashed box followed by a void the height
           of its neighbours' cards. This branch is `!editable`-only, so the
           template has no trailing add row and `-1` is the last meal row's end
           line; under `editable` the same span would swallow the add control. */
        <p
          style={{ gridRow: '2 / -1' }}
          className="rounded-lg border border-dashed border-border p-3 text-label text-muted-foreground"
        >
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
        style={LAST_ROW}
        className="h-10 rounded-lg border border-dashed border-border text-label text-muted-foreground hover:bg-accent"
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
    <div style={LAST_ROW} className="flex flex-col gap-1.5 rounded-lg border border-border p-1.5">
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder={t('addMeal')}
        maxLength={60}
        autoFocus
      />

      <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />

      <div className="flex gap-1.5">
        <Button type="button" size="sm" className="flex-1" onClick={submit}>
          {t('save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t('close')}
        </Button>
      </div>
    </div>
  );
}
