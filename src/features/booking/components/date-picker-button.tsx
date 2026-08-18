'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DateChooser } from '@/components/ui/date-chooser';
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
 * The panel itself is the app's shared `DateChooser` — the same grid, the same
 * caption ring of days, months and years that a date field opens. It began here
 * and moved out when the client card's date of birth started using it too.
 * What stays local is what this picker *means*: the day it opens on, the span
 * currently on screen, and the clinic's own idea of today, none of which a
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
  const t = useTranslations('datePicker');
  const [open, setOpen] = useState(false);

  const anchor = isoToLocalDate(value) ?? undefined;
  const from = isoToLocalDate(range.from);
  const to = isoToLocalDate(range.to);
  const todayDate = isoToLocalDate(today ?? '') ?? undefined;

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
      <PopoverContent aria-label={t('pickDate')} className="w-[264px] pointer-coarse:w-[19.5rem] p-2">
        {/*
          Keyed on the anchor, so reopening the picker after the toolbar has
          moved starts the panel where the calendar now is — on the days, on
          this month — rather than wherever paging left it last time.
        */}
        <DateChooser
          key={value}
          locale={locale}
          selected={anchor}
          defaultMonth={anchor}
          // The clinic's clock, not the machine's — the same value the week
          // header tints its current column with, and undefined until it ticks.
          today={todayDate}
          /*
            Olive on the chosen day, white numeral — not the neutral black a
            field draws. See `selectedTone`: a date *field* is one control among
            many on a form and cannot spend the accent, but this panel exists to
            answer one question and the answer is the only thing in it worth a
            colour.
          */
          selectedTone="primary"
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
        />
      </PopoverContent>
    </Popover>
  );
}
