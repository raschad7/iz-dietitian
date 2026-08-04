'use client';

import { useTranslations } from 'next-intl';

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

  /**
   * A cell only has room for a handful of chips before the row itself starts
   * pushing into the next week. Past this, the count left off is worth more
   * than a fourth sliver of a chip — it says there is more without spending
   * the space to half-show it.
   */
  const MAX_VISIBLE = 3;

  return (
    // Full-bleed, like the day and week grids: one rule between it and the
    // toolbar, and no box of its own. See the note on the calendar's root.
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border">
      <div className="grid grid-cols-7 border-b border-border bg-muted/50">
        {weekdayStrip.map((date) => (
          <div key={date} className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
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

          return (
            /*
              The whole cell is a button: its one job is to open that day. Making
              it a real button rather than a div with a click handler is what
              makes the month view keyboard-reachable — tab to a day, press
              Enter, and the day view opens.
            */
            <button
              key={date}
              type="button"
              data-day={date}
              aria-label={formatLongDate(locale, date)}
              className={cn(
                /*
                  `min-h-36` — 144px, up from 96. The cell has to hold the day
                  number, three chips at their new height and the "+N more"
                  line, and it clips what does not fit; sizing it to the old
                  chips would have cut the third one in half the moment they
                  grew. Six rows of it is taller than most panels, so the month
                  scrolls — which is the right trade for chips that can be read
                  at a glance rather than squinted at.
                */
                'min-h-36 overflow-hidden border-b border-s border-border p-1.5 text-start transition-colors',
                'hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                (!inMonth || isPast) && 'text-muted-foreground',
                !inMonth && 'bg-muted/30',
                closed && 'bg-muted/50',
                date === today && 'ring-1 ring-inset ring-primary/40',
              )}
              onClick={() => onOpenDay(date)}
            >
              <span className={cn('text-base font-semibold', date === today && 'text-primary')}>
                {formatDayNumber(locale, date)}
              </span>

              {/*
                Plain list items, not buttons. A month chip is read, never
                acted on — the day view is where an appointment can be changed.
              */}
              <ul className="mt-1.5 space-y-1">
                {visibleAppointments.map((appointment) => {
                  const completed = completedIds.has(appointment.id);
                  const marked = selectedId === appointment.id || highlightId === appointment.id;

                  return (
                    <li key={appointment.id}>
                      <span
                        /*
                          The same surface the day and week cards wear: an
                          olive-50 fill inside an olive-200 edge, and no client
                          colour. A month grid is 30 of these at once, and a
                          tint per person turned the overview into a swatch
                          book — the one place a colour-per-client is least
                          readable is the view with the most of them on screen.
                          The register is where a client is identified by
                          colour; this is where the *shape of the month* is.

                          `px-2 py-1` and the taller row above it: at
                          `px-1 py-0.5` the chip was a coloured line with text
                          on it rather than a card, and the name sat hard
                          against its own edge.
                        */
                        className={cn(
                          'flex w-full items-center gap-1.5 truncate rounded-sm border px-2 py-1 text-start text-label',
                          marked
                            ? 'border-(--olive-500) bg-(--olive-100)'
                            : 'border-(--olive-200) bg-(--olive-50)',
                        )}
                        style={{
                          filter: completed ? 'saturate(0.3)' : undefined,
                          opacity: completed ? 0.6 : dimmedIds.has(appointment.id) ? 0.25 : 1,
                        }}
                      >
                        {/* A tick rather than a badge: a month chip has no room. */}
                        {completed && <span aria-label={t('completed')}>✓</span>}
                        <span className="min-w-0 truncate" dir="auto">
                          {appointment.clientName}
                        </span>
                        {/*
                          The times hold their space and the name gives way:
                          the range is the shorter, more predictable string, and
                          a chip that says only "Ahmad" answers half the question
                          a calendar is for.
                        */}
                        <span className="ms-auto shrink-0 whitespace-nowrap tabular-nums opacity-80" dir="auto">
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
              {hiddenCount > 0 && (
                <p className="mt-1 px-2 text-label text-muted-foreground">{t('monthMore', { count: hiddenCount })}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
