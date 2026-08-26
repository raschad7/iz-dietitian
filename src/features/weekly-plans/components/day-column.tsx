'use client';

import { useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogBody, DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Label } from '@/components/ui/label';
import { SelectField } from '@/components/ui/select-field';
import { TimeInput } from '@/components/ui/time-input';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { roundForDisplay } from '@/features/weekly-plans/nutrition';
import { bandGeometry } from '../band';
import type { BoardRow } from '../board-rows';
import { nextSlotKey } from '../editor-state';
import { MEAL_ICON_OPTIONS, MEAL_NAME_SUGGESTIONS } from '../meal-icons';
import type { BoardDay } from '../queries';
import { dayKey } from '../schema';

import { useEditorActions } from './board-dnd';
import { MealCard, type GhostMeal } from './meal-card';

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
        {/*
          **Two lines, not three.** The name, the date and the total each had a
          line of their own, and seven columns of that is a 70px band across the
          top of the board that says twenty-one short things. The date is an
          adjunct to the day — "الأحد ٣٠ أغسطس" is how anyone would say it out
          loud — so it joins the name on its line and the band loses a third of
          its height. That is a whole extra meal card's worth of board on a
          laptop, which is the point of the change.

          `flex-wrap` with the name allowed to take the full width: at the
          narrowest the board goes (a phone showing one day, or the tablet's
          three-across), a long weekday and its date will not both fit, and the
          date wrapping under the name is the graceful version of that — the old
          layout, reached only where it is actually needed.

          `baseline`, not `center`: the date is smaller, and aligning the boxes
          would leave it floating above the name's baseline rather than sitting
          on it.
        */}
        <div className="flex flex-wrap items-baseline justify-center gap-x-1.5">
          {/* 16px at 500, where this was 14px at 700. A column heading is read
              at a glance from across seven columns, and bold-at-14 was doing
              that job by weight rather than by size — which makes a row of seven
              headings look heavy without making any one of them easier to pick
              out. Size carries it now, and the lighter weight leaves the day
              name clearly ahead of the figures under it without shouting. */}
          <span className="truncate text-body-md font-medium leading-tight">{dayName}</span>

          {/*
            The calendar date, beside the day name.

            `namesMonth` is the whole idea: printing "أغسطس" over all seven columns
            says the same word seven times and adds nothing, but never printing it
            leaves a week that ends on the 2nd unreadable. So the month appears at
            the start of the week and again wherever the week crosses into the next
            one — exactly the places a bare day number could be misread — and the
            other five columns carry the number alone. See `planColumnDates`.
          */}
          {date && (
            <span className="text-caption leading-tight text-muted-foreground" dir="auto">
              {format.dateTime(new Date(`${date}T00:00:00`), {
                day: 'numeric',
                ...(namesMonth ? { month: 'short' } : {}),
              })}
            </span>
          )}
        </div>

        {/* The total, and — when the day misses the target — an arrow and the
            attention colour. The arrow is decorative; the amber figure beside
            it already carries the meaning, and labelling both makes a screen
            reader say it twice.

            There is no band under it any more. Seven of them across the top of
            the board was seven six-pixel graphics competing with the seven
            figures they restated, in the one strip that has to stay scannable.
            The drift state they were drawn to show is on the figure itself.

            The day with nothing in it prints its target here instead of adding
            a fourth line under the total — the dietitian looking at an
            unplanned column is the one who most needs the figure, and an empty
            column has no total to print in its place. */}
        <span
          className={cn(
            'mt-0.5 flex items-baseline justify-center gap-1 text-label font-medium leading-tight',
            band?.state ? 'font-bold text-status-attention-fg' : 'text-muted-foreground',
          )}
        >
          {band?.state && (
            <Icon
              name={band.state === 'over' ? 'driftUp' : 'driftDown'}
              className="size-3.5 self-center"
            />
          )}
          {band || dailyTarget <= 0
            ? t('kcalValue', { value: kcal })
            : t('dailyTargetShort', { value: dailyTarget })}
        </span>
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
    // The hint is this app's tooltip, not the browser's `title`. A native tip
    // waits a second, cannot be reached from a keyboard or a finger, and is
    // drawn by the OS in a font and a colour that belong to no part of this
    // product — on a board whose every other transient panel is a themed
    // popover, it reads as something leaking through from underneath.
    <TooltipHint
      label={t('restoreSlot', { slot: row.label })}
      className="size-full"
    >
      <button
        type="button"
        onClick={() => add(dayOfWeek, row.slotKey, row.label, row.timeOfDay)}
        // Named for what it restores, not "add" — there are seven of these in a
        // column and a screen reader hearing "add" seven times learns nothing.
        aria-label={t('restoreSlot', { slot: row.label })}
        className="group/skip grid size-full place-items-center rounded-lg border border-dashed border-border/60 text-muted-foreground transition-colors hover:border-primary hover:bg-secondary hover:text-primary"
      >
        <Icon
          name="add"
          // `pointer-coarse:` for the same reason as `RemoveSlot` below: the
          // resting visibility has to answer "can this pointer hover", not "how
          // wide is the window". On a tablet the width test said yes and the
          // hover never came, so the one mark saying this empty cell can be
          // filled back in was invisible.
          className="size-4 opacity-0 transition-opacity group-hover/skip:opacity-100 group-focus-visible/skip:opacity-100 pointer-coarse:opacity-60"
        />
      </button>
    </TooltipHint>
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
 * ── One question, not three ──
 *
 * The form asked for a name, an hour and a glyph, and the name was a free-text
 * box. Nearly every row anyone adds is one of thirteen things, and each of those
 * answers the other two questions on its own — nobody puts "before training" at
 * 07:30, and nobody draws it with a dinner plate. So the name is a list now, and
 * picking from it fills the hour and the glyph in behind you; both stay
 * editable, because a client who trains at six in the morning exists.
 *
 * ── Names already on the board are shown, disabled ──
 *
 * They used to be filtered out. Which is defensible — the slot key would be new
 * but the rail would read the same word twice — and it produced a list whose
 * contents changed every time a row was added, so the reader had to work out
 * whether "غداء" was missing because it is already there or because this app
 * does not have it. A greyed row with the reason beside it answers that without
 * being choosable, and the list is the same list every time it opens.
 *
 * ── The free-text box is gone ──
 *
 * It was the last entry, for the clinic that calls its rows something else. At
 * eight names that was a reasonable escape hatch; at thirteen it is a second
 * question ("is my name in the list, or do I type it?") asked of everyone in
 * order to serve almost no one, and the typed name was the one answer that
 * still left the hour and the glyph to set by hand. A clinic needing a name
 * this list does not carry should have it *added to the list*, where it arrives
 * with an hour, a glyph and a translation.
 */
