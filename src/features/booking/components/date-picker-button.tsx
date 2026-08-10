'use client';

import { useTranslations } from 'next-intl';
import { createContext, useContext, useState } from 'react';
import { useDayPicker, type MonthCaptionProps, type NavProps } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Caret } from '@/components/ui/caret';
import { DateCalendar } from '@/components/ui/date-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip } from '@/components/ui/tooltip';
import { type Locale } from '@/i18n/routing';
import { toIntlLocale } from '@/lib/format';
import { isoToLocalDate, toIsoDate } from '@/lib/iso-date';
import { cn } from '@/lib/utils';

/**
 * The toolbar's range label, as a button that drops a month grid to jump the
 * calendar somewhere else.
 *
 * It reads as a date and it *is* the date control — the label was already the
 * one thing in the toolbar saying where you are, and giving it a button's box
 * makes the row say "Today, and this" with one shape rather than a button
 * beside a heading. It shares Today's tertiary `ghost` variant, whose
 * `aria-expanded` fill marks the trigger while the grid is open.
 *
 * The grid itself is the app's shared `DateCalendar`. What stays local to the
 * calendar is what this picker means: the day it opens on, the span currently
 * on screen, and the clinic's own idea of today, none of which a general date
 * field has.
 *
 * **The panel is denser than a form field's**, and every difference is passed
 * in from here rather than changed in the shared picker: a fixed 264px width,
 * 32px cells, an 11px weekday key, square days instead of circles, half-strength
 * days from the neighbouring months, and a caption row carrying one
 * month-and-year chooser at the inline-start with "this month / back / forward"
 * grouped at the end. A date field sits in a form and is used once; this one
 * sits in a toolbar above the thing it moves and is used all day.
 */

export type DatePickerButtonProps = {
  locale: Locale;
  /** The date the calendar is anchored on. Opens the grid on its month. */
  value: string;
  /**
   * The span the current view actually covers, inclusive — one day, a whole
   * week, a whole month.
   *
   * Marked in full rather than marking `value` alone. In the week view the
   * anchor is whichever date happens to be in the URL, so highlighting that
   * one day claimed a precision the view does not have: what is on screen is
   * seven days, and the picker should say seven.
   */
  range: { from: string; to: string };
  /** Today, tinted like the week header's current day. Null until the clock ticks. */
  today: string | null;
  /** The trigger's label — the range the toolbar has already formatted for this view. */
  label: string;
  onSelect: (date: string) => void;
};

/**
 * The caption row's controls: "this month", then back and forward.
 *
 * A module-level component, and it reads everything it needs from
 * `useDayPicker()` rather than from a closure. A component declared inside the
 * picker's render would be a new type on every render, so react-day-picker
 * would unmount and remount this row — and whatever had focus inside it — every
 * time the month changed. `goToMonth` is the same navigation the arrows use, so
 * "this month" cannot desynchronise from them.
 *
 * `today` comes from the day picker's own props, which is the clinic's clock
 * passed down from the toolbar rather than the machine's.
 */
function MonthNav({ onPreviousClick, onNextClick, previousMonth, nextMonth, className, ...props }: NavProps) {
  const t = useTranslations('booking');
  const { goToMonth, months, dayPickerProps } = useDayPicker();

  const today = dayPickerProps.today ?? new Date();
  const shown = months[0]?.date;

  // Disabled once the grid is already on it — a control that would do nothing
  // should say so before it is pressed rather than after.
  const onThisMonth = Boolean(
    shown && shown.getFullYear() === today.getFullYear() && shown.getMonth() === today.getMonth(),
  );

  return (
    <nav className={className} {...props}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-label text-muted-foreground hover:text-foreground"
        disabled={onThisMonth}
        onClick={() => goToMonth(today)}
      >
        {t('nav.today')}
      </Button>

      {/*
        `start` and `end` are logical, and `Caret` mirrors itself in RTL — so in
        Arabic the arrow on the *right* is "previous month" and the one on the
        left is "next", without this branching on the locale.

        The tooltip repeats the button's own `aria-label` rather than replacing
        it: `Tooltip` is `aria-hidden`, so the hint is for the pointer and the
        label is what a screen reader and the keyboard get. Two arrows with no
        text between them is exactly the case it exists for.
      */}
      <Tooltip label={t('nav.previousMonth')}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 rounded-lg p-0"
          aria-label={t('nav.previousMonth')}
          disabled={!previousMonth}
          onClick={onPreviousClick}
        >
          <Caret direction="start" />
        </Button>
      </Tooltip>

      <Tooltip label={t('nav.nextMonth')}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 rounded-lg p-0"
          aria-label={t('nav.nextMonth')}
          disabled={!nextMonth}
          onClick={onNextClick}
        >
          <Caret direction="end" />
        </Button>
      </Tooltip>
    </nav>
  );
}

