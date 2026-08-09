'use client';

import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui/icon';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

import { isSameMonth, monthGridDays } from '../date';
import { formatDayNumber, formatLongDate, formatMinuteRange, formatWeekday } from '../format';
import { type CalendarAppointment } from '../types';
import { isWorkingDay, type ClinicHours } from '../validation';

/**
 * The month grid — an overview, and **read only**.
 *
 * Nothing here creates, edits, moves or deletes: a month cell is a few pixels
 * tall per appointment, which is the wrong place to be dragging clinical
 * records around, and a mis-click has no undo. Clicking a day opens that day in
 * the day view, where there is room to work and every gesture is available.
 *
 * That is why this component takes no mutation callbacks at all. It cannot edit
 * because it has nothing to edit with.
 *
 * ## The cell is a div with a stretched button, not a button
 *
 * It used to be a `<button>` wrapped straight around the day number, a `<ul>`
 * of chips and a `<p>`. A button's content model is *phrasing* content, and a
 * list is not — so the browser was laying out flow content inside an
 * inline-block replaced-ish element whose UA styles centre their contents, and
 * the chips inherited the button's own alignment and baseline rules rather than
 * the ones written for them. The whole cell is still one target and still
 * keyboard-reachable; the button is now an overlay stretched across the cell
 * (`absolute inset-0`), which is the same device the client register uses to
 * make a table row a link.
 */

export type MonthViewProps = {
  anchorDate: string;
  locale: Locale;
  hours: ClinicHours;
  appointments: CalendarAppointment[];
  today: string | null;
  selectedId: string | null;
  highlightId: string | null;
  dimmedIds: ReadonlySet<string>;
  completedIds: ReadonlySet<string>;
  /** Opens that date in the day view — the only thing a click does here. */
  onOpenDay: (date: string) => void;
};

/**
 * A cell only has room for a handful of chips before the row itself starts
 * pushing into the next week. Past this, the count left off is worth more than
 * a fourth sliver of a chip — it says there is more without spending the space
 * to half-show it.
 */
const MAX_VISIBLE = 3;

