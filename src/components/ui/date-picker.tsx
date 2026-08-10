'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { type Matcher } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getLocaleDirection, type Locale } from '@/i18n/routing';
import { toIntlLocale } from '@/lib/format';
import { isoToLocalDate, toIsoDate, type IsoDate } from '@/lib/iso-date';
import { cn } from '@/lib/utils';

/**
 * The app's date picker: a month grid whose caption is **a month dropdown and a
 * year dropdown**, not a pair of arrows.
 *
 * Paging a month at a time is fine for booking next Tuesday and useless for a
 * date of birth, which is the field that made this necessary: 1974 is six
 * hundred clicks from here. The dropdowns put every date in range one gesture
 * away, and the arrows stay for the near dates where they are quicker.
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

/** How far the year dropdown reaches when the field states no bound of its own. */
const YEARS_BACK = 100;
const YEARS_AHEAD = 5;

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
}: DateCalendarProps) {
  const formatters = useMemo(() => {
    const intlLocale = toIntlLocale(locale);
    const format = (options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(intlLocale, { ...options, numberingSystem: 'latn', calendar: 'gregory' });

    const day = format({ day: 'numeric' });
    /*
      Narrow weekdays in Arabic, short ones in English.
      `short` in Arabic is not short: `Intl` returns the whole word — الأربعاء,
      eight letters — and seven of those in a 36px column each is not a header
      row, it is one unbroken line of Arabic running across the top of the grid
      with nothing above the column it names. Narrow is the single letter
      (ح ن ث ر خ ج س), which is what a column that size can hold. English keeps
      `short`: "Wed" fits, and "S M T W T F S" makes a reader count.
    */
    const weekday = format({ weekday: locale === 'ar' ? 'narrow' : 'short' });
    const monthName = format({ month: 'long' });
    const year = format({ year: 'numeric' });
    const caption = format({ month: 'long', year: 'numeric' });

    return {
      formatDay: (date: Date) => day.format(date),
      formatWeekdayName: (date: Date) => weekday.format(date),
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
        36px cells rather than shadcn's 28px. Three things share that column
        width — a two-digit day, a weekday abbreviation, and the pointer — and
        at 28px the widest weekday abbreviation in either language was touching
        its neighbours. It is also the row height the rest of the app's dense
        controls use.
      */
      className={cn('bg-transparent p-0 [--cell-size:--spacing(9)]', className)}
      classNames={{
        /*
          The caption's two dropdowns are real `<select>`s sitting invisibly
          over a styled label. Giving the visible half the app's own hover fill
          and focus ring is what makes it read as pressable rather than as a
          caption that happens to have a chevron beside it.
        */
        dropdown_root:
          'relative rounded-md transition-colors hover:bg-accent has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-ring',
        caption_label:
          'flex items-center gap-1 rounded-md px-2 py-1 text-body-sm font-semibold [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
        /*
          A gap between the days, and the same gap above the first week.

          shadcn's grid butts every cell against the next, which is right for a
          range picker — the run of chosen days has to read as one bar — and
          wrong for this one, which only ever holds a single date. Flush cells
          turned the toolbar's "this month is on screen" tint into a solid block
          of colour with numbers on it, and left the day under the pointer with
          no edge of its own to light up. `gap-0.5` is enough to separate them
          and not enough to stop the week reading as a row.
        */
        weekdays: 'flex gap-0.5',
        weekday: 'flex-1 text-caption font-normal text-muted-foreground select-none',
        week: 'mt-0.5 flex w-full gap-0.5',
        /*
          Rewritten rather than extended, to drop two rules from the shadcn
          default: `[&:first-child[data-selected=true]_button]:rounded-s` and
          its `last-child` twin. Those exist to square off the ends of a
          selected *range* so it meets the grid edge — but they key off
          `data-selected`, which a single date sets too, so the chosen day
          flattened its outer side whenever it landed in the first or last
          column. A Sunday and a Saturday came out as half-pills; every day
          between them was a circle.
        */
        day: 'group/day relative aspect-square h-full w-full rounded-full p-0 text-center select-none',
        /*
          Same story: the default squares today off when it is also the chosen
          day, which is the common case here — the picker opens on the date the
          calendar is already showing. Today's fill just steps aside for the
          selected one instead.
        */
        today: 'rounded-full bg-muted text-foreground data-[selected=true]:bg-transparent',
        ...classNames,
      }}
    />
  );
}

export type DatePickerProps = {
  /** The chosen day as `YYYY-MM-DD`. Empty string for "nothing yet". */
  value: string;
  onChange: (value: IsoDate) => void;
  locale: Locale;
  id?: string;
  /**
   * Posts the value with the surrounding `<form>`.
   *
   * The trigger is a button and submits nothing of its own, so this renders a
   * hidden input carrying the ISO string — which is exactly what the server
   * action's schema already parses out of `<input type="date">` today.
   */
  name?: string;
  disabled?: boolean;
  /** Shown, and announced, while nothing is chosen. */
  placeholder?: string;
  /** Inclusive bounds. They gate the grid *and* the reach of the year dropdown. */
  min?: IsoDate;
  max?: IsoDate;
  /**
   * `icon` is the trigger for the two dialogs that pair this with a field
   * someone can type a date into; the default draws the whole field.
   */
  trigger?: 'field' | 'icon';
  /** The icon trigger's accessible name. Defaults to the shared "pick a date". */
  label?: string;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

export function DatePicker({
  value,
  onChange,
  locale,
  id,
  name,
  disabled,
  placeholder,
  min,
  max,
  trigger = 'field',
  label,
  className,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: DatePickerProps) {
  const t = useTranslations('datePicker');
  const [open, setOpen] = useState(false);

  /*
   * The `<dialog>` this field is sitting in, if it is sitting in one.
   *
   * Every form that picks a date in this app does it inside a modal
   * `<dialog>` — the client card, the appointment dialog, the request
   * approval — and a modal dialog renders in the browser's top layer, above
   * anything portalled to `<body>`. The popup has to be portalled *into the
   * dialog* to be visible at all.
   *
   * Read off the trigger rather than passed in: the picker is the thing that
   * knows it has a popup, and a `containerRef` prop would be three call sites
   * plumbing a ref through for a detail none of them cause. `null` on a plain
   * page, where the default `<body>` portal is right.
   */
  const [dialogHost, setDialogHost] = useState<HTMLElement | null>(null);
  const findHost = useCallback((node: HTMLElement | null) => {
    setDialogHost(node?.closest('dialog') ?? null);
  }, []);

  const selected = isoToLocalDate(value) ?? undefined;
  const lowerBound = isoToLocalDate(min ?? '');
  const upperBound = isoToLocalDate(max ?? '');

  /*
   * The span the year dropdown offers.
   *
   * A date of birth reaches a century back and a booking a few years forward,
   * so the default covers both rather than making every field say so; a field
   * with a real bound — the portal cannot request a visit in the past — passes
   * `min`/`max` and gets exactly that.
   *
   * The reach is measured from the chosen year as well as this one, so opening
   * a 1974 birthday does not present a dropdown that stops in 1926.
   */
  const thisYear = new Date().getFullYear();
  const chosenYear = selected?.getFullYear() ?? thisYear;
  const startMonth = lowerBound ?? new Date(Math.min(chosenYear, thisYear) - YEARS_BACK, 0, 1);
  const endMonth = upperBound ?? new Date(Math.max(chosenYear, thisYear) + YEARS_AHEAD, 11, 31);

  const disabledDays: Matcher[] = [
    ...(lowerBound ? [{ before: lowerBound }] : []),
    ...(upperBound ? [{ after: upperBound }] : []),
  ];

  const triggerLabel: ReactNode = selected
    ? new Intl.DateTimeFormat(toIntlLocale(locale), {
        dateStyle: 'long',
        numberingSystem: 'latn',
        calendar: 'gregory',
      }).format(selected)
    : (placeholder ?? t('empty'));

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              id={id}
              ref={findHost}
              disabled={disabled}
              /*
                `neutral` for the field: it is a box you fill in, not an action,
                and the olive label `outline` draws would make every date field
                on a form look like the thing to press. The icon trigger keeps
                `outline` — it sits beside a text input and pairs with it.
              */
              variant={trigger === 'icon' ? 'outline' : 'neutral'}
              size={trigger === 'icon' ? 'icon' : 'default'}
              aria-label={trigger === 'icon' ? (label ?? t('open')) : undefined}
              aria-invalid={ariaInvalid}
              aria-describedby={ariaDescribedBy}
              className={cn(
                /*
                  `max-w-none` cancels the button scale's own `max-w-80`, which
                  otherwise silently overrides the `w-full` beside it. A button
                  caps its width because a button is as wide as its label; a
                  field-styled trigger is a form field and belongs to its column,
                  so at any container wider than 320px the cap left the date
                  sitting short of every other field on the form.
                */
                trigger === 'field' && 'w-full max-w-none justify-between px-4 font-normal',
                trigger === 'field' && !selected && 'text-muted-foreground',
                /*
                  The system's 10px control radius, not the icon size's circle.
                  A round button is right where an icon button stands alone in a
                  row of its own kind — a table row's actions, a dialog's close
                  — but this one is glued to a text field it forms one control
                  with, and a disc butted against a 10px-cornered box read as
                  two unrelated things that happened to touch.
                */
                trigger === 'icon' && 'rounded-[10px]',
                className,
              )}
            >
              {trigger === 'icon' ? (
                <Icon name="calendar" />
              ) : (
                <>
                  {/* `dir="auto"` would flip a Latin date inside Arabic; the
                      formatter has already ordered it for this locale. */}
                  <span className="truncate">{triggerLabel}</span>
                  <Icon name="calendar" className="size-5 shrink-0 text-muted-foreground" />
                </>
              )}
            </Button>
          }
        />

        <PopoverContent
          container={dialogHost ?? undefined}
          align={trigger === 'icon' ? 'end' : 'start'}
          className="w-auto p-2"
        >
          <DateCalendar
            locale={locale}
            selected={selected}
            startMonth={startMonth}
            endMonth={endMonth}
            disabled={disabledDays}
            onSelect={(date) => {
              onChange(toIsoDate(date));
              setOpen(false);
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>

      {name ? <input type="hidden" name={name} value={value} /> : null}
    </>
  );
}
