import { toIsoDate } from '@/features/booking/date';
import { getClinicHours } from '@/features/booking/queries';

import {
  listAnsweredAppointmentRequests,
  listPendingAppointmentRequests,
  listPendingClientRequests,
} from './queries';
import { type PendingRequests, type RequestsData } from './types';

/**
 * The server-side work behind `/app/requests` and the dashboard's inbox panel.
 *
 * Route files resolve params, guard the session and render; the reads are
 * composed here, following the project's architecture rule (see
 * `src/features/README.md` and the precedent in
 * `src/features/dashboard/page-data.ts`). Every read runs in one `Promise.all`,
 * so a page issues a single round of parallel queries rather than a waterfall.
 */

/**
 * How much answered history the inbox keeps on screen.
 *
 * Enough to confirm what was done this week without the page becoming a log.
 * Anything older is on the client's own record and on the calendar, which are
 * the places you would actually go looking.
 */
const ANSWERED_LIMIT = 10;

/**
 * The same window, for the dashboard.
 *
 * The dashboard used to read no answered history at all — the panel there shows
 * pending work and linked out for the rest. It links *into a dialog* now, and
 * that dialog is the inbox itself, so the page has to arrive holding what the
 * inbox renders. One indexed read joins a round of parallel queries the page was
 * already issuing; see `RequestsDialogTrigger` for why the alternative — fetching
 * on open — was not taken.
 */
export const DASHBOARD_ANSWERED_LIMIT = ANSWERED_LIMIT;

/**
 * What is waiting on the dietitian.
 *
 * Its own function rather than a slice of {@link loadRequests}, because the
 * dashboard shows pending work and links out for the rest — loading answered
 * history there would be a query whose result is thrown away on every render of
 * the busiest page in the app.
 */
export async function loadPendingRequests(clinicId: string): Promise<PendingRequests> {
  // Same "today" derivation as `loadDashboard` and `loadCalendarPage` — the
  // server clock's own local day, for consistency across the staff area.
  const today = toIsoDate(new Date());

  const [appointments, clientRequests, hours] = await Promise.all([
    listPendingAppointmentRequests(clinicId),
    listPendingClientRequests(clinicId),
    getClinicHours(clinicId),
  ]);

  return { appointments, clientRequests, today, hours };
}

/** The inbox page: what is waiting, plus what was recently answered. */
export async function loadRequests(clinicId: string): Promise<RequestsData> {
  const [pending, answered] = await Promise.all([
    loadPendingRequests(clinicId),
    listAnsweredAppointmentRequests(clinicId, ANSWERED_LIMIT),
  ]);

  return { ...pending, answered };
}
