'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DateCalendar } from '@/components/ui/date-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type Locale } from '@/i18n/routing';
import { isoToLocalDate, toIsoDate } from '@/lib/iso-date';

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
 * The grid itself is the app's shared `DateCalendar`, so this control gained a
 * month dropdown and a year dropdown with every other date field in the app —
 * which is what jumping to *next March* from a week view now costs. What stays
 * local to the calendar is what this picker means: the day it opens on, the
 * span currently on screen, and the clinic's own idea of today, none of which a
 * general date field has.
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

  const anchor = isoToLocalDate(value) ?? undefined;
  const from = isoToLocalDate(range.from);
  const to = isoToLocalDate(range.to);

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            className="min-w-52 justify-center"
          >
            <span className="truncate" dir="auto">
              {label}
            </span>
          </Button>
        }
      />

      <PopoverContent aria-label={t('nav.pickDate')} className="w-auto p-2">
        <DateCalendar
          locale={locale}
          selected={anchor}
          defaultMonth={anchor}
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
          modifiersClassNames={{ inView: 'bg-secondary text-secondary-foreground' }}
          onSelect={(date) => {
            onSelect(toIsoDate(date));
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
