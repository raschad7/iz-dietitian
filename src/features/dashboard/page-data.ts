import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek, toIsoDate } from '@/features/booking/date';
import { listAppointments } from '@/features/booking/queries';
import { type CalendarAppointment } from '@/features/booking/types';

import { summariseDemographics, type Demographics } from './demographics';
import {
  countAppointmentsAfter,
  countAppointmentsInRange,
  countNewClientsSince,
  findNextAppointmentAfter,
  listClientDemographics,
  listMonthlyVisits,
  type MonthlyVisits,
  type NextAppointment,
} from './queries';

/**
 * The server-side work behind `/app` — the dietitian's morning page.
 *
 * Route files resolve params, guard the session and render; the reads are
 * composed here, following the project's architecture rule (see
 * `src/features/README.md` and the precedent in
 * `src/features/portal/page-data.ts`). Every read below runs in one
 * `Promise.all`, so the page issues a single round of parallel queries
 * rather than a waterfall.
 */

const HISTORY_MONTHS = 6;

export type DashboardSummary = {
  todayAppointments: number;
  /** Everything booked after today — see {@link countAppointmentsAfter}. */
  upcomingAppointments: number;
  newClientsThisMonth: number;
  appointmentsThisWeek: number;
};

export type DashboardData = {
  /** Clinic-local `YYYY-MM-DD`, the day the agenda and "this week" are anchored to. */
  today: string;
  /** Minutes from local midnight at render time — what marks an appointment as past, live or next. */
  nowMinute: number;
  week: { start: string; end: string };
  month: { start: string; end: string };
  agenda: CalendarAppointment[];
  summary: DashboardSummary;
  nextAppointment: NextAppointment | null;
  /** Exactly {@link HISTORY_MONTHS} entries, oldest first, empty months included. */
  visitHistory: MonthlyVisits[];
  demographics: Demographics;
};

/**
 * The last `HISTORY_MONTHS` months ending with the current one, with the
 * query's sparse rows dropped into place.
 *
 * The calendar is built here rather than in SQL because a month with no
 * appointments has no row to return, and a histogram that silently skips
 * February would misstate the trend as much as a wrong number would.
 */
function toMonthlySeries(rows: MonthlyVisits[], today: string, months: number): MonthlyVisits[] {
  const counts = new Map(rows.map((row) => [row.month, row.visits]));

  return Array.from({ length: months }, (_, index) => {
    const month = startOfMonth(addMonths(today, index - (months - 1)));
    return { month, visits: counts.get(month) ?? 0 };
  });
}

export async function loadDashboard(clinicId: string): Promise<DashboardData> {
  // Same "today" derivation as `loadCalendarPage` (`src/features/booking/page-data.ts`) —
  // the server clock's own local day, for consistency with the rest of the app.
  const now = new Date();
  const today = toIsoDate(now);
  const nowMinute = now.getHours() * 60 + now.getMinutes();

  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const historyStart = startOfMonth(addMonths(today, -(HISTORY_MONTHS - 1)));

  const [
    agenda,
    appointmentsThisWeek,
    upcomingAppointments,
    nextAppointment,
    newClientsThisMonth,
    visitRows,
    demographicRows,
  ] = await Promise.all([
    listAppointments(clinicId, today, today),
    countAppointmentsInRange(clinicId, weekStart, weekEnd),
    countAppointmentsAfter(clinicId, today),
    findNextAppointmentAfter(clinicId, today),
    countNewClientsSince(clinicId, monthStart),
    listMonthlyVisits(clinicId, historyStart, monthEnd),
    listClientDemographics(clinicId),
  ]);

  return {
    today,
    nowMinute,
    week: { start: weekStart, end: weekEnd },
    month: { start: monthStart, end: monthEnd },
    agenda,
    summary: {
      todayAppointments: agenda.length,
      upcomingAppointments,
      newClientsThisMonth,
      appointmentsThisWeek,
    },
    nextAppointment,
    visitHistory: toMonthlySeries(visitRows, today, HISTORY_MONTHS),
    demographics: summariseDemographics(demographicRows, now),
  };
}
