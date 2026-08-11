'use client';

import { useMemo } from 'react';
import { type Matcher } from 'react-day-picker';

import { Calendar } from '@/components/ui/calendar';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { toIntlLocale } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The month grid every date control in the app is built from — the registry's
 * calendar with the app's locale rules on it, and nothing else.
 *
 * It is the bottom layer of two. The chrome around the grid — the caption that
 * opens a month and then a year chooser, the step arrows, the dense cells —
 * lives in `DateChooser`, which is what a caller normally wants; this is here
 * for the parts that are the same whatever surface the grid ends up on, stated
 * once rather than at each call site.
 *
 * Built on `@/components/ui/calendar` — shadcn's Calendar, react-day-picker
 * underneath — with the app's own locale rules layered on top, stated once
 * here rather than at each call site:
 *
 * - **Latin digits and the Gregorian calendar in Arabic too.** Every string in
 *   the grid goes through `Intl` with the tags from `toIntlLocale`, which pin
 *   `nu-latn` and `ca-gregory`. Left to its own locale data the grid renders
 *   Arabic-Indic numerals beside Latin ones on the same screen.
 * - **Sunday starts the week**, matching the booking grid and
 *   `clinics.working_days`.
 * - **`dir` follows the app's locale**, not the browser's.
 *
 * Values cross this boundary as `YYYY-MM-DD` strings, never as `Date`s. The
 * conversion happens once, here, through the matched `isoToLocalDate` /
 * `toIsoDate` pair — the thing that keeps a picked day the same day in every
 * time zone.
 */

export type DateCalendarProps = {
  locale: Locale;
  /** The day drawn as chosen. */
  selected?: Date;
  /** Called with the clicked day. Never called with `undefined` — see below. */
  onSelect?: (date: Date) => void;
  /** Which month opens. Defaults to the selected one, then to this month. */
  defaultMonth?: Date;
  /** The span the arrows and the year dropdown may reach. */
  startMonth?: Date;
  endMonth?: Date;
  /** Days that cannot be chosen. */
  disabled?: Matcher | Matcher[];
  /** Extra named states, drawn by `modifiersClassNames` — the toolbar's visible range. */
  modifiers?: Record<string, Matcher | Matcher[]>;
  modifiersClassNames?: Record<string, string>;
  /** The day marked as today. Pass the app's clock rather than the machine's. */
  today?: Date;
  captionLayout?: 'label' | 'dropdown' | 'dropdown-months' | 'dropdown-years';
  autoFocus?: boolean;
  className?: string;
  /**
   * The month on screen, when the caller drives it. Left out, the grid pages
   * itself from `defaultMonth`.
   */
  month?: Date;
  onMonthChange?: (month: Date) => void;
  /**
   * Per-part class overrides, merged *after* the ones below. For a caller whose
   * surface asks for a different grid — the calendar toolbar's popover is
   * denser than a form field's — not for restyling one day cell.
   */
  classNames?: React.ComponentProps<typeof Calendar>['classNames'];
  /** Part overrides, chiefly `Nav` for a caller adding its own month controls. */
  components?: React.ComponentProps<typeof Calendar>['components'];
  /**
   * What colour the chosen day is filled with.
   *
   * `neutral` — the default — is the registry's own look, a black day on white,
   * reached by pointing `--primary` at the foreground for this subtree. That
   * exists because the registry calendar paints the selected day with
   * `bg-primary`, this app's primary is olive, and a form's month grid came out
   * as a field of green — a colour the rest of the app spends on one action per
   * screen.
   *
   * `primary` opts back into the olive. The toolbar's date picker is not a
   * field in a form: it is the control that says where the calendar is, the
   * chosen day is the answer to the only question the panel asks, and one green
   * cell in a popover is the single accent that screen was already spending.
   */
  selectedTone?: 'neutral' | 'primary';
};

/**
 * The grid on its own, for callers that bring their own surface — the calendar
 * toolbar drops one into the popover its range label already opened.
 *
 * Single-date only: every date in this app is one day, so the mode is fixed
 * here instead of being a prop every call site has to repeat.
 */
