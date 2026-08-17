import { getTranslations } from 'next-intl/server';

import { CardTitle } from '@/components/ui/card';
import { addDays, weekdayOf } from '@/features/booking/date';
import {
  formatDayNumber,
  formatMinute,
  formatMinuteLatin,
  formatMinuteRangeLatin,
  formatWeekday,
} from '@/features/booking/format';

import { type CalendarAppointment } from '@/features/booking/types';
import {
  DayAppointments,
  type AppointmentDay,
  type AppointmentRow,
} from '@/features/dashboard/components/day-appointments';
import { type Locale } from '@/i18n/routing';

/**
 * The dashboard's appointments panel — the widest thing on the page, and the
 * only one you act through.
 *
 * It replaced two panels at once: the vertical timeline of today, and the
 * register card below it. The register went because it was a thinner copy of
 * `/app/clients`, which the rail already links to — the same reason the
 * quick-action tiles went before it, and the widest row on the dashboard was
 * spending itself on a list you can reach in one click. The timeline went
 * because this panel covers today and does it better: the same appointments,
 * plus the four days around them, in a table you can read across instead of a
 * column you read down.
 *
 * **This half is a server component and does every piece of formatting.** The
 * times, the weekday names, the day numbers, the counts, the column heads and
 * the status words are all resolved here — as plain strings where they are
 * strings, and as a rendered node for the heading. `DayAppointments` draws the
 * card around them and owns the day stepping and the scroll, and ships no
 * locale data and no message catalogue of its own. Same boundary
 * `stat-charts.tsx` draws around the two plots, for the same reason.
 *
 * ## What the header used to carry, and why it does not
 *
 * **A "next up" chip beside the title**, naming the clinic's real next
 * appointment whatever day was on screen. It was a second answer to a question
 * the table already answers with the caret on the row, and it stated a time
 * that a page left open all morning would slowly stop meaning — the header is
 * quieter without it, and the count now carries the one number worth reading at
 * that size.
 *
 * **A link to the calendar.** Every row in the table already links to its day,
 * and the count in the header links there too, so the panel had three ways out
 * to the same feature and the loudest of them was the least specific.
 */

type AppointmentsPanelProps = {
  /** Every appointment in the current week, in any order. */
  appointments: CalendarAppointment[];
  /** That week's Sunday. */
  weekStart: string;
  /** Clinic-local weekdays the clinic opens on, `0` = Sunday. */
  workingDays: readonly number[];
  today: string;
  nowMinute: number;
  locale: Locale;
};

/**
 * Where an appointment sits relative to the clock.
 *
 * A day in the past is entirely `done` regardless of its times, and a day in
 * the future entirely `upcoming` — `nowMinute` is a time of day and says
 * nothing about any day but today.
 */
function statusOf(
  appointment: CalendarAppointment,
  today: string,
  nowMinute: number,
): AppointmentRow['status'] {
  if (appointment.date < today) return 'done';
  if (appointment.date > today) return 'upcoming';
  if (appointment.startMinute + appointment.durationMinutes <= nowMinute) return 'done';
  if (appointment.startMinute <= nowMinute) return 'live';
  return 'upcoming';
}

export async function AppointmentsPanel({
  appointments,
  weekStart,
  workingDays,
  today,
  nowMinute,
  locale,
}: AppointmentsPanelProps) {
  const t = await getTranslations('dashboard.appointments');

  /*
   * The stepper walks the clinic's week, not the calendar's. A day the clinic
   * is closed cannot hold an appointment, so stepping onto one is a stop at an
   * empty table for no reason — and days a clinic works are stable enough that
   * their absence never needs explaining. Filtered rather than skipped over,
   * exactly as the agenda's week strip did before it.
   */
  const days: AppointmentDay[] = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
    .filter((date) => {
      const weekday = weekdayOf(date);
      return weekday !== null && workingDays.includes(weekday);
    })
    .map((date) => ({
      date,
      weekday: formatWeekday(locale, date),
      dayNumber: formatDayNumber(locale, date),
      countLabel: t('count', { count: appointments.filter((a) => a.date === date).length }),
      isToday: date === today,
      rows: appointments
        .filter((appointment) => appointment.date === date)
        .sort((a, b) => a.startMinute - b.startMinute)
        .map((appointment): AppointmentRow => ({
          id: appointment.id,
          time: formatMinuteRangeLatin(
            appointment.date,
            appointment.startMinute,
            appointment.startMinute + appointment.durationMinutes,
          ),
          // The phone's column has room for the start and nothing else — see
          // the time cell in `DayAppointments`.
          timeShort: formatMinuteLatin(appointment.date, appointment.startMinute),
          clientName: appointment.clientName,
          clientId: appointment.clientId,
          clientSeq: appointment.clientSeq,
          reason: appointment.reason,
          status: statusOf(appointment, today, nowMinute),
          // Filled in below, once the day's rows are ordered.
          isNext: false,
        })),
    }))
    .map((day) => {
      const first = day.rows.findIndex((row) => row.status === 'upcoming');
      return first === -1
        ? day
        : { ...day, rows: day.rows.map((row, index) => (index === first ? { ...row, isNext: true } : row)) };
    });

  const initialDate = days.some((day) => day.date === today) ? today : (days[0]?.date ?? today);

  return (
    <DayAppointments
      days={days}
      initialDate={initialDate}
      /*
       * The heading, rendered here and handed down as a node: it carries
       * translated text, which is exactly what has no business crossing into a
       * client component — see the note at the top of `DayAppointments` for why
       * that component owns the `Card` anyway.
       */
      title={
        <CardTitle as="h2" size="sm" tone="muted" icon="calendar">
          {t('title')}
        </CardTitle>
      }
      labels={{
        previousDay: t('previousDay'),
        nextDay: t('nextDay'),
        today: t('today'),
        time: t('time'),
        client: t('client'),
        reason: t('reason'),
        status: t('status'),
        done: t('done'),
        live: t('live'),
        next: t('next'),
        now: formatMinute(locale, today, nowMinute),
        empty: t('empty'),
        emptyCta: t('emptyCta'),
      }}
    />
  );
}
