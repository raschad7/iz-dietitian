'use client';

import { useTranslations } from 'next-intl';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useDayPicker, type MonthCaptionProps, type NavProps } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Caret } from '@/components/ui/caret';
import { DateCalendar } from '@/components/ui/date-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipHint } from '@/components/ui/tooltip-hint';
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
 * in from here rather than changed in the shared picker: a fixed 264px width
 * the grid fills, a 32px floor on the cells, an 11px weekday key, square days
 * instead of circles, grey days from the neighbouring months, an olive day
 * where the field's is black, and a caption row carrying one month-and-year
 * chooser at the inline-start with "this month / back / forward" grouped at the
 * end. A date field sits in a form and is used once; this one sits in a toolbar
 * above the thing it moves and is used all day.
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
 * The four step arrows in this panel — month back and forward in the day grid,
 * year back and forward in the month grid.
 *
 * `text-foreground`, because `ghost` labels itself in `secondary-foreground`,
 * which is olive. Olive is the system's "act on me" colour and these are the
 * panel's *furniture*: paging a month is not the thing anyone opened this
 * control to do, and a pair of green chevrons either side of a black date read
 * as the loudest mark in a popover whose one accent belongs to the chosen day.
 * They keep the hover fill; only the glyph turns black.
 */
const stepButtonClassName = 'size-7 shrink-0 rounded-lg p-0 text-foreground hover:text-foreground';

/**
 * 18px, against the toolbar's 20px — the same glyph-to-button ratio in a 28px
 * box that `size-5` gives in the toolbar's 32px one. Sized here rather than on
 * `Caret` itself, whose 16px default is right for the disclosure marks
 * everywhere else.
 */
const stepCaretClassName = 'size-[1.125rem]';

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
        it: the hint is for the pointer, and the label is what a screen reader
        and the keyboard get. Two arrows with no text between them is exactly
        the case it exists for.
      */}
      <TooltipHint label={t('nav.previousMonth')}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={stepButtonClassName}
          aria-label={t('nav.previousMonth')}
          disabled={!previousMonth}
          onClick={onPreviousClick}
        >
          <Caret direction="start" className={stepCaretClassName} />
        </Button>
      </TooltipHint>

      <TooltipHint label={t('nav.nextMonth')}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={stepButtonClassName}
          aria-label={t('nav.nextMonth')}
          disabled={!nextMonth}
          onClick={onNextClick}
        >
          <Caret direction="end" className={stepCaretClassName} />
        </Button>
      </TooltipHint>
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

/** Years to a page in the year chooser: three rows of three, like the months. */
const YEARS_PER_PAGE = 9;

/**
 * The first year of the page `year` falls on.
 *
 * The pages are a fixed partition of the calendar, not a window that re-centres
 * on wherever you happen to be: paging forward and back again has to land you
 * where you started, which a moving window does not do.
 *
 * They are phased so that *this* year sits in the middle cell of its own page —
 * 2026 gives 2022–2030, and the pages either side are 2013–2021 and 2031–2039.
 * That is what makes the first page you see read as "now, with room on both
 * sides" rather than as an arbitrary decade boundary that happens to be near.
 */
function yearPageStart(year: number, thisYear: number) {
  const anchor = thisYear - Math.floor(YEARS_PER_PAGE / 2);
  return anchor + Math.floor((year - anchor) / YEARS_PER_PAGE) * YEARS_PER_PAGE;
}

/**
 * The top row every chooser panel shares: a caption that drills one level out,
 * the word "today", and the two step arrows.
 *
 * Extracted because all three panels draw it and it has to *measure* the same in
 * each — the popover keeps its width and its padding as you move between them,
 * so a row that differed by a control's width would make the panel twitch on
 * every step down.
 */