export function DateCalendar({
  locale,
  selected,
  onSelect,
  defaultMonth,
  startMonth,
  endMonth,
  disabled,
  modifiers,
  modifiersClassNames,
  today,
  captionLayout = 'dropdown',
  autoFocus,
  className,
  month,
  onMonthChange,
  classNames,
  components,
  selectedTone = 'neutral',
}: DateCalendarProps) {
  const formatters = useMemo(() => {
    const intlLocale = toIntlLocale(locale);
    const format = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(intlLocale, { ...options, numberingSystem: 'latn', calendar: 'gregory' });

    const day = format({ day: 'numeric' });
    /*
      Two-letter weekdays in Arabic, `short` in English.

      Neither of `Intl`'s Arabic widths is usable here. `short` is not short —
      it returns the whole word, الأربعاء, eight letters — and seven of those in
      a 34px column is not a header row, it is one unbroken line of Arabic
      across the top of the grid with nothing above the column it names.
      `narrow` is a single letter, which fits but does not identify: it gives
      ث for both الاثنين and الثلاثاء, and ح for الأحد against ج for الجمعة, so
      the reader is left counting columns.

      The pairs below are the clinic's own, and they are the shortest form that
      still tells the days apart: the first letters of each name, plus a second
      wherever the first is shared. English keeps `short`, where "Wed" fits and
      "S M T W T F S" is the version that makes a reader count.
    */
    const arabicWeekdays = ['اح', 'اث', 'ثل', 'ار', 'خم', 'جم', 'سب'];
    const weekday = format({ weekday: 'short' });
    const monthName = format({ month: 'long' });
    const year = format({ year: 'numeric' });
    const caption = format({ month: 'long', year: 'numeric' });

    return {
      formatDay: (date: Date) => day.format(date),
      // Indexed by `getDay()`, which is 0 for Sunday — the same column the grid
      // starts on, so the pair and the column cannot drift apart. The fallback
      // is for the type only: `getDay()` is 0–6, but nothing in the type system
      // says so, and `Intl` is the right answer if that ever stops being true.
      formatWeekdayName: (date: Date) =>
        (locale === 'ar' ? arabicWeekdays[date.getDay()] : undefined) ?? weekday.format(date),
      formatMonthDropdown: (date: Date) => monthName.format(date),
      formatYearDropdown: (date: Date) => year.format(date),
      formatCaption: (date: Date) => caption.format(date),
    };
  }, [locale]);

  return (
    <Calendar
      mode="single"
      dir={getLocaleDirection(locale)}
      // Sunday: the clinic's week, and the same first column the booking grid
      // and the month view already draw.
      weekStartsOn={0}
      selected={selected}
      month={month}
      onMonthChange={onMonthChange}
      components={components}
      defaultMonth={defaultMonth ?? selected}
      startMonth={startMonth}
      endMonth={endMonth}
      disabled={disabled}
      modifiers={modifiers}
      modifiersClassNames={modifiersClassNames}
      today={today}
      captionLayout={captionLayout}
      formatters={formatters}
      autoFocus={autoFocus}
      onSelect={(date) => {
        // `undefined` is react-day-picker reporting that the chosen day was
        // clicked a second time. A date field is not a toggle — clicking today
        // again still means today — so that call is dropped rather than
        // clearing the field.
        if (date) onSelect?.(date);
      }}
      /*
        The registry calendar's own theme, unmodified.

        This used to carry a block of `classNames` overrides — 36px cells,
        gapped weeks, fully round days, a restyled caption dropdown — each with
        a reason, and together they were a second calendar design maintained by
        hand on top of the one the registry ships. Reverted deliberately: the
        point of taking components from the registry is that their appearance
        arrives and stays with them, and the next `add --diff` can now tell us
        something useful instead of drowning in local edits.

        `p-0` and a transparent fill remain because the popover around it
        already supplies the surface and the padding, which is how the
        registry's own date-picker example composes the two.

        The two `--primary` rebindings are the whole of the theming, and they
        rebind rather than restyle: the registry calendar paints its selected
        day with `bg-primary`, this app's primary is olive, so a month grid came
        out as a field of green — a colour the rest of the app spends on one
        action per screen. Pointing `--primary` at the foreground for this
        subtree alone produces the registry's own look, a black day on white,
        and leaves every button on the page untouched.

        A caller can decline it — see `selectedTone`. Handled here rather than
        left to the caller's `className`, because two `[--primary:…]` arbitrary
        properties at equal specificity are decided by the order Tailwind
        happens to emit them in, which is not something to depend on.
      */
      className={cn(
        'bg-transparent p-0',
        selectedTone === 'neutral' &&
          '[--primary:var(--foreground)] [--primary-foreground:var(--background)]',
        className,
      )}
      classNames={classNames}
    />
  );
}
