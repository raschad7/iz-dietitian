'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { addMonths, isSameMonth, monthGridDays } from '../date';
import { formatDayNumber, formatLongDate, formatMonthYear, formatWeekday } from '../format';

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
 * Built here rather than in `src/components/ui/` because every date fact it
 * needs — the six-week grid, the wall-clock formatters — already lives in this
 * feature. It is self-contained enough to promote the day someone else needs a
 * date picker, and it deliberately does not reach for the native
 * `<input type="date">` the appointment dialog uses: that one is a field being
 * *filled in*, this one is a place being *navigated to*, and a browser picker
 * cannot mark today or the selected range the way the rest of the calendar does.
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

export function DatePickerButton({ locale, value, range, today, label, onSelect }: DatePickerButtonProps) {
  const t = useTranslations('booking');

  const [open, setOpen] = useState(false);
  /** Which month the grid is showing. Paging it does not move the calendar. */
  const [month, setMonth] = useState(value);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  /*
   * Following the arrows or the Today button moves the anchor while this is
   * closed, and paging the grid moves the month without moving the anchor. The
   * two are re-synced on *opening* rather than in an effect on `value`: the
   * grid should always open on the month you are looking at, and an effect
   * would additionally snap it back mid-browse the moment a click landed.
   */
  function toggle(): void {
    if (!open) setMonth(value);
    setOpen(!open);
  }

  /*
   * Escape and an outside `pointerdown` both close it — the same pair
   * `SidebarProfile` uses, and for the same reason: a panel that covers the
   * grid must be dismissible without hunting for its trigger. `pointerdown`
   * rather than `click`, so the panel is gone before whatever is underneath it
   * acts.
   */
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const days = monthGridDays(month);

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        // Tertiary, matching the Today button beside it — see the note there.
        // `ghost` marks itself while open with the same neutral fill it takes
        // on hover, via the variant's own `aria-expanded` classes.
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
        /*
          Centred, with no disclosure chevron. The label is the one thing in
          this row that says *where you are*, and it sits on the toolbar's
          centre line — a glyph pinned to one end pushed the text off that line
          by half its width and made the middle zone read as lopsided against
          the two chevrons framing it. The button's own `aria-expanded` fill
          already marks the panel as open, and `aria-haspopup` announces it.
        */
        className="min-w-52 justify-center"
      >
        <span className="truncate" dir="auto">
          {label}
        </span>
      </Button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t('nav.pickDate')}
          /*
            Centred on the trigger in both directions. `start-1/2` resolves to
            `right: 50%` in Arabic while `translate-x` stays physical, so the
            RTL half has to flip the sign — a transform has no logical
            equivalent to reach for here.
          */
          className={cn(
            'absolute top-full z-40 mt-2 w-80 start-1/2 -translate-x-1/2 rtl:translate-x-1/2',
            'rounded-lg border border-border bg-popover p-3 shadow-elevated',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('nav.previousMonth')}
              onClick={() => setMonth(addMonths(month, -1))}
            >
              <Icon name="chevronStart" />
            </Button>

            <span className="text-label font-semibold" dir="auto">
              {formatMonthYear(locale, month)}
            </span>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('nav.nextMonth')}
              onClick={() => setMonth(addMonths(month, 1))}
            >
              <Icon name="chevronEnd" />
            </Button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5">
            {days.slice(0, 7).map((date) => (
              <span key={`weekday-${date}`} className="pb-1 text-center text-caption text-muted-foreground">
                {formatWeekday(locale, date)}
              </span>
            ))}

            {days.map((date) => {
              // ISO dates are zero-padded, so string comparison *is*
              // chronological comparison — the same property the rest of the
              // feature leans on rather than parsing.
              const selected = date >= range.from && date <= range.to;

              return (
                <button
                  key={date}
                  type="button"
                  aria-label={formatLongDate(locale, date)}
                  // The one anchor date, not the whole range: `aria-current`
                  // names *the* current item, and seven of them announces
                  // nothing. The range is a visual summary of what is on
                  // screen; the label above already reads it out in words.
                  aria-current={date === value ? 'date' : undefined}
                  onClick={() => {
                    onSelect(date);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex h-9 items-center justify-center rounded-md text-body-sm tabular-nums',
                    'transition-colors duration-200 ease-[cubic-bezier(.2,.6,.2,1)]',
                    'hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    // A day from a neighbouring month is context, not a
                    // destination you were looking for — still clickable, but
                    // quieter than the month you paged to.
                    !isSameMonth(date, month) && 'text-muted-foreground',
                    // Today is the tint; the range on screen is the fill. Two
                    // states, two weights, and the range wins where they
                    // coincide — today inside this week is still this week.
                    date === today && 'bg-secondary font-semibold text-secondary-foreground',
                    selected && 'bg-primary font-semibold text-primary-foreground hover:bg-primary-hover',
                  )}
                >
                  {formatDayNumber(locale, date)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