export function MonthView({
  anchorDate,
  locale,
  hours,
  appointments,
  today,
  selectedId,
  highlightId,
  dimmedIds,
  completedIds,
  onOpenDay,
}: MonthViewProps) {
  const t = useTranslations('booking');

  const days = monthGridDays(anchorDate);
  const weekdayStrip = days.slice(0, 7);

  const byDate = new Map<string, CalendarAppointment[]>();
  for (const appointment of appointments) {
    const list = byDate.get(appointment.date);
    if (list) list.push(appointment);
    else byDate.set(appointment.date, [appointment]);
  }

  return (
    // Full-bleed, like the day and week grids: one rule between it and the
    // toolbar, and no box of its own. See the note on the calendar's root.
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
      {/*
        `bg-muted` flat, not `bg-muted/50`. The sunken fill is already the
        quietest surface the palette has; halving it left a strip that was
        neither a fill nor an absence, and the grid had three different muted
        opacities in it (30, 50, 60) doing three jobs nobody could tell apart.
      */}
      <div className="grid grid-cols-7 border-b border-border bg-muted">
        {weekdayStrip.map((date) => (
          <div
            key={date}
            className="px-2 py-2 text-center text-caption font-medium text-muted-foreground"
          >
            {formatWeekday(locale, date)}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-y-auto">
        {days.map((date) => {
          const inMonth = isSameMonth(date, anchorDate);
          const closed = !isWorkingDay(date, hours);
          const dayAppointments = byDate.get(date) ?? [];
          const visibleAppointments = dayAppointments.slice(0, MAX_VISIBLE);
          const hiddenCount = dayAppointments.length - visibleAppointments.length;
          // A day already gone reads the same muted way a day outside this
          // month does — neither can be booked from here, so neither earns
          // full-strength text.
          const isPast = today !== null && date < today;
          const isToday = date === today;

          return (
            <div
              key={date}
              data-day={date}
              className={cn(
                /*
                  `min-h-36` — 144px. The cell has to hold the day number, three
                  chips and the "+N more" line, and it clips what does not fit.
                  Six rows of it is taller than most panels, so the month
                  scrolls — the right trade for chips that can be read at a
                  glance rather than squinted at.

                  The vertical rule is dropped on the first column of each row:
                  `border-s` on all seven drew a line down the grid's own
                  leading edge, which in Arabic is the edge the rail is already
                  on, so the month began with a doubled boundary.
                */
                'group/day relative min-h-36 overflow-hidden border-b border-s border-border p-1.5',
                '[&:nth-child(7n+1)]:border-s-0',
                /*
                  Hover is the ambient tint, a step down from the sunken fill a
                  closed day wears — at `bg-muted/60` the pointer response was
                  lighter than the closed days it had to be visible on top of.
                */
                'transition-colors focus-within:bg-accent/70 hover:bg-accent/70',
                /*
                  Two states, two treatments, and they stack rather than
                  compete: outside this month is quiet *text*, a closed day is a
                  sunken *fill*. They used to be two fills at 30% and 50%, so a
                  closed day outside the month got both and which one showed
                  depended on the order Tailwind happened to emit them in.
                */
                (!inMonth || isPast) && 'text-muted-foreground',
                closed && 'bg-muted',
              )}
            >
              {/*
                The target. Stretched over the cell rather than wrapped around
                it, so the cell's contents lay out as ordinary flow content —
                see the note at the top of this file. `sr-only` text rather than
                `aria-label` alone keeps it a button with a name in every
                assistive tree.
              */}
              <button
                type="button"
                onClick={() => onOpenDay(date)}
                className="absolute inset-0 z-10 cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="sr-only">{formatLongDate(locale, date)}</span>
              </button>

              {/*
                Today is a filled pip on the number, not a ring around the cell.
                The ring was drawn `inset` inside a cell that already carries
                two borders, so on the row and column it touched there were
                three lines within two pixels of each other; the pip is the mark
                the rest of the calendar already uses for today.
              */}
              <span
                className={cn(
                  'flex size-7 items-center justify-center text-body-md font-semibold tabular-nums',
                  isToday && 'rounded-full bg-primary text-primary-foreground',
                )}
              >
                {formatDayNumber(locale, date)}
              </span>

              {/*
                Plain list items, not buttons. A month chip is read, never acted
                on — the day view is where an appointment can be changed.
              */}
              <ul className="mt-1.5 space-y-1">
                {visibleAppointments.map((appointment) => {
                  const completed = completedIds.has(appointment.id);
                  const marked = selectedId === appointment.id || highlightId === appointment.id;

                  return (
                    <li key={appointment.id}>
                      <span
                        /*
                          The same surface the day and week cards wear: a brand
                          tint inside a brand hairline, and no client colour. A
                          month grid is 30 of these at once, and a tint per
                          person turned the overview into a swatch book. The
                          register is where a client is identified by colour;
                          this is where the *shape of the month* is.

                          Semantic tokens, not `bg-(--olive-50)`. The primitives
                          are the ramp the theme is built from and a component
                          reaching past the semantic layer is how a palette
                          stops being changeable in one place — `secondary` is
                          the brand tint and `primary-subtle` is the one a step
                          up, which is exactly the pair this needs.
                        */
                        className={cn(
                          'flex w-full items-center gap-1.5 rounded-sm border px-2 py-1 text-start text-label',
                          marked
                            ? 'border-primary bg-primary-subtle text-secondary-foreground'
                            : 'border-primary/35 bg-secondary text-secondary-foreground',
                        )}
                        style={{
                          /*
                            `saturate(.3)`, not `grayscale`. A completed chip is
                            meant to read as a quieter olive, and `grayscale` is
                            `saturate(0)` — it took *all* the colour out, so on a
                            month where every appointment has already happened
                            the whole grid went grey and the view stopped looking
                            like part of this app.
                          */
                          filter: completed ? 'saturate(0.3)' : undefined,
                          opacity: completed ? 0.6 : dimmedIds.has(appointment.id) ? 0.25 : 1,
                        }}
                      >
                        {/* The system's own glyph, not a `✓` character: the
                            literal renders in whatever fallback font has it,
                            which is not the one every other mark here uses. */}
                        {completed ? (
                          <Icon
                            name="check"
                            aria-label={t('completed')}
                            className="size-3 shrink-0"
                          />
                        ) : null}

                        <span className="min-w-0 truncate" dir="auto">
                          {appointment.clientName}
                        </span>

                        {/*
                          The times hold their space and the name gives way: the
                          range is the shorter, more predictable string, and a
                          chip that says only "Ahmad" answers half the question
                          a calendar is for.
                        */}
                        <span
                          className="ms-auto shrink-0 whitespace-nowrap tabular-nums opacity-80"
                          dir="auto"
                        >
                          {formatMinuteRange(
                            locale,
                            appointment.date,
                            appointment.startMinute,
                            appointment.startMinute + appointment.durationMinutes,
                          )}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* What the three chips above left off — a count, not a fourth sliver of a chip. */}
              {hiddenCount > 0 ? (
                <p className="mt-1 px-2 text-label text-muted-foreground">
                  {t('monthMore', { count: hiddenCount })}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
