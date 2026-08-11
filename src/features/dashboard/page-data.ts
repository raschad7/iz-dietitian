import { addDays, addMonths, isoToLocalDate, startOfMonth, startOfWeek, toIsoDate } from '@/features/booking/date';
import { getClinicHours, listAppointments } from '@/features/booking/queries';
import { type CalendarAppointment } from '@/features/booking/types';
import { DASHBOARD_ATTENTION_LIMIT, loadStaffAttention } from '@/features/notifications/page-data';
import { type StaffAttentionNotification } from '@/features/notifications/types';
import { listPendingAppointmentRequests, listPendingClientRequests } from '@/features/requests/queries';
import { type PendingRequests } from '@/features/requests/types';

import {
  countActiveClients,
  countAppointmentsByDay,
  countClientsByMonth,
  countClientsWithoutNextVisit,
} from './queries';
import { monthlySeries, weeklySeries, type MonthlyClients, type WeeklyAppointments } from './trends';

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


/**
 * What the day switcher falls back to when the clinic has no usable schedule.
 *
 * `getClinicHours` returns null unless all seven weekdays are on file, which is
 * a half-written clinic rather than one that opens every day — but a switcher
 * with nothing in it would be a worse answer than one with too much, so the week
 * is shown whole and the calendar is left to say which days are really open.
 */
const EVERY_WEEKDAY = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * How far back the two stat cards look.
 *
 * Six months and eight weeks, because both windows have to fit legibly across
 * half the working column on a laptop: six area points keep a readable month
 * label under each, and eight bars stay wide enough to aim a pointer at. They
 * are also honest windows for a dietetics practice — a season of intake, and a
 * clear two months of diary.
 */
const TREND_MONTHS = 6;
const TREND_WEEKS = 8;

export type DashboardData = {
  /** Clinic-local `YYYY-MM-DD`, the day the appointments panel opens on. */
  today: string;
  /** Minutes from local midnight at render time — what marks an appointment as past, live or next. */
  nowMinute: number;
  /**
   * Every appointment in the current Sunday-to-Saturday week, unsorted.
   *
   * The whole week rather than today alone, because the panel that draws it
   * switches days in the browser. One query for seven days costs what one query
   * for one day cost, and it buys a day switcher that never touches the network
   * — see `AppointmentsPanel`.
   */
  weekAppointments: CalendarAppointment[];
  /** That week's Sunday, and the Saturday six days after it. */
  weekStart: string;
  weekEnd: string;
  /**
   * Clinic-local weekdays the clinic opens on, `0` = Sunday, ascending. The
   * appointments panel's day switcher shows these and nothing else.
   */
  workingDays: readonly number[];
  /**
   * What the two stat cards at the top of the working column draw.
   *
   * Both series are complete — every month and every week in the window has a
   * point, including the empty ones, which is the whole reason the shaping in
   * `./trends.ts` exists.
   */
  stats: {
    /** Active clients on the register right now. */
    activeClients: number;
    /** New clients per month, oldest first, {@link TREND_MONTHS} long. */
    clientsByMonth: MonthlyClients[];
    /** Appointments in the current week — the last point of `appointmentsByWeek`. */
    appointmentsThisWeek: number;
    /** Appointments per week, oldest first, {@link TREND_WEEKS} long. */
    appointmentsByWeek: WeeklyAppointments[];
    /** Active clients with nothing booked from today on — the card's one call to action. */
    clientsWithoutNextVisit: number;
  };
  /**
   * What clients are waiting on an answer for. Both lists are usually empty,
   * and the panel that renders them draws nothing when they are — see
   * `PendingRequestsCard` for why that matters on this page in particular.
   */
  requests: PendingRequests;
  /**
   * Clients the register says have drifted — the notifications feed's own
   * "worth checking" half, surfaced on the page a dietitian actually keeps
   * open. Requests are not included: they have their own card on this screen,
   * with the buttons that answer them.
   */
  attention: StaffAttentionNotification[];
  /** How many there are in total, so the card's count does not lie about its own cap. */
  attentionTotal: number;
  /** Read once here so every "3 hours ago" on the page measures from one instant. */
  now: Date;
};

export async function loadDashboard(clinicId: string): Promise<DashboardData> {
  // Same "today" derivation as `loadCalendarPage` (`src/features/booking/page-data.ts`) —
  // the server clock's own local day, for consistency with the rest of the app.
  const now = new Date();
  const today = toIsoDate(now);
  const nowMinute = now.getHours() * 60 + now.getMinutes();

  // The windows the two stat cards read over. Both are derived here so the
  // query and the series that fills its gaps are cut from the same "today".
  const firstMonth = addMonths(startOfMonth(today), -(TREND_MONTHS - 1));
  const firstWeek = addDays(startOfWeek(today), -7 * (TREND_WEEKS - 1));
  // The current week, which both the appointments panel and the diary card's
  // last bar are about. Derived once so the two cannot disagree about where the
  // week starts.
  const weekStart = startOfWeek(today);
  const lastWeekDay = addDays(weekStart, 6);
  // `firstMonth` is derived from a valid date and so always parses; the
  // fallback is there because the helper is honest about returning null and
  // `now` is the one instant on this page that is certainly real.
  const clientsSince = isoToLocalDate(firstMonth) ?? now;

  const [
    weekAppointments,
    hours,
    pendingRequests,
    pendingClientRequests,
    attention,
    activeClients,
    clientMonths,
    appointmentDays,
    clientsWithoutNextVisit,
  ] = await Promise.all([
    listAppointments(clinicId, weekStart, lastWeekDay),
    getClinicHours(clinicId),
    listPendingAppointmentRequests(clinicId),
    listPendingClientRequests(clinicId),
    loadStaffAttention(clinicId),
    countActiveClients(clinicId),
    // `created_at` is a timestamp, so the window opens at local midnight on the
    // first of the earliest month rather than at that date as a bare string.
    countClientsByMonth(clinicId, clientsSince),
    // Through the end of the current week, not through today: the current bar
    // should count everything already booked into this week, including the
    // appointments still ahead of it.
    countAppointmentsByDay(clinicId, firstWeek, lastWeekDay),
    countClientsWithoutNextVisit(clinicId, today),
  ]);

  const appointmentsByWeek = weeklySeries(today, TREND_WEEKS, appointmentDays);

  return {
    today,
    nowMinute,
    weekAppointments,
    weekStart,
    weekEnd: lastWeekDay,
    workingDays: hours?.workingDays ?? EVERY_WEEKDAY,
    stats: {
      activeClients,
      clientsByMonth: monthlySeries(today, TREND_MONTHS, clientMonths),
      // Read off the series rather than counted again, so the headline figure
      // and the bar it sits above can never disagree.
      appointmentsThisWeek: appointmentsByWeek[appointmentsByWeek.length - 1]?.appointments ?? 0,
      appointmentsByWeek,
      clientsWithoutNextVisit,
    },
    /*
     * The card shows a handful and says how many there are; the whole list is
     * one link away on `/app/notifications`. Sliced here rather than by asking
     * the query for fewer, because the count has to be the real one — a card
     * that says "4" because it fetched 4 is a card that cannot tell a quiet
     * register from a busy one.
     */
    attention: attention.slice(0, DASHBOARD_ATTENTION_LIMIT),
    attentionTotal: attention.length,
    // The two request reads join this page's single round of parallel queries
    // rather than calling `loadPendingRequests`, which would repeat the
    // `getClinicHours` read the week strip above already needs.
    requests: { appointments: pendingRequests, clientRequests: pendingClientRequests, today, hours },
    now,
  };
}
