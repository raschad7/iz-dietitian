'use client';

import { useTranslations } from 'next-intl';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { useDayPicker, type Matcher, type MonthCaptionProps, type NavProps } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Caret } from '@/components/ui/caret';
import { DateCalendar } from '@/components/ui/date-calendar';
import { SelectField } from '@/components/ui/select-field';
import { TooltipHint } from '@/components/ui/tooltip-hint';
import { type Locale } from '@/i18n/routing';
import { toIntlLocale } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The app's date *panel*: a dense month grid whose caption opens a ring of
 * choosers — days, then the twelve months of a year, then a page of years.
 *
 * It began life inside the calendar toolbar's `DatePickerButton` and lives here
 * now because every date in the app is picked the same way. A form field used to
 * get react-day-picker's `captionLayout="dropdown"` instead — two native selects
 * — so the clinic had two month grids that navigated differently depending on
 * which surface you opened one from. The grid a walk-in's date of birth is typed
 * into is the grid the doctor already knows from the toolbar.
 *
 * It brings no surface of its own: a caller wraps it in whatever popover it
 * already opened. `DatePicker` puts it in a field's popup; `DatePickerButton`
 * puts it in the toolbar's.
 */

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

/** A month as one comparable number, for testing it against the panel's bounds. */
const monthIndex = (date: Date) => date.getFullYear() * 12 + date.getMonth();

/**
 * The caption row's controls: "this month", then back and forward.
 *
 * A module-level component, and it reads everything it needs from
 * `useDayPicker()` rather than from a closure. A component declared inside the
 * panel's render would be a new type on every render, so react-day-picker would
 * unmount and remount this row — and whatever had focus inside it — every time
 * the month changed. `goToMonth` is the same navigation the arrows use, so
 * "this month" cannot desynchronise from them.
 *
 * `today` comes from the day picker's own props, which is the app's clock passed
 * down by the caller rather than the machine's.
 */
