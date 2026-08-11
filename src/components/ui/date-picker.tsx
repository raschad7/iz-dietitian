'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useState, type ReactNode } from 'react';
import { type Matcher } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { DateChooser } from '@/components/ui/date-chooser';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type Locale } from '@/i18n/routing';
import { toIntlLocale } from '@/lib/format';
import { isoToLocalDate, toIsoDate, type IsoDate } from '@/lib/iso-date';
import { cn } from '@/lib/utils';

/**
 * The app's date field: a button showing the chosen day, and the shared
 * `DateChooser` panel under it.
 *
 * The panel is the calendar toolbar's — the same grid, the same caption ring of
 * days, months and years. It used to be react-day-picker's `captionLayout`
 * dropdowns instead, which meant the month grid a client's date of birth was
 * entered into navigated differently from the one the doctor uses all day on the
 * calendar. Both reach 1974 in a couple of gestures; only one of them is a
 * control anybody has to learn twice.
 *
 * Values cross this boundary as `YYYY-MM-DD` strings, never as `Date`s. The
 * conversion happens through the matched `isoToLocalDate` / `toIsoDate` pair —
 * the thing that keeps a picked day the same day in every time zone.
 */

/** How far the chooser reaches when the field states no bound of its own. */
const YEARS_BACK = 100;
const YEARS_AHEAD = 5;

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
  /**
   * How the popup is navigated — see `DateChooser`'s own note. The default is
   * the caption ring; a field whose answer is years away asks for `dropdowns`.
   */
  caption?: 'chooser' | 'dropdowns';
  /**
   * What the chosen day is filled with — see `DateCalendar`'s own note.
   *
   * `neutral` is the default for a field: a form's month grid painted in the
   * accent came out as a field of green, and olive is what the rest of the app
   * spends on one action per screen. A field whose popup *is* the screen's one
   * question can take `primary` and mark the day the way the calendar does.
   */
  selectedTone?: 'neutral' | 'primary';
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
  caption = 'chooser',
  selectedTone = 'neutral',
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

        {/*
          A fixed 264px panel rather than one sized to its grid. Seven columns of
          a fixed cell size make the popover a different width in each language —
          the weekday header is one letter in Arabic and three in English — and a
          field's popup that changes width with the locale sits differently under
          the control it belongs to. The cells divide the panel instead.
        */}
        <PopoverContent
          container={dialogHost ?? undefined}
          align={trigger === 'icon' ? 'end' : 'start'}
          className="w-[264px] p-2"
        >
          <DateChooser
            locale={locale}
            selected={selected}
            startMonth={startMonth}
            endMonth={endMonth}
            disabled={disabledDays}
            // The month it opens on. A field with nothing in it yet opens on
            // its upper bound rather than on this month where one is set: a
            // date of birth is capped at today and reached by going back, and
            // a bound in the past is a better place to start than a month
            // whose every cell is refused.
            defaultMonth={selected ?? upperBound ?? undefined}
            caption={caption}
            selectedTone={selectedTone}
            onSelect={(date) => {
              onChange(toIsoDate(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      {name ? <input type="hidden" name={name} value={value} /> : null}
    </>
  );
}