/**
 * How the caption reaches the month grid.
 *
 * `MonthCaption` is built by react-day-picker, so it cannot be handed a
 * callback as a prop — and it must not be declared inside the picker's render,
 * which would remount the caption row on every month change. A context is the
 * seam: the picker publishes "open the month grid" and the caption calls it.
 */
const CaptionContext = createContext<(() => void) | null>(null);

/**
 * The caption: one control naming the month *and* the year, and the way in to
 * the month grid.
 *
 * react-day-picker's `captionLayout="dropdown"` gives two selects — a month and
 * a year — which is the right shape for a date of birth, where the year is the
 * hard part and 1974 is a long way from here. On a clinic's calendar the two are
 * one thought: you are going to *next March*, not to a month and then separately
 * to a year. Two controls also cost the caption twice the width, and this panel
 * is 264px wide with the step controls sharing its top row.
 *
 * Pressing it swaps the day grid for twelve months (see `MonthGridPanel`) —
 * a picker inside the picker rather than a platform dropdown covering it.
 */
function MonthCaption({ calendarMonth, displayIndex: _displayIndex, className, ...props }: MonthCaptionProps) {
  const t = useTranslations('booking');
  const { formatters } = useDayPicker();
  const openMonths = useContext(CaptionContext);

  return (
    <div className={className} {...props}>
      <button
        type="button"
        aria-expanded={false}
        aria-label={t('nav.pickMonth')}
        onClick={() => openMonths?.()}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-body-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span>{formatters.formatCaption(calendarMonth.date)}</span>
        <Caret direction="down" className="size-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

/**
 * The twelve months of one year, three across.
 *
 * What the caption opens onto. It reuses the panel the day grid was in rather
 * than covering it: the popover keeps its width, its padding and its top row,
 * and only the two things that differ change — the caption drops to the year
 * alone, because the month is the thing being chosen and a caption cannot name
 * what it is asking for, and the step arrows now move a year instead of a month.
 *
 * `grid-cols-3` gives four rows of three. Twelve months want a shape that
 * divides evenly and stays legible at this width: four across leaves 55px per
 * cell, which cuts سبتمبر and September both, and two across is a list.
 *
 * A dead end is impossible — picking any month returns to that month's days, and
 * the year label goes back without choosing.
 */
function MonthGridPanel({
  locale,
  value,
  today,
  onSelect,
  onBack,
}: {
  locale: Locale;
  /** The month the day grid is on — its year is the one shown. */
  value: Date;
  today: Date | undefined;
  onSelect: (month: Date) => void;
  onBack: () => void;
}) {
  const t = useTranslations('booking');
  const [year, setYear] = useState(value.getFullYear());

  // The clinic's own locale rules: Latin digits and Gregorian months in Arabic
  // too, exactly as the day grid's formatters are built.
  const monthName = new Intl.DateTimeFormat(toIntlLocale(locale), {
    month: 'long',
    numberingSystem: 'latn',
    calendar: 'gregory',
  });

  return (
    <div className="flex flex-col p-0">
      <div className="mb-1 flex h-8 items-center justify-between gap-1">
        {/* The year alone, and the way back. Same box as the caption it
            replaced, so the row does not shift as the panel changes. */}
        <button
          type="button"
          aria-expanded
          aria-label={t('nav.pickMonth')}
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-body-sm font-semibold text-foreground tabular-nums transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span>{year}</span>
          <Caret direction="down" className="size-3.5 rotate-180 text-muted-foreground" />
        </button>

        <div className="flex items-center gap-0.5">
          <Tooltip label={t('nav.previousYear')}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-7 shrink-0 rounded-lg p-0"
              aria-label={t('nav.previousYear')}
              onClick={() => setYear((current) => current - 1)}
            >
              <Caret direction="start" />
            </Button>
          </Tooltip>

          <Tooltip label={t('nav.nextYear')}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-7 shrink-0 rounded-lg p-0"
              aria-label={t('nav.nextYear')}
              onClick={() => setYear((current) => current + 1)}
            >
              <Caret direction="end" />
            </Button>
          </Tooltip>
        </div>
      </div>

      <div role="group" aria-label={t('nav.pickMonth')} className="grid grid-cols-3 gap-1">
        {Array.from({ length: 12 }, (_, index) => new Date(year, index, 1)).map((date) => {
          const isShown = year === value.getFullYear() && date.getMonth() === value.getMonth();
          const isThisMonth =
            today && year === today.getFullYear() && date.getMonth() === today.getMonth();

          return (
            <button
              key={date.getMonth()}
              type="button"
              aria-current={isShown ? 'date' : undefined}
              onClick={() => onSelect(date)}
              className={cn(
                // 44px tall: the same touch floor the day cells clear, and tall
                // enough that a month name has room to sit on its own line.
                'flex min-h-11 items-center justify-center rounded-md px-1 text-body-sm transition-colors',
                isShown
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : isThisMonth
                    ? 'bg-primary-subtle text-secondary-foreground font-medium hover:bg-primary-subtle'
                    : 'text-foreground hover:bg-muted',
              )}
            >
              <span className="truncate">{monthName.format(date)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DatePickerButton({ locale, value, range, today, label, onSelect }: DatePickerButtonProps) {
  const t = useTranslations('booking');
  const [open, setOpen] = useState(false);

  const anchor = isoToLocalDate(value) ?? undefined;
  const from = isoToLocalDate(range.from);
  const to = isoToLocalDate(range.to);

  /*
    The month on screen is state here rather than inside the grid, because two
    things move it: paging, and the "this month" control in the caption row.

    Keyed on `value` through `useState`'s initialiser plus the remount below —
    reopening the picker after the toolbar has moved should open on where the
    calendar now is, not on the month that was showing when it was last closed.
  */
  const [month, setMonth] = useState<Date | undefined>(anchor);

  /*
    Which of the two grids the panel is showing. It is one popover with two
    contents rather than a second surface over the first: a panel that opens
    another panel on top of itself is two things to dismiss, and the month grid
    answers the same question the day grid does, one level up.
  */
  const [pickingMonth, setPickingMonth] = useState(false);
  const todayDate = isoToLocalDate(today ?? '') ?? undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Opening returns the grid to wherever the calendar now is. Paging six
        // months forward, closing, then moving the toolbar and reopening should
        // not land you back in a month neither control is on any more — and it
        // opens on days, because that is what the control promises.
        if (next) {
          setMonth(anchor);
          setPickingMonth(false);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            // Tertiary, matching the Today button beside it — see the note there.
            // `ghost` marks itself while open with the same neutral fill it takes
            // on hover, via the variant's own `aria-expanded` classes.
            variant="ghost"
            size="sm"
            aria-haspopup="dialog"
            /*
              Centred, with no disclosure chevron. The label is the one thing in
              this row that says *where you are*, and it sits on the toolbar's
              centre line — a glyph pinned to one end pushed the text off that
              line by half its width and made the middle zone read as lopsided
              against the two chevrons framing it. The button's own
              `aria-expanded` fill already marks the panel as open, and
              `aria-haspopup` announces it.
            */
            /*
              A black label, not `ghost`'s olive one.

              Olive is the system's "act on me" colour, and this control's label
              is the date the calendar is on — a statement of where you are that
              happens to be pressable, sitting between two arrows that are now
              invisible until pointed at. In olive it was the loudest thing in a
              toolbar above a grid that is the actual subject of the page. The
              hover fill and the `aria-expanded` fill still answer the pointer,
              and the label stays black through both.
            */
            className="min-w-52 justify-center text-foreground hover:text-foreground aria-expanded:text-foreground"
          >
            <span className="truncate" dir="auto">
              {label}
            </span>
          </Button>
        }
      />

      {/*
        A fixed 264px panel rather than one sized to its grid. Seven columns of
        a fixed cell size make the popover a different width in each language —
        the weekday header is one letter in Arabic and three in English — and a
        control that changes width when the locale changes cannot be positioned
        against the toolbar's centre line. The cells divide the panel instead.
      */}
      <PopoverContent aria-label={t('nav.pickDate')} className="w-[264px] p-2">
        {pickingMonth ? (
          <MonthGridPanel
            locale={locale}
            value={month ?? anchor ?? todayDate ?? new Date()}
            today={todayDate}
            onSelect={(picked) => {
              setMonth(picked);
              setPickingMonth(false);
            }}
            onBack={() => setPickingMonth(false)}
          />
        ) : (
        <CaptionContext.Provider value={() => setPickingMonth(true)}>
        <DateCalendar
          locale={locale}
          selected={anchor}
          month={month}
          onMonthChange={setMonth}
          /*
            The month controls, grouped at the inline-end of the caption row
            rather than split to either side of it.

            Split, the two chevrons sat at the far corners of a 264px panel with
            the month name floating between them, and the panel's own header
            read as three unrelated things. Grouped, the caption owns the
            inline-start corner — where the eye starts in both languages — and
            the controls read as one cluster of the same kind of thing.

            "This month" leads that cluster because it is the one control here
            that names a destination rather than a direction, and it is disabled
            when the grid is already on it: a control that does nothing should
            say so before it is pressed. It moves the *grid*, not the calendar
            behind it — the toolbar's own Today button is what changes the view,
            and this one only takes you back to the month you started in after
            you have paged away looking for something.
          */
          /*
            `Chevron` too, so every arrow in this panel is the same glyph. The
            calendar ships lucide's chevrons, which are a lighter stroke drawn
            on a different grid — beside the caret the month arrows now use,
            the one on the month dropdown read as a mark borrowed from another
            set. `orientation` is physical, which is react-day-picker's own
            wording; `Caret` takes the logical name and does the mirroring, so
            "left" is `start` and it points the right way in Arabic.
          */
          /*
            `label` rather than `dropdown`: the caption is `MonthCaption` now,
            which brings its own single month-and-year list, so the two selects
            react-day-picker would otherwise build are not wanted.
          */
          captionLayout="label"
          components={{
            Nav: MonthNav,
            MonthCaption,
            Chevron: ({ orientation, className }) => (
              <Caret
                direction={orientation === 'left' ? 'start' : orientation === 'right' ? 'end' : 'down'}
                className={className}
              />
            ),
          }}
          classNames={{
            /*
              The caption row: the month chooser at the inline-start — the top
              *right* in Arabic — and the step controls at the inline-end. Both
              are logical, so the pair swaps sides with the language and the
              chooser always sits where the reading starts.
            */
            month_caption: 'flex h-8 w-full items-center justify-start px-0',
            nav: 'absolute inset-y-0 end-0 top-0 flex h-8 items-center gap-0.5',
            /*
              An 11px header at 28px tall. The weekday row is a key to the
              columns under it, not a row of the grid — at the day cells' own
              size it competed with them for the first read.
            */
            weekday: 'flex-1 h-7 flex items-center justify-center text-[0.6875rem] font-medium text-muted-foreground select-none',
            /*
              Square cells with the system radius, not circles. A circle is the
              shape for a single marked day on a wall calendar; this grid marks
              a *span* — the week or month currently on screen — and round cells
              broke that run into seven separate beads. The squares meet at the
              gap and read as one block.
            */
            day: 'group/day relative aspect-square h-full w-full rounded-md p-0 text-center select-none',
            /*
              And the button inside it. The cell is a `<td>`; the pressable part
              is a `Button` at `size="icon"`, which is round by definition — so
              without this the fill under the pointer, and under the chosen day,
              stayed a circle inside a square cell.
            */
            day_button: cn(
              'rounded-md',
              /*
                Black numerals. The day cell is a `Button` at `variant="ghost"`,
                whose label is olive — the system's "act on me" colour — so
                every one of the 42 dates in the grid was drawn in it. A month
                of olive numbers reads as a month of links, and it left the
                chosen day with no colour of its own to be chosen *in*. The
                grid is text now; the fill is what marks a date.
              */
              'text-foreground hover:text-foreground',
              /*
                No ring on the chosen day. It keeps DOM focus after it is
                clicked, so the lime focus ring sat around it for as long as the
                panel stayed open — a second mark on top of the primary fill
                that already says which day this is. Keyboard navigation still
                rings every *other* day it lands on, which is where the ring is
                the only thing saying where you are.
              */
              'data-[selected-single=true]:border-transparent data-[selected-single=true]:ring-0',
            ),
            today: 'rounded-md bg-muted text-foreground data-[selected=true]:bg-transparent',
            // Half-strength: the days either side of this month are context for
            // the ends of the grid, not dates anyone came here to press.
            outside: 'text-muted-foreground/50 aria-selected:text-muted-foreground/50',
          }}
          // The clinic's clock, not the machine's — the same value the week
          // header tints its current column with, and null until it ticks.
          today={isoToLocalDate(today ?? '') ?? undefined}
          /*
            The span on screen, as a modifier rather than as a selection: the
            anchor is *the* selected day (one `aria-current`, one primary fill),
            and the other six sit under a quieter tint saying "also on screen".
            Marking all seven as selected would announce seven current dates and
            leave nothing to distinguish the day the calendar is actually
            anchored on.
          */
          modifiers={from && to ? { inView: { from, to } } : undefined}
          modifiersClassNames={{ inView: 'rounded-md bg-secondary text-secondary-foreground' }}
          onSelect={(date) => {
            onSelect(toIsoDate(date));
            setOpen(false);
          }}
          /*
            32px cells, down from the shared picker's 36px. Seven of those plus
            the panel's own padding is 224px inside a 264px popover, so the grid
            has room either side rather than pressing against the border — and
            the columns still clear the touch floor for a pointer-first control
            that only ever appears on a desktop toolbar.
          */
          className="[--cell-size:--spacing(8)]"
          autoFocus
        />
        </CaptionContext.Provider>
        )}
      </PopoverContent>
    </Popover>
  );
}
