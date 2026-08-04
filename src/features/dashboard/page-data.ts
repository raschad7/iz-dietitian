import { toIsoDate } from '@/features/booking/date';
import { getClinicHours, listAppointments } from '@/features/booking/queries';
import { type CalendarAppointment } from '@/features/booking/types';

import { summariseDemographics, type Demographics } from './demographics';
import { listClientDemographics, listRecentClients, type DashboardClient } from './queries';

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
 * How many clients the register card shows.
 *
 * Enough to fill the card's height beside the two demographic charts without
 * the list becoming a second, worse version of the clients page — that is one
 * click away, and the card's footer points at it.
 */
const RECENT_CLIENTS = 8;

/**
 * What the week strip falls back to when the clinic has no usable schedule.
 *
 * `getClinicHours` returns null unless all seven weekdays are on file, which is
 * a half-written clinic rather than one that opens every day — but a strip with
 * nothing in it would be a worse answer than a strip with too much, so the week
 * is shown whole and the calendar is left to say which days are really open.
 */
const EVERY_WEEKDAY = [0, 1, 2, 3, 4, 5, 6] as const;

export type DashboardData = {
  /** Clinic-local `YYYY-MM-DD`, the day the agenda is anchored to. */
  today: string;
  /** Minutes from local midnight at render time — what marks an appointment as past, live or next. */
  nowMinute: number;
  agenda: CalendarAppointment[];
  /**
   * Clinic-local weekdays the clinic opens on, `0` = Sunday, ascending. The
   * agenda's week strip shows these and nothing else.
   */
  workingDays: readonly number[];
  /** Newest first, active only, at most {@link RECENT_CLIENTS}. */
  recentClients: DashboardClient[];
  demographics: Demographics;
};

export async function loadDashboard(clinicId: string): Promise<DashboardData> {
  // Same "today" derivation as `loadCalendarPage` (`src/features/booking/page-data.ts`) —
  // the server clock's own local day, for consistency with the rest of the app.
  const now = new Date();
  const today = toIsoDate(now);
  const nowMinute = now.getHours() * 60 + now.getMinutes();

  const [agenda, recentClients, demographicRows, hours] = await Promise.all([
    listAppointments(clinicId, today, today),
    listRecentClients(clinicId, today, RECENT_CLIENTS),
    listClientDemographics(clinicId),
    getClinicHours(clinicId),
  ]);

  return {
    today,
    nowMinute,
    agenda,
    workingDays: hours?.workingDays ?? EVERY_WEEKDAY,
    recentClients,
    demographics: summariseDemographics(demographicRows, now),
  };
}
