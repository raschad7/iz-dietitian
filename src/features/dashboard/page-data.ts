import { addDays, startOfWeek, toIsoDate } from '@/features/booking/date';
import { listAppointments } from '@/features/booking/queries';
import { type CalendarAppointment } from '@/features/booking/types';

import {
  countActiveClients,
  countActiveClientsWithoutWeeklyPlan,
  countAppointmentsInRange,
  countNewClientsSince,
  countPendingRequests,
  listClientsNeverSignedIn,
  listClientsWithNoUpcomingAppointment,
  listClientsWithoutWeeklyPlan,
  listPendingRequestsPreview,
  type AttentionItem,
  type PendingRequestPreview,
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

const PENDING_PREVIEW_LIMIT = 3;
const ATTENTION_LIMIT = 5;
const ATTENTION_CATEGORY_LIMIT = 5;

export type DashboardStats = {
  activeClients: number;
  appointmentsThisWeek: number;
  /** Active clients with no published plan for the week in progress. Recurs weekly, by design. */
  clientsWithoutWeeklyPlan: number;
  newClientsThisMonth: number;
};

export type DashboardData = {
  /** Clinic-local `YYYY-MM-DD`, the day the agenda and "this week" are anchored to. */
  today: string;
  agenda: CalendarAppointment[];
  pendingRequests: { items: PendingRequestPreview[]; total: number };
  stats: DashboardStats;
  /** Capped at {@link ATTENTION_LIMIT}; prioritises whichever category is listed first when trimming. */
  attention: AttentionItem[];
};

function monthStart(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

export async function loadDashboard(clinicId: string): Promise<DashboardData> {
  // Same "today" derivation as `loadCalendarPage` (`src/features/booking/page-data.ts`) —
  // the server clock's own local day, for consistency with the rest of the app.
  const today = toIsoDate(new Date());
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);

  const [
    agenda,
    pendingItems,
    pendingTotal,
    activeClients,
    appointmentsThisWeek,
    clientsWithoutWeeklyPlan,
    newClientsThisMonth,
    noUpcomingAppointment,
    noWeeklyPlan,
    neverSignedIn,
  ] = await Promise.all([
    listAppointments(clinicId, today, today),
    listPendingRequestsPreview(clinicId, PENDING_PREVIEW_LIMIT),
    countPendingRequests(clinicId),
    countActiveClients(clinicId),
    countAppointmentsInRange(clinicId, weekStart, weekEnd),
    countActiveClientsWithoutWeeklyPlan(clinicId),
    countNewClientsSince(clinicId, monthStart(today)),
    listClientsWithNoUpcomingAppointment(clinicId, today, ATTENTION_CATEGORY_LIMIT),
    listClientsWithoutWeeklyPlan(clinicId, ATTENTION_CATEGORY_LIMIT),
    listClientsNeverSignedIn(clinicId, ATTENTION_CATEGORY_LIMIT),
  ]);

  return {
    today,
    agenda,
    pendingRequests: { items: pendingItems, total: pendingTotal },
    stats: { activeClients, appointmentsThisWeek, clientsWithoutWeeklyPlan, newClientsThisMonth },
    attention: [...noUpcomingAppointment, ...noWeeklyPlan, ...neverSignedIn].slice(0, ATTENTION_LIMIT),
  };
}