function ChooserHeader({
  caption,
  captionLabel,
  expanded,
  onCaption,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
}: {
  caption: ReactNode;
  captionLabel: string;
  /**
   * Whether this is the last rung — the year grid, where the caption's press
   * ends the ring rather than opening the next thing. It turns the caret over:
   * down means "this opens something", up means "this puts the days back".
   */
  expanded: boolean;
  onCaption: () => void;
  previousLabel: string;
  nextLabel: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const t = useTranslations('booking');

  return (
    <div className="mb-1 flex h-8 items-center justify-between gap-1">
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={captionLabel}
        onClick={onCaption}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-body-sm font-semibold text-foreground tabular-nums transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {caption}
        <Caret
          direction="down"
          className={cn('size-3.5 text-muted-foreground', expanded && 'rotate-180')}
        />
      </button>

      <div className="flex items-center gap-0.5">
        {/*
          The word, not the control.

          The day grid's row carries a pressable "this month" in this slot, and
          with it gone the chooser's top row sat a step narrower than the row it
          replaced — the arrows slid over as you opened it and the panel appeared
          to twitch. It stays a label here because it has nothing to do: the grid
          on screen is months or years, "now" is one of the cells you are already
          looking at, and a control that merely re-picks a visible cell is a
          second way to do a thing that is not hard the first way.

          `h-7` and the same padding as the button it stands in for, so the two
          rows measure the same. Grey, like its twin in the day grid: it names a
          row rather than saying anything, and black is what this panel spends on
          the dates themselves.
        */}
        <span className="flex h-7 items-center px-2 text-label text-muted-foreground select-none">
          {t('nav.today')}
        </span>

        <TooltipHint label={previousLabel}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={stepButtonClassName}
            aria-label={previousLabel}
            onClick={onPrevious}
          >
            <Caret direction="start" className={stepCaretClassName} />
          </Button>
        </TooltipHint>

        <TooltipHint label={nextLabel}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={stepButtonClassName}
            aria-label={nextLabel}
            onClick={onNext}
          >
            <Caret direction="end" className={stepCaretClassName} />
          </Button>
        </TooltipHint>
      </div>
    </div>
  );
}

/**
 * One cell of a chooser grid — a month, or a year.
 *
 * The two grids mark their cells identically and for the same reasons, so the
 * three states live here once: the filled olive cell is what the calendar is
 * currently on, the olive outline is where *now* is, and everything else is
 * plain text. See the day grid's `day_button` for the outline-not-fill
 * reasoning; this is the same mark one and two levels up.
 */
function ChooserCell({
  shown,
  current,
  onClick,
  children,
}: {
  /** The month or year the calendar is on. At most one cell in the grid. */
  shown: boolean;
  /** The month or year it actually is. Drops when it is also the shown one. */
  current: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={shown ? 'date' : undefined}
      onClick={onClick}
      className={cn(
        // 44px tall: the same touch floor the day cells clear, and tall enough
        // that a month name has room to sit on its own line.
        'flex min-h-11 items-center justify-center rounded-md px-1 text-body-sm transition-colors',
        shown
          ? 'bg-primary text-primary-foreground font-semibold'
          : current
            ? 'ring-1 ring-inset ring-primary text-primary font-medium hover:bg-muted'
            : 'text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

/**
 * The twelve months of one year, three across — and, one level further out, the
 * nine years of a page.
 *
 * What the caption opens onto. Each reuses the panel the day grid was in rather
 * than covering it: the popover keeps its width, its padding and its top row,
 * and only what the grid holds changes.
 *
 * The captions are a ring, not a ladder with a landing at the top: the day
 * grid's says "August 2026" and gives you months, the month grid's says "2026"
 * and gives you years, and the year grid's says "2022 – 2030" and puts you back
 * on the days. Three presses of the same spot return the panel to where it
 * opened, so the caption is one control with one gesture rather than a way in
 * that has to be unwound press by press — and getting out of the year grid
 * costs one press from either direction instead of two going back up. The step
 * arrows move by whatever the grid is made of — a year at a time among months,
 * a page of nine among years.
 *
 * `grid-cols-3` throughout. Twelve months want a shape that divides evenly and
 * stays legible at this width: four across leaves 55px per cell, which cuts
 * سبتمبر and September both, and two across is a list. Nine years then fall out
 * of the same three columns as three rows.
 *
 * A dead end is impossible — picking a year returns to that year's months, and
 * picking a month returns to that month's days.
 */
function MonthGridPanel({
  locale,
  value,
  today,
  onSelect,
  onBackToDays,
}: {
  locale: Locale;
  /** The month the day grid is on — its year is the one shown. */
  value: Date;
  today: Date | undefined;
  onSelect: (month: Date) => void;
  /**
   * Closes the chooser and hands the panel back to the day grid, on whatever
   * month it was already on. What the year grid's caption does — the last step
   * of the ring, and the only one that leaves this component.
   */
  onBackToDays: () => void;
}) {
  const t = useTranslations('booking');
  const [year, setYear] = useState(value.getFullYear());

  const thisYear = (today ?? new Date()).getFullYear();

  /*
    Which of the two grids this panel is showing, and — when it is the years —
    which page of them. The page is state rather than derived from `year`
    because paging is meant to leave `year` alone: you are looking around, and
    nothing is chosen until you press a cell.
  */
  const [pickingYear, setPickingYear] = useState(false);
  const [yearPage, setYearPage] = useState(() => yearPageStart(year, thisYear));

  // The clinic's own locale rules: Latin digits and Gregorian months in Arabic
  // too, exactly as the day grid's formatters are built.
  const monthName = new Intl.DateTimeFormat(toIntlLocale(locale), {
    month: 'long',
    numberingSystem: 'latn',
    calendar: 'gregory',
  });

  if (pickingYear) {
    return (
      <div className="flex flex-col p-0">
        <ChooserHeader
          /*
            `dir="ltr"` on the range. Both years are Latin digits, so each is
            its own left-to-right run, and the dash between them is a neutral
            character — in an Arabic paragraph the bidi algorithm resolves it to
            the surrounding direction and renders the pair as "2030 – 2022".
            The years read in the order they were written either way, but the
            span has to say so.
          */
          caption={
            <span dir="ltr">{`${yearPage} – ${yearPage + YEARS_PER_PAGE - 1}`}</span>
          }
          /*
            "Choose a day", because that is where this press lands — the label
            names the destination, the way the other two rungs do. It is the
            one caption whose grid and whose label disagree, and deliberately:
            the years are already on screen and do not need announcing, and a
            button labelled after the thing under it would say nothing about
            what pressing it does.
          */
          captionLabel={t('nav.pickDay')}
          expanded
          onCaption={onBackToDays}
          previousLabel={t('nav.previousYears')}
          nextLabel={t('nav.nextYears')}
          onPrevious={() => setYearPage((current) => current - YEARS_PER_PAGE)}
          onNext={() => setYearPage((current) => current + YEARS_PER_PAGE)}
        />

        <div role="group" aria-label={t('nav.pickYear')} className="grid grid-cols-3 gap-1">
          {Array.from({ length: YEARS_PER_PAGE }, (_, index) => yearPage + index).map((candidate) => (
            <ChooserCell
              key={candidate}
              shown={candidate === year}
              current={candidate === thisYear}
              onClick={() => {
                setYear(candidate);
                setPickingYear(false);
              }}
            >
              <span className="tabular-nums">{candidate}</span>
            </ChooserCell>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col p-0">
      <ChooserHeader
        caption={<span>{year}</span>}
        captionLabel={t('nav.pickYear')}
        expanded={false}
        onCaption={() => {
          // Open on the page holding the year we are on, not on wherever the
          // last look around left off.
          setYearPage(yearPageStart(year, thisYear));
          setPickingYear(true);
        }}
        previousLabel={t('nav.previousYear')}
        nextLabel={t('nav.nextYear')}
        onPrevious={() => setYear((current) => current - 1)}
        onNext={() => setYear((current) => current + 1)}
      />

      <div role="group" aria-label={t('nav.pickMonth')} className="grid grid-cols-3 gap-1">
        {Array.from({ length: 12 }, (_, index) => new Date(year, index, 1)).map((date) => (
          <ChooserCell
            key={date.getMonth()}
            shown={year === value.getFullYear() && date.getMonth() === value.getMonth()}
            current={Boolean(
              today && year === today.getFullYear() && date.getMonth() === today.getMonth(),
            )}
            onClick={() => onSelect(date)}
          >
            <span className="truncate">{monthName.format(date)}</span>
          </ChooserCell>
        ))}
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
            /*
              `min-w-0` below `md`, the 208px floor above it.

              The floor is what stops the middle of the toolbar resizing as you
              step through the days — `August 1, 2026 – August 31, 2026` and
              `August 15, 2026` are not the same width, and a control on the
              page's centre line that changes width moves everything either side
              of it. On a phone that floor is a liability: the long form is 285px
              inside a 375px viewport, and a flex child may not shrink below its
              content unless told to, so the row pushed the document wider than
              the window and put a scrollbar under the whole page. Below `md` the
              label gives way and truncates instead.

              `shrink` undoes `Button`'s own `shrink-0`, which is right for a
              button whose label is two words and wrong for one carrying a date
              range; without it the floor is irrelevant, because the control
              never gives up a pixel and the arrow after it is pushed out of the
              row.
            */
            /*
              `px-2`, down from the `sm` variant's 12px. This padding is the
              largest thing separating the date from the two chevrons framing it,
              and unlike theirs it is not a hit area — the whole 40px height is
              pressable either way. 8px is as tight as the hover and
              `aria-expanded` fills can sit around the text before they read as
              clipping it.
            */
            className="min-w-0 shrink justify-center px-2 text-foreground md:min-w-52 hover:text-foreground aria-expanded:text-foreground"
          >
            {/*
              `min-w-0` beside `truncate`. `overflow: hidden` alone does not
              shorten a flex child — its automatic minimum size is its content,
              so the span reports the whole date as its floor and the ellipsis
              never appears.
            */}
            <span className="min-w-0 truncate" dir="auto">
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
            // Closing the ring. The month stays where it was — the caption is
            // how you look around, and only a cell moves the calendar.
            onBackToDays={() => setPickingMonth(false)}
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
          /*
            Olive on the chosen day, white numeral — not the neutral black the
            shared picker draws. See `selectedTone`: a date *field* is one
            control among many on a form and cannot spend the accent, but this
            panel exists to answer one question and the answer is the only thing
            in it worth a colour.
          */
          selectedTone="primary"
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
              The grid spans the panel rather than sitting to its own width.

              The registry's root is `w-fit`, which sizes the calendar to seven
              cells and leaves whatever the popover has left over as slack —
              visible as a margin down one side of a panel that is a fixed 264px
              wide. `w-full` hands the row to the seven columns instead, and
              since every part below it is already `w-full` or `flex-1` they
              divide it evenly. `--cell-size` stops being the column width and
              becomes its floor.
            */
            root: 'w-full',
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
              size it competed with them for the first read. Size and weight do
              that separating now: the ink is the same black as the dates, so
              grey is left meaning one thing in this panel, "another month".
            */
            weekday: 'flex-1 h-7 flex items-center justify-center text-[0.6875rem] font-medium text-foreground select-none',
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
                Except the days either side of this month, which are light grey.

                The `outside` entry below sets that colour on the `<td>`, and it
                never reached the numeral: the pressable part is a `Button` with
                a colour of its own, and the line above set every one of the 42
                cells to black. September's grid ran from the 30th of August to
                the 4th of October in one unbroken black, so the month on screen
                had no edges.

                They stay *pressable* — grey is the difference between "another
                month" and "this one", not between live and dead, and clicking
                the 30th of August is a reasonable way to get to August. It is
                a colour, not `opacity-50`, for exactly that reason: half
                strength is what this app dims disabled controls with.

                Skipped on the chosen day, which can itself be an outside day
                once you press one — there the white-on-olive is the point.
              */
              'group-data-[outside=true]/day:not-data-[selected-single=true]:text-muted-foreground/70',
              /*
                An olive edge on today, whichever day is chosen.

                The two marks answer different questions and the panel needs
                both at once: the filled cell is the day you have *picked*, and
                this outline is the day it actually is. Pick Monday while it is
                Sunday and the grid should still be able to say where Sunday is
                — otherwise the only fixed point in the month disappears the
                moment you move off it.

                An inset ring rather than a border: the cell is a fixed square
                in a grid that divides the panel, and a border would take its
                width out of the numeral's box and shift the digit by a pixel
                on one day of the month.

                Outline and numeral, no fill. The cell used to carry a grey
                square, which put two filled shapes in the grid — one grey, one
                olive — and the eye had to work out which of them was the answer
                to the question it asked. An outline is not a fill: it marks the
                date without competing with the one you picked.

                The `not-` guards keep it off the chosen day, which needs its
                white numeral on the olive fill, and the hover variant carries
                the same specificity as the blanket `hover:text-foreground`
                above it plus one — otherwise today turned black under the
                pointer.
              */
              'group-data-[today=true]/day:ring-1 group-data-[today=true]/day:ring-inset group-data-[today=true]/day:ring-primary',
              'group-data-[today=true]/day:not-data-[selected-single=true]:text-primary',
              'group-data-[today=true]/day:not-data-[selected-single=true]:hover:text-primary',
              /*
                No ring on the chosen day. It keeps DOM focus after it is
                clicked, so the lime focus ring sat around it for as long as the
                panel stayed open — a second mark on top of the primary fill
                that already says which day this is. Keyboard navigation still
                rings every *other* day it lands on, which is where the ring is
                the only thing saying where you are.

                This also settles today-and-chosen being the same cell: the
                olive fill is already as emphatic as the grid gets, and an olive
                ring around an olive square is a line nobody can see.
              */
              'data-[selected-single=true]:border-transparent data-[selected-single=true]:ring-0',
            ),
            // No fill of its own — the olive ring and numeral on the button
            // inside are the whole of today's mark. The cell keeps the radius so
            // the ring it clips against is the grid's own shape.
            today: 'rounded-md',
            outside: 'text-muted-foreground/70 aria-selected:text-muted-foreground/70',
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
            A 32px floor on the column, down from the shared picker's 36px.

            It is no longer the width — `root` is `w-full` now, so the seven
            columns divide the panel between them and land a little wider than
            this. It still sets the cells' minimum, which is what keeps them
            clear of the touch floor, and the cells are square so it sets the
            row height too.
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