function MonthNav({ onPreviousClick, onNextClick, previousMonth, nextMonth, className, ...props }: NavProps) {
  const t = useTranslations('datePicker');
  const { goToMonth, months, dayPickerProps } = useDayPicker();

  const today = dayPickerProps.today ?? new Date();
  const shown = months[0]?.date;

  // Disabled once the grid is already on it — a control that would do nothing
  // should say so before it is pressed rather than after. Also when today is
  // outside the span this field allows at all, where it would refuse silently.
  const startMonth = dayPickerProps.startMonth;
  const endMonth = dayPickerProps.endMonth;

  const outOfRange =
    (startMonth !== undefined && monthIndex(today) < monthIndex(startMonth)) ||
    (endMonth !== undefined && monthIndex(today) > monthIndex(endMonth));

  const onThisMonth = Boolean(shown && monthIndex(shown) === monthIndex(today));

  return (
    <nav className={className} {...props}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-label text-muted-foreground hover:text-foreground"
        disabled={onThisMonth || outOfRange}
        onClick={() => goToMonth(today)}
      >
        {t('today')}
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
      <TooltipHint label={t('previousMonth')}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={stepButtonClassName}
          aria-label={t('previousMonth')}
          disabled={!previousMonth}
          onClick={onPreviousClick}
        >
          <Caret direction="start" className={stepCaretClassName} />
        </Button>
      </TooltipHint>

      <TooltipHint label={t('nextMonth')}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={stepButtonClassName}
          aria-label={t('nextMonth')}
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
 * callback as a prop — and it must not be declared inside the panel's render,
 * which would remount the caption row on every month change. A context is the
 * seam: the panel publishes "open the month grid" and the caption calls it.
 */
const CaptionContext = createContext<(() => void) | null>(null);

/**
 * The caption: one control naming the month *and* the year, and the way in to
 * the month grid.
 *
 * react-day-picker's `captionLayout="dropdown"` gives two selects — a month and
 * a year — which is a reasonable shape for a date of birth and a poor one for
 * everything else, where the two are one thought: you are going to *next March*,
 * not to a month and then separately to a year. Two controls also cost the
 * caption twice the width, and this panel shares its top row with the step
 * controls.
 *
 * Pressing it swaps the day grid for twelve months (see `MonthGridPanel`) —
 * a picker inside the picker rather than a platform dropdown covering it.
 */
function MonthCaption({ calendarMonth, displayIndex: _displayIndex, className, ...props }: MonthCaptionProps) {
  const t = useTranslations('datePicker');
  const { formatters } = useDayPicker();
  const openMonths = useContext(CaptionContext);

  return (
    <div className={className} {...props}>
      <button
        type="button"
        aria-expanded={false}
        aria-label={t('pickMonth')}
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
  const t = useTranslations('datePicker');

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
          {t('today')}
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
 * three states live here once: the filled cell is what the panel is currently
 * on, the outline is where *now* is, and everything else is plain text. See the
 * day grid's `day_button` for the outline-not-fill reasoning; this is the same
 * mark one and two levels up.
 */
function ChooserCell({
  shown,
  current,
  disabled,
  onClick,
  children,
}: {
  /** The month or year the panel is on. At most one cell in the grid. */
  shown: boolean;
  /** The month or year it actually is. Drops when it is also the shown one. */
  current: boolean;
  /** Entirely outside the span this field allows — see `startMonth`/`endMonth`. */
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={shown ? 'date' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // 44px tall: the same touch floor the day cells clear, and tall enough
        // that a month name has room to sit on its own line.
        'flex min-h-11 items-center justify-center rounded-md px-1 text-body-sm transition-colors',
        // Half strength, the same way every disabled control in the app reads.
        // A month with no selectable day in it is not a quieter choice, it is
        // not a choice — the day grid would only refuse every cell in it.
        'disabled:pointer-events-none disabled:opacity-50',
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
  startMonth,
  endMonth,
  onSelect,
  onBackToDays,
}: {
  locale: Locale;
  /** The month the day grid is on — its year is the one shown. */
  value: Date;
  today: Date | undefined;
  /** The span the field allows, if it states one. Cells outside it are dead. */
  startMonth?: Date;
  endMonth?: Date;
  onSelect: (month: Date) => void;
  /**
   * Closes the chooser and hands the panel back to the day grid, on whatever
   * month it was already on. What the year grid's caption does — the last step
   * of the ring, and the only one that leaves this component.
   */
  onBackToDays: () => void;
}) {
  const t = useTranslations('datePicker');
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

  // The app's own locale rules: Latin digits and Gregorian months in Arabic
  // too, exactly as the day grid's formatters are built.
  const monthName = new Intl.DateTimeFormat(toIntlLocale(locale), {
    month: 'long',
    numberingSystem: 'latn',
    calendar: 'gregory',
  });

  const outsideRange = (candidate: Date) =>
    (startMonth !== undefined && monthIndex(candidate) < monthIndex(startMonth)) ||
    (endMonth !== undefined && monthIndex(candidate) > monthIndex(endMonth));

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
          caption={<span dir="ltr">{`${yearPage} – ${yearPage + YEARS_PER_PAGE - 1}`}</span>}
          /*
            "Choose a day", because that is where this press lands — the label
            names the destination, the way the other two rungs do. It is the
            one caption whose grid and whose label disagree, and deliberately:
            the years are already on screen and do not need announcing, and a
            button labelled after the thing under it would say nothing about
            what pressing it does.
          */
          captionLabel={t('pickDay')}
          expanded
          onCaption={onBackToDays}
          previousLabel={t('previousYears')}
          nextLabel={t('nextYears')}
          onPrevious={() => setYearPage((current) => current - YEARS_PER_PAGE)}
          onNext={() => setYearPage((current) => current + YEARS_PER_PAGE)}
        />

        <div role="group" aria-label={t('pickYear')} className="grid grid-cols-3 gap-1">
          {Array.from({ length: YEARS_PER_PAGE }, (_, index) => yearPage + index).map((candidate) => (
            <ChooserCell
              key={candidate}
              shown={candidate === year}
              current={candidate === thisYear}
              // Dead only when *every* month of it is out of reach: a year
              // holding the bound itself still has days you can pick.
              disabled={outsideRange(new Date(candidate, 11, 1)) && outsideRange(new Date(candidate, 0, 1))}
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
        captionLabel={t('pickYear')}
        expanded={false}
        onCaption={() => {
          // Open on the page holding the year we are on, not on wherever the
          // last look around left off.
          setYearPage(yearPageStart(year, thisYear));
          setPickingYear(true);
        }}
        previousLabel={t('previousYear')}
        nextLabel={t('nextYear')}
        onPrevious={() => setYear((current) => current - 1)}
        onNext={() => setYear((current) => current + 1)}
      />

      <div role="group" aria-label={t('pickMonth')} className="grid grid-cols-3 gap-1">
        {Array.from({ length: 12 }, (_, index) => new Date(year, index, 1)).map((date) => (
          <ChooserCell
            key={date.getMonth()}
            shown={year === value.getFullYear() && date.getMonth() === value.getMonth()}
            current={Boolean(today && year === today.getFullYear() && date.getMonth() === today.getMonth())}
            disabled={outsideRange(date)}
            onClick={() => onSelect(date)}
          >
            <span className="truncate">{monthName.format(date)}</span>
          </ChooserCell>
        ))}
      </div>
    </div>
  );
}

/**
 * The caption as **two dropdowns**, a month and a year, instead of the ring.
 *
 * The ring is right for a date near today: one press, twelve months, done. It is
 * the wrong shape for a date of *birth*, where the year is the hard part and the
 * month is an afterthought — 1974 is two presses and a page of years away, and
 * the person typing it is mid-booking with a patient in front of them. Two lists
 * put both halves one press from anywhere in the range.
 *
 * They are the app's own `SelectField`, not `<select>` and not a second menu
 * written here: it already portals into the surrounding `<dialog>`, flips and
 * clamps to the room available, reads its side from the locale's direction, and
 * scrolls a hundred years to the row you are on. What is local is the shape —
 * a 40px pair on one row, the month given the wider track because a month name
 * is a word and a year is four digits.
 *
 * The step arrows go with the ring. At 264px a row holding two dropdowns and two
 * arrows leaves the month about 110px, which truncates September and سبتمبر
 * both — and paging one month at a time is the gesture these lists exist to
 * replace.
 */
function CaptionDropdowns({
  locale,
  month,
  onMonthChange,
  startMonth,
  endMonth,
}: {
  locale: Locale;
  /** The month on screen. Its own year is the one the year list is on. */
  month: Date;
  onMonthChange: (month: Date) => void;
  startMonth?: Date;
  endMonth?: Date;
}) {
  const t = useTranslations('datePicker');

  const monthName = new Intl.DateTimeFormat(toIntlLocale(locale), {
    month: 'long',
    numberingSystem: 'latn',
    calendar: 'gregory',
  });

  const year = month.getFullYear();

  /*
    All twelve, always.

    The month grid disables a month the bounds put out of reach, and that is
    right for a *cell*: pressing it would be pressing the answer. This list is
    not the answer, it is how you get around — someone entering a birth date
    lands on the capped month (today's) and picks the month before the year,
    which with December through the cap greyed out means the list refuses the
    obvious first move and gives no reason. The bound is still kept where it is
    enforced: every day after it is a dead cell in the grid below.
  */
  const monthOptions = Array.from({ length: 12 }, (_, index) => ({
    value: String(index),
    label: monthName.format(new Date(year, index, 1)),
  }));

  /*
    Newest first.

    A year list is the one place in this panel where chronological order is the
    wrong order: every bound this picker is given runs *backwards* from now — a
    date of birth is capped at today — so ascending puts the years nobody
    reaches at the top and opens a hundred-row list at its own bottom edge.
    Counting back from this year is also how the answer is remembered.
  */
  const firstYear = startMonth?.getFullYear() ?? year - 100;
  const lastYear = endMonth?.getFullYear() ?? year + 5;

  const yearOptions = Array.from({ length: Math.max(lastYear - firstYear + 1, 1) }, (_, index) => {
    const candidate = lastYear - index;
    return { value: String(candidate), label: String(candidate) };
  });

  return (
    /*
      One row, two tracks, and the month takes the wider one: it carries a word
      that has to survive both languages at this width, and the year is four
      digits whatever happens. `minmax(0, …)` on both so a long month name
      truncates inside its own track instead of pushing the year off the panel.

      `mb-2` — a step more than the grid's own row gap. The pair is a control
      *over* the calendar rather than part of it, and at the gap the weeks use
      the dropdowns read as a first row of the table.
    */
    <div className="mb-2 grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-2">
      <SelectField
        size="sm"
        aria-label={t('pickMonth')}
        value={String(month.getMonth())}
        options={monthOptions}
        onValueChange={(next) => onMonthChange(new Date(year, Number(next), 1))}
        // 40px tall and tighter than a form field's 20px inline padding: this
        // pair is inside a 264px popover, and `.q-field`'s own padding is drawn
        // for a control that has a whole column to sit in.
        className="h-10 ps-3 pe-2.5 text-body-sm font-medium"
      />

      <SelectField
        size="sm"
        aria-label={t('pickYear')}
        value={String(year)}
        options={yearOptions}
        // Picking a year keeps the month you were on — the two lists are one
        // control, and a year that quietly moved the month beside it would undo
        // half of what was just chosen.
        onValueChange={(next) => onMonthChange(new Date(Number(next), month.getMonth(), 1))}
        // Lining digits, so 2019 and 2026 are the same width in the trigger and
        // the list does not shimmer as it scrolls.
        className="h-10 ps-3 pe-2.5 text-body-sm font-medium tabular-nums"
      />
    </div>
  );
}

export type DateChooserProps = {
  locale: Locale;
  /** The day drawn as chosen. */
  selected?: Date;
  onSelect: (date: Date) => void;
  /** The day marked as today. Pass the app's clock rather than the machine's. */
  today?: Date;
  /** The span the grids may reach. Months and years outside it are dead cells. */
  startMonth?: Date;
  endMonth?: Date;
  /** Days that cannot be chosen inside that span. */
  disabled?: Matcher | Matcher[];
  /** Extra named states — the calendar toolbar marks the range on screen. */
  modifiers?: Record<string, Matcher | Matcher[]>;
  modifiersClassNames?: Record<string, string>;
  /** See `DateCalendar`'s own note: `primary` spends the accent on the chosen day. */
  selectedTone?: 'neutral' | 'primary';
  /** The month the panel opens on. Defaults to the chosen day, then to today. */
  defaultMonth?: Date;
  autoFocus?: boolean;
  className?: string;
  /**
   * How the panel is navigated.
   *
   * `chooser` — the default — is the caption ring: one control naming the month
   * and the year, opening onto twelve months and then a page of years. It suits
   * a date near today, which is most of them.
   *
   * `dropdowns` is a month list and a year list side by side, for the field
   * where the year is the question rather than a detail. See `CaptionDropdowns`.
   */
  caption?: 'chooser' | 'dropdowns';
};

/**
 * The panel itself: the day grid, and the two chooser grids its caption opens.
 *
 * The month on screen is state here rather than in each caller, because three
 * things move it — paging, the caption's "this month", and picking a month out
 * of the chooser — and only this component sees all three.
 */
export function DateChooser({
  locale,
  selected,
  onSelect,
  today,
  startMonth,
  endMonth,
  disabled,
  modifiers,
  modifiersClassNames,
  selectedTone = 'neutral',
  defaultMonth,
  autoFocus = true,
  className,
  caption = 'chooser',
}: DateChooserProps) {
  const [month, setMonth] = useState<Date>(defaultMonth ?? selected ?? today ?? new Date());

  /*
    Which of the two grids the panel is showing. It is one surface with two
    contents rather than a second panel over the first: a panel that opens
    another panel on top of itself is two things to dismiss, and the month grid
    answers the same question the day grid does, one level up.

    Only the ring has it. In `dropdowns` the two lists are the way out of this
    month, and there is nothing for the caption to open.
  */
  const [pickingMonth, setPickingMonth] = useState(false);

  const dropdowns = caption === 'dropdowns';

  /*
    What the *grid* may be paged to, as opposed to what may be picked in it.

    react-day-picker treats `startMonth`/`endMonth` as navigation bounds and
    refuses to display a month outside them — so with a cap of today, asking the
    month list for December left the panel sitting on August. In `dropdowns` the
    bounds are rounded out to whole years for that reason: the lists can reach
    any month of any year they offer, and `disabled` still refuses every day past
    the cap. The ring keeps the tight bounds, where a month it cannot navigate to
    is a cell it draws as dead.
  */
  const navStart = dropdowns && startMonth ? new Date(startMonth.getFullYear(), 0, 1) : startMonth;
  const navEnd = dropdowns && endMonth ? new Date(endMonth.getFullYear(), 11, 31) : endMonth;

  if (pickingMonth && !dropdowns) {
    return (
      <MonthGridPanel
        locale={locale}
        value={month}
        today={today}
        startMonth={startMonth}
        endMonth={endMonth}
        onSelect={(picked) => {
          setMonth(picked);
          setPickingMonth(false);
        }}
        // Closing the ring. The month stays where it was — the caption is how
        // you look around, and only a cell moves the panel.
        onBackToDays={() => setPickingMonth(false)}
      />
    );
  }

  return (
    <CaptionContext.Provider value={() => setPickingMonth(true)}>
      {dropdowns && (
        <CaptionDropdowns
          locale={locale}
          month={month}
          onMonthChange={setMonth}
          startMonth={startMonth}
          endMonth={endMonth}
        />
      )}

      <DateCalendar
        locale={locale}
        selected={selected}
        month={month}
        onMonthChange={setMonth}
        startMonth={navStart}
        endMonth={navEnd}
        disabled={disabled}
        today={today}
        modifiers={modifiers}
        modifiersClassNames={modifiersClassNames}
        selectedTone={selectedTone}
        /*
          `label` rather than `dropdown`: the caption is `MonthCaption` here,
          which brings its own single month-and-year chooser, so the two selects
          react-day-picker would otherwise build are not wanted.
        */
        captionLayout="label"
        components={{
          Nav: MonthNav,
          MonthCaption,
          /*
            `Chevron` too, so every arrow in this panel is the same glyph. The
            calendar ships lucide's chevrons, which are a lighter stroke drawn
            on a different grid — beside the caret the month arrows use, the one
            on the month dropdown read as a mark borrowed from another set.
            `orientation` is physical, which is react-day-picker's own wording;
            `Caret` takes the logical name and does the mirroring, so "left" is
            `start` and it points the right way in Arabic.
          */
          Chevron: ({ orientation, className: chevronClassName }) => (
            <Caret
              direction={orientation === 'left' ? 'start' : orientation === 'right' ? 'end' : 'down'}
              className={chevronClassName}
            />
          ),
        }}
        classNames={{
          /*
            The grid spans the panel rather than sitting to its own width.

            The registry's root is `w-fit`, which sizes the calendar to seven
            cells and leaves whatever the popover has left over as slack —
            visible as a margin down one side of a fixed-width panel. `w-full`
            hands the row to the seven columns instead, and since every part
            below it is already `w-full` or `flex-1` they divide it evenly.
            `--cell-size` stops being the column width and becomes its floor.
          */
          root: 'w-full',
          /*
            The caption row: the month chooser at the inline-start — the top
            *right* in Arabic — and the step controls at the inline-end. Both
            are logical, so the pair swaps sides with the language and the
            chooser always sits where the reading starts.
          */
          /*
            With the dropdowns above, the grid's own caption row has nothing
            left to say — but it stays in the accessibility tree rather than
            being removed. react-day-picker announces the month through it as
            you page with the keyboard, and `hidden` would take that away; the
            nav is the one part with no non-visual job, so it goes.
          */
          month_caption: dropdowns ? 'sr-only' : 'flex h-8 w-full items-center justify-start px-0',
          nav: dropdowns ? 'hidden' : 'absolute inset-y-0 end-0 top-0 flex h-8 items-center gap-0.5',
          /*
            An 11px header at 28px tall. The weekday row is a key to the columns
            under it, not a row of the grid — at the day cells' own size it
            competed with them for the first read. Size and weight do that
            separating now: the ink is the same black as the dates, so grey is
            left meaning one thing in this panel, "another month".
          */
          weekday:
            'flex-1 h-7 flex items-center justify-center text-[0.6875rem] font-medium text-foreground select-none',
          /*
            Square cells with the system radius, not circles. A circle is the
            shape for a single marked day on a wall calendar; this grid can mark
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
              whose label is olive — the system's "act on me" colour — so every
              one of the 42 dates in the grid was drawn in it. A month of olive
              numbers reads as a month of links, and it left the chosen day with
              no colour of its own to be chosen *in*. The grid is text now; the
              fill is what marks a date.
            */
            'text-foreground hover:text-foreground',
            /*
              Except the days either side of this month, which are light grey.

              The `outside` entry below sets that colour on the `<td>`, and it
              never reached the numeral: the pressable part is a `Button` with a
              colour of its own, and the line above set every one of the 42
              cells to black. September's grid ran from the 30th of August to
              the 4th of October in one unbroken black, so the month on screen
              had no edges.

              They stay *pressable* — grey is the difference between "another
              month" and "this one", not between live and dead, and clicking the
              30th of August is a reasonable way to get to August. It is a
              colour, not `opacity-50`, for exactly that reason: half strength
              is what this app dims disabled controls with.

              Skipped on the chosen day, which can itself be an outside day once
              you press one — there the white-on-fill is the point.
            */
            'group-data-[outside=true]/day:not-data-[selected-single=true]:text-muted-foreground/70',
            /*
              An edge on today, whichever day is chosen.

              The two marks answer different questions and the panel needs both
              at once: the filled cell is the day you have *picked*, and this
              outline is the day it actually is. Pick Monday while it is Sunday
              and the grid should still be able to say where Sunday is —
              otherwise the only fixed point in the month disappears the moment
              you move off it.

              An inset ring rather than a border: the cell is a fixed square in
              a grid that divides the panel, and a border would take its width
              out of the numeral's box and shift the digit by a pixel on one day
              of the month.

              Outline and numeral, no fill. The cell used to carry a grey
              square, which put two filled shapes in the grid and the eye had to
              work out which of them was the answer to the question it asked.
            */
            'group-data-[today=true]/day:ring-1 group-data-[today=true]/day:ring-inset group-data-[today=true]/day:ring-primary',
            'group-data-[today=true]/day:not-data-[selected-single=true]:text-primary',
            'group-data-[today=true]/day:not-data-[selected-single=true]:hover:text-primary',
            /*
              No ring on the chosen day. It keeps DOM focus after it is clicked,
              so the focus ring sat around it for as long as the panel stayed
              open — a second mark on top of the fill that already says which day
              this is. Keyboard navigation still rings every *other* day it lands
              on, which is where the ring is the only thing saying where you are.
            */
            'data-[selected-single=true]:border-transparent data-[selected-single=true]:ring-0',
          ),
          // No fill of its own — the ring and numeral on the button inside are
          // the whole of today's mark. The cell keeps the radius so the ring it
          // clips against is the grid's own shape.
          today: 'rounded-md',
          outside: 'text-muted-foreground/70 aria-selected:text-muted-foreground/70',
        }}
        onSelect={onSelect}
        /*
          A 32px floor on the column, down from the registry's 36px.

          It is not the width — `root` is `w-full`, so the seven columns divide
          the panel between them. It sets the cells' minimum, which is what keeps
          them clear of the touch floor, and the cells are square so it sets the
          row height too.
        */
        className={cn('[--cell-size:--spacing(8)]', className)}
        autoFocus={autoFocus}
      />
    </CaptionContext.Provider>
  );
}
