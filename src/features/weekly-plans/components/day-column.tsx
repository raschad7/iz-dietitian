'use client';

import { useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getLocaleDirection } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import { bandGeometry } from '../band';
import type { BoardRow } from '../board-rows';
import { nextSlotKey } from '../editor-state';
import { MEAL_ICON_OPTIONS } from '../meal-icons';
import type { BoardDay } from '../queries';
import { dayKey } from '../schema';

import { useEditorActions } from './board-dnd';
import { MealCard, type GhostMeal } from './meal-card';

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
 * The header carries the day's total, coloured only when it drifts off the daily
 * target — a board where every column is amber teaches the dietitian to ignore
 * the colour.
 */
export function DayColumn({
  day,
  date,
  namesMonth,
  rows,
  dailyTarget,
  editable,
  selectedMealId,
  onSelectMeal,
  ghosts,
  compareDate,
  showOnPhone,
}: {
  day: BoardDay;
  /** This column's calendar date, `YYYY-MM-DD`. Null if the plan's start is unreadable. */
  date: string | null;
  /** Whether this column prints its month as well as the day number. */
  namesMonth: boolean;
  /** The week's rows, so every column renders the same ones in the same order. */
  rows: readonly BoardRow[];
  dailyTarget: number;
  editable: boolean;
  selectedMealId: string | null;
  onSelectMeal: (mealId: string, anchor: HTMLButtonElement) => void;
  /**
   * Whether this is the day the phone is showing. Below `md` the week is one
   * column chosen from the strip above it.
   */
  showOnPhone: boolean;
  /** The previous plan's dish for each slot key on this day, when compare is on. */
  ghosts?: Record<string, GhostMeal>;
  compareDate?: string;
}) {
  const t = useTranslations('weeklyPlans');
  const tDays = useTranslations('weeklyPlans.days');
  const format = useFormatter();

  const dayName = tDays(dayKey(day.dayOfWeek));
  const kcal = roundForDisplay('kcal', day.totals.kcal.value);
  // A day with no meals has not missed its target, it has nothing to measure —
  // colouring a total of zero "under" would claim otherwise. Only `state` is
  // read now that the band itself is gone; the geometry it also returns is
  // computed and dropped, which is cheap and keeps one definition of drift.
  const band = day.meals.length > 0 ? bandGeometry(kcal, dailyTarget) : null;

  return (
    /* A subgrid of the week's rows rather than seven days flattened into one
       grid: the per-day grouping is what carries the drop targets and the
       order a screen reader reads a column in.
       `row-span-full` is `grid-row: 1 / -1` — a subgrid only inherits the tracks
       it actually spans, so the span has to cover the whole template. No gap
       here: the parent's row gutter is inherited, and restating it is how the
       two come apart. `grid-cols-1` is `minmax(0,1fr)`, not the implicit `auto`
       column a bare `grid` would generate — an auto column takes its width from
       the widest card, which is the raggedness this whole change removes.

       Hiding six days on a phone does not disturb any of that. The row template
       lives on the parent, so the visible column still spans and subgrids the
       same tracks; a `display: none` day generates no grid
       item at all. */
    <div
      className={cn(
        'planner-day-column row-span-full grid min-w-0 grid-cols-1 grid-rows-subgrid',
        !showOnPhone && 'max-md:hidden',
      )}
    >
      {/* Opaque, not `/95` with a blur behind it. A translucent sticky header
          over a scrolling column lets the cards ghost through the day name at
          exactly the moment the header is doing its one job, and the blur was
          paying for the smear. `px-3` matches the cards below it, so the day
          name and every meal label share one inline-start edge down the
          column — at `px-2` they were 4px out of line. */}
      <div className="sticky top-0 z-10 bg-background px-3 pb-1 pt-0">
        <div className="flex items-center justify-center gap-1.5">
          {/* A step above the total under it. Both were within 1px and both
              semibold, so the week had nothing to be scanned by.

              Centred over its column: the day name is the column's title now
              that the cards under it no longer carry any of their own.

              16px at 500, where this was 14px at 700. A column heading is read
              at a glance from across seven columns, and bold-at-14 was doing
              that job by weight rather than by size — which makes a row of seven
              headings look heavy without making any one of them easier to pick
              out. Size carries it now, and the lighter weight leaves the day
              name clearly ahead of the figures under it without shouting. */}
          <span className="min-w-0 flex-1 truncate text-center text-body-md font-medium">
            {dayName}
          </span>
        </div>

        {/*
          The calendar date, under the day name.

          `namesMonth` is the whole idea: printing "أغسطس" over all seven columns
          says the same word seven times and adds nothing, but never printing it
          leaves a week that ends on the 2nd unreadable. So the month appears at
          the start of the week and again wherever the week crosses into the next
          one — exactly the places a bare day number could be misread — and the
          other five columns carry the number alone. See `planColumnDates`.
        */}
        {date && (
          <span className="mt-0.5 block text-center text-caption text-muted-foreground" dir="auto">
            {format.dateTime(new Date(`${date}T00:00:00`), {
              day: 'numeric',
              ...(namesMonth ? { month: 'short' } : {}),
            })}
          </span>
        )}

        {/* The total, and — when the day misses the target — an arrow and the
            attention colour. The arrow is decorative; the amber figure beside
            it already carries the meaning, and labelling both makes a screen
            reader say it twice.

            There is no band under it any more. Seven of them across the top of
            the board was seven six-pixel graphics competing with the seven
            figures they restated, in the one strip that has to stay scannable.
            The drift state they were drawn to show is on the figure itself. */}
        <span
          className={cn(
            'mt-0.5 flex items-baseline justify-center gap-1 text-label font-medium',
            band?.state ? 'font-bold text-status-attention-fg' : 'text-muted-foreground',
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

        {/* A day with nothing in it has no total worth printing, so it prints
            the target instead — the dietitian looking at an unplanned column is
            the one who most needs to know what it has to add up to. */}
        {!band && dailyTarget > 0 && (
          <span className="mt-1 block text-center text-caption text-muted-foreground">
            {t('dailyTargetShort', { value: dailyTarget })}
          </span>
        )}
      </div>

      {/* One cell per row of the week, in the week's order — not this day's own
          meals in their own order. That is what keeps the slot rail honest: row
          three is غداء in all seven columns because every column renders row
          three, whether or not this particular day carries it. */}
      {rows.map((row, rowIndex) => {
        const meal = row.mealByDay.get(day.dayOfWeek);

        return (
          <div
            key={row.slotKey}
            className="planner-row-cell"
            data-first-row={rowIndex === 0 || undefined}
          >
            {meal ? (
              <MealCard
                meal={meal}
                selected={meal.id === selectedMealId}
                onSelect={(anchor) => onSelectMeal(meal.id, anchor)}
                ghost={ghosts?.[meal.slotKey] ?? null}
                compareDate={compareDate}
                editable={editable}
              />
            ) : (
              <SkippedSlot row={row} dayOfWeek={day.dayOfWeek} editable={editable} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A row this day does not carry.
 *
 * The plan's slots are the client's schedule, so at first every day has every
 * row and none of these are drawn. One appears when a slot is removed from a
 * single day — a client who does not eat lunch on Fridays — and it is what lets
 * that happen without the rest of the column sliding up a row and putting
 * dinner under the lunch label.
 *
 * Empty rather than apologetic: it is a fact about the plan, not a gap someone
 * forgot. While the plan is editable it is also the way back, because the same
 * `add` that restores it is the one the slot was removed with.
 */
function SkippedSlot({
  row,
  dayOfWeek,
  editable,
}: {
  row: BoardRow;
  dayOfWeek: number;
  editable: boolean;
}) {
  const t = useTranslations('weeklyPlans');
  const { add } = useEditorActions();

  if (!editable) {
    return <div aria-hidden className="rounded-lg border border-dashed border-border/60" />;
  }

  return (
    <button
      type="button"
      onClick={() => add(dayOfWeek, row.slotKey, row.label, row.timeOfDay)}
      // Named for what it restores, not "add" — there are seven of these in a
      // column and a screen reader hearing "add" seven times learns nothing.
      aria-label={t('restoreSlot', { slot: row.label })}
      title={t('restoreSlot', { slot: row.label })}
      className="group/skip grid place-items-center rounded-lg border border-dashed border-border/60 text-muted-foreground transition-colors hover:border-primary hover:bg-secondary hover:text-primary"
    >
      <Icon
        name="add"
        className="size-4 opacity-0 transition-opacity group-hover/skip:opacity-100 group-focus-visible/skip:opacity-100 max-md:opacity-60"
      />
    </button>
  );
}

/**
 * Adds a slot to the whole week.
 *
 * Week-wide, because the board draws slots as rows: a slot on Tuesday alone is
 * a row whose label describes one cell in seven. A day that turns out not to
 * need it loses it individually afterwards, which leaves a `SkippedSlot` above
 * rather than a ragged column.
 *
 * Label and time are asked for rather than defaulted: the dietitian is
 * inventing a meal that is not in the client's schedule, and a row reading
 * "Meal 6" at 00:00 would be worse than one more small form.
 */
export function AddSlot({ rows }: { rows: readonly BoardRow[] }) {
  const t = useTranslations('weeklyPlans');
  const activeLocale = useLocale();
  const { addWeek } = useEditorActions();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('17:00');
  const [mealIconId, setMealIconId] = useState<(typeof MEAL_ICON_OPTIONS)[number]['id']>('snack');

  function submit(): void {
    const trimmed = label.trim();
    if (!trimmed) return;

    const iconChoice =
      MEAL_ICON_OPTIONS.find((option) => option.id === mealIconId) ?? MEAL_ICON_OPTIONS[2];

    addWeek(
      nextSlotKey(rows.map((row) => row.slotKey), iconChoice.type, iconChoice.slotPrefix),
      trimmed,
      time,
    );
    setLabel('');
    setTime('17:00');
    setMealIconId('snack');
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={LAST_ROW}
        className="mx-1 mb-1 grid place-items-center rounded-lg border border-dashed border-border py-1 text-caption text-muted-foreground transition-colors hover:border-primary hover:bg-secondary hover:text-secondary-foreground"
      >
        <Icon name="add" className="size-4" />
        {t('addMeal')}
      </button>

      {/*
       * A dialog, not an inline form.
       *
       * The form used to open *inside* this cell — which is a column of the
       * board sized to the word "فطور", about 80px. Two fields and two buttons
       * cannot live there: they overflowed the rail, pushed the grid, and the
       * time input rendered its own picker wider than the whole column. The
       * control belongs on the rail because what it adds is a row; the form it
       * opens does not have to.
       */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        label={t('addMeal')}
        dir={getLocaleDirection(activeLocale)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader title={t('addMeal')} description={t('addMealHint')} />

          <DialogBody className="flex flex-col gap-4">
            <Field>
              <Label htmlFor="add-slot-label">{t('addMealLabel')}</Label>
              <Input
                id="add-slot-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t('addMealPlaceholder')}
                maxLength={60}
                autoFocus
                required
              />
            </Field>

            <Field>
              <Label htmlFor="add-slot-time">{t('addMealTime')}</Label>
              <Input
                id="add-slot-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                required
              />
            </Field>

            <fieldset className="space-y-2">
              <legend className="text-label font-semibold">{t('addMealIcon')}</legend>
              <div className="grid grid-cols-4 gap-2">
                {MEAL_ICON_OPTIONS.map((option) => {
                  const selected = option.id === mealIconId;

                  return (
                    <Button
                      key={option.id}
                      type="button"
                      variant="neutral"
                      aria-pressed={selected}
                      aria-label={t(`mealIconChoices.${option.id}`)}
                      onClick={() => setMealIconId(option.id)}
                      className={cn(
                        'aspect-square h-auto min-h-16 max-w-none p-0',
                        selected &&
                          'border-primary bg-secondary text-primary ring-2 ring-primary ring-offset-2 ring-offset-background',
                      )}
                    >
                      <Icon name={option.icon} className="size-10" />
                    </Button>
                  );
                })}
              </div>
            </fieldset>
          </DialogBody>

          <DialogFooter>
            {/* Source order, so the primary sits at the inline-start of the
                group in both locales — see docs/design-system.md § Buttons. */}
            <Button type="submit" disabled={label.trim().length === 0}>
              {t('save')}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('close')}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}

/**
 * Removes a slot from every day of the week.
 *
 * The counterpart to `AddSlot`, and it lives on the same axis for the same
 * reason: what it removes is a row. Removing the slot from one day is a
 * different action with a different control — the meal's own detail panel —
 * and it leaves a `SkippedSlot` behind rather than closing the row.
 *
 * It confirms, because it is the one edit on this board that cannot be undone
 * by dragging something back: seven meals go at once, and any dish in them goes
 * with them.
 */
function RemoveSlot({ row }: { row: BoardRow }) {
  const t = useTranslations('weeklyPlans');
  const { removeWeek } = useEditorActions();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm(t('removeSlotConfirm', { slot: row.label }))) removeWeek(row.slotKey);
      }}
      aria-label={t('removeSlot', { slot: row.label })}
      title={t('removeSlot', { slot: row.label })}
      className="absolute end-0.5 top-0.5 rounded-full p-1 text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-destructive-subtle hover:text-destructive focus-visible:opacity-100 group-hover/slot:opacity-100 max-md:opacity-60"
    >
      <Icon name="trash" className="size-3.5" />
    </button>
  );
}

export { RemoveSlot };