/**
 * The label a chosen suggestion carries, or `''` when nothing is chosen.
 *
 * Read from the message catalogue rather than from the rendered options, which
 * now decorate a taken row with the reason it cannot be picked — and the row's
 * *name* is what goes on the board.
 */
function nameOf(
  choice: string | null,
  t: ReturnType<typeof useTranslations<'weeklyPlans'>>,
): string {
  const suggestion = MEAL_NAME_SUGGESTIONS.find((entry) => entry.id === choice);

  return suggestion ? t(`mealNameSuggestions.${suggestion.id}`) : '';
}

export function AddSlot({ rows }: { rows: readonly BoardRow[] }) {
  const t = useTranslations('weeklyPlans');
  const activeLocale = useLocale();
  const { addWeek } = useEditorActions();
  const [open, setOpen] = useState(false);
  // `null` rather than a first suggestion, so the dialog opens asking the
  // question instead of answering it. Save stays disabled until a row is
  // picked; pre-selecting one would let a distracted press add "سناك مسائي" to
  // all seven days.
  const [choice, setChoice] = useState<string | null>(null);
  const [time, setTime] = useState('17:00');
  const [mealIconId, setMealIconId] = useState<(typeof MEAL_ICON_OPTIONS)[number]['id']>('snack');

  const taken = new Set(rows.map((row) => row.label.trim()));
  const options = MEAL_NAME_SUGGESTIONS.map((suggestion) => {
    const label = t(`mealNameSuggestions.${suggestion.id}`);
    const already = taken.has(label);

    return {
      value: suggestion.id,
      // The reason on the row itself, not a tooltip: a disabled option in a
      // listbox cannot be hovered on a touch screen and cannot be focused by
      // keyboard, so a tip attached to it is a tip nobody can summon.
      label: already ? `${label} — ${t('addMealTaken')}` : label,
      disabled: already,
    };
  });

  const name = taken.has(nameOf(choice, t)) ? '' : nameOf(choice, t);

  function pick(value: string): void {
    setChoice(value);

    const suggestion = MEAL_NAME_SUGGESTIONS.find((entry) => entry.id === value);
    if (!suggestion) return;

    // The hour and the glyph follow the name, and go on following it while the
    // reader keeps changing their mind — until they touch either one directly.
    setTime(suggestion.time);
    setMealIconId(suggestion.icon);
  }

  function submit(): void {
    if (!name) return;

    const iconChoice =
      MEAL_ICON_OPTIONS.find((option) => option.id === mealIconId) ?? MEAL_ICON_OPTIONS[2];

    addWeek(
      nextSlotKey(rows.map((row) => row.slotKey), iconChoice.type, iconChoice.slotPrefix),
      name,
      time,
    );
    setChoice(null);
    setTime('17:00');
    setMealIconId('snack');
    setOpen(false);
  }

  return (
    <>
      {/*
        In the rail's corner cell, which the header row was drawing blank — see
        `SlotRail`. The cell is 96px of a 42px row, so the label rides with the
        glyph and truncates rather than wrapping; the tip carries it in full at
        the width where it cannot.

        A phone's rail is 80px, which is 14px short of the same label, and
        "Add a m…" names nothing. There the glyph stands on its own, with the
        name still in `aria-label` for anyone reading the page aloud.
      */}
      <TooltipHint label={t('addMeal')} className="w-full min-w-0">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('addMeal')}
          className="flex w-full min-w-0 items-center justify-center gap-1 rounded-lg border border-dashed border-border px-1.5 py-1.5 text-caption text-muted-foreground transition-colors hover:border-primary hover:bg-secondary hover:text-secondary-foreground"
        >
          <Icon name="add" className="size-4" />
          <span className="hidden min-w-0 truncate md:inline">{t('addMeal')}</span>
        </button>
      </TooltipHint>

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
              <Label htmlFor="add-slot-name">{t('addMealLabel')}</Label>
              <SelectField
                id="add-slot-name"
                value={choice}
                onValueChange={pick}
                options={options}
                placeholder={t('addMealNamePlaceholder')}
                aria-label={t('addMealLabel')}
              />
            </Field>

            <Field>
              <Label htmlFor="add-slot-time">{t('addMealTime')}</Label>
              {/*
                The app's one time control, the same one the client record's
                meal schedule uses — a segmented field with a clock leading it
                and the OS spinner suppressed. This was a bare `<input
                type="time">`, which is the same element underneath and none of
                the treatment: it drew the browser's own picker button, in the
                operating system's type, on a dialog that is otherwise entirely
                the app's. Two forms that ask a client's meal times should not
                ask them with two different controls.

                No `step`: any whole minute is a real answer here, exactly as it
                is on the intake form.
              */}
              <TimeInput
                id="add-slot-time"
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
            <Button type="submit" disabled={name.length === 0}>
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
  const tCommon = useTranslations('common');
  const activeLocale = useLocale() as Locale;
  const { removeWeek } = useEditorActions();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
    <TooltipHint
      label={t('removeSlot', { slot: row.label })}
      // The wrapper takes the corner placement so the button can stay the
      // containing block for its own coarse-pointer hit area below.
      className="absolute end-0.5 top-0.5"
    >
    <button
      type="button"
      onClick={() => setConfirming(true)}
      aria-label={t('removeSlot', { slot: row.label })}
      /*
        `pointer-coarse:` rather than `max-md:` for the resting visibility, and a
        hit area that a finger can find.

        The reveal was gated on viewport width, which answered the wrong
        question. Below `md` the button sat at 60% and was reachable; from 768px
        up it went back to `opacity-0` and hover-only — so on a tablet, where
        there is no hover at all, removing a meal slot was invisible and
        unreachable at every width the board is actually used at. Width does not
        tell you whether a pointer can hover; `pointer-coarse` does, and it
        covers the phone case the old class was aiming at as well.

        `before:` widens the hit area to ~40px on touch without moving the 22px
        mark, which has to stay small: it sits in the corner of a slot label and
        a larger visible control would crowd the label it belongs to.

        `-inset-3` and not `-inset-2`: the glyph's own box is 22px, so the
        smaller reach came to 38px — close enough to look solved and still
        under the 44px floor a finger actually needs.
      */
      className="relative rounded-full p-1 text-muted-foreground opacity-0 transition-[opacity,color,background-color] hover:bg-destructive-subtle hover:text-destructive focus-visible:opacity-100 group-hover/slot:opacity-100 pointer-coarse:opacity-60 pointer-coarse:before:absolute pointer-coarse:before:-inset-3 pointer-coarse:before:content-['']"
    >
      <Icon name="trash" className="size-3.5" />
    </button>
    </TooltipHint>

    {/*
      `ConfirmDialog`, not `window.confirm`.

      The browser's confirm is the same seam the board's native tooltips were:
      an OS panel, in an OS font, over a product that draws every other question
      itself — and it was the only modal in this app that is not themed,
      dismissible by swipe, or set in Arabic at the right weight.

      The receipt afterwards is not here. `removeWeek` raises it, because the
      toast carries an Undo and undoing needs the seven meals this row was
      holding — which only `BoardEditor` still has once the rows are gone. See
      `undoSlotRemoval` in `board-dnd.tsx`.
    */}
    {confirming && (
      <ConfirmDialog
        locale={activeLocale}
        title={t('removeSlot', { slot: row.label })}
        description={t('removeSlotConfirm', { slot: row.label })}
        confirmLabel={tCommon('delete')}
        cancelLabel={tCommon('cancel')}
        tone="destructive"
        onConfirm={() => {
          setConfirming(false);
          removeWeek(row.slotKey);
        }}
        onCancel={() => setConfirming(false)}
      />
    )}
    </>
  );
}

export { RemoveSlot };
