import { toIsoDate } from '@/features/booking/date';
import { listAppointments } from '@/features/booking/queries';
import { type CalendarAppointment } from '@/features/booking/types';

import { summariseDemographics, type Demographics } from './demographics';
import {
  countActiveClients,
  listClientDemographics,
  listRecentClients,
  type DashboardClient,
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

/**
 * How many clients the register card shows.
 *
 * Enough to fill the card's height beside the two demographic charts without
 * the list becoming a second, worse version of the clients page — that is one
 * click away, and the card's footer points at it.
 */
const RECENT_CLIENTS = 8;

export type DashboardData = {
  /** Clinic-local `YYYY-MM-DD`, the day the agenda is anchored to. */
  today: string;
  /** Minutes from local midnight at render time — what marks an appointment as past, live or next. */
  nowMinute: number;
  agenda: CalendarAppointment[];
  /** Newest first, active only, at most {@link RECENT_CLIENTS}. */
  recentClients: DashboardClient[];
  /** Everyone active on the register, not just the ones listed above. */
  activeClients: number;
  demographics: Demographics;
};

export async function loadDashboard(clinicId: string): Promise<DashboardData> {
  // Same "today" derivation as `loadCalendarPage` (`src/features/booking/page-data.ts`) —
  // the server clock's own local day, for consistency with the rest of the app.
  const now = new Date();
  const today = toIsoDate(now);
  const nowMinute = now.getHours() * 60 + now.getMinutes();

  const [agenda, recentClients, activeClients, demographicRows] = await Promise.all([
    listAppointments(clinicId, today, today),
    listRecentClients(clinicId, today, RECENT_CLIENTS),
    countActiveClients(clinicId),
    listClientDemographics(clinicId),
  ]);

  return {
    today,
    nowMinute,
    agenda,
    recentClients,
    activeClients,
    demographics: summariseDemographics(demographicRows, now),
  };
}
