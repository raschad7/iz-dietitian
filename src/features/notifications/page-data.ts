import { toIsoDate } from '@/features/booking/date';

import {
  listClientsNeverSignedIn,
  listClientsWithNoUpcomingAppointment,
  listClientsWithoutWeeklyPlan,
  listPendingRequestsPreview,
  countPendingRequests,
} from './queries';
import {
  type NotificationsData,
  type StaffAttentionNotification,
  type StaffRequestNotification,
} from './types';

/**
 * Everything waiting on the dietitian.
 *
 * Appointment requests and clients drifting out of care were two cards side by
 * side once, which meant two places to check and neither ordered by urgency.
 * They are now one screen — but two lists on it, because they are answered in
 * different places and only one of them has someone waiting.
 *
 * ## The limits are page limits now
 *
 * They used to be popover limits: four requests, three clients per attention
 * category, and the whole feed then truncated to six rows. Six was the number
 * that fitted under a bell without a scrollbar, and it silently hid the rest —
 * a dietitian with seven pending requests saw four of them and no indication
 * that three more existed.
 *
 * This is a page, and a page can be long. What remains is a ceiling on the
 * *query*, not on the reading: the attention lists are derived scans over the
 * register and there is no value in returning three hundred rows of "no plan
 * this week". `pendingRequestCount` is still counted separately and unbounded,
 * so the requests card can say how many are actually waiting when the list it
 * shows is capped.
 */

const REQUEST_LIMIT = 20;
const ATTENTION_CATEGORY_LIMIT = 8;

/**
 * How many attention rows the dashboard's card shows.
 *
 * Smaller than the page's, because the dashboard is one screen that must not
 * scroll: the card says how many there are in total and links out for the rest.
 */
const DASHBOARD_ATTENTION_LIMIT = 4;

/**
 * Clients the register says have drifted — no upcoming visit, no plan this
 * week, never signed in.
 *
 * Split out from {@link loadNotifications} because the dashboard shows this
 * half and not the other: requests already have their own card there, with the
 * buttons that answer them, so a dashboard notification list carrying requests
 * too would be the same queue twice on one screen.
 */
export async function loadStaffAttention(
  clinicId: string,
  perCategory: number = ATTENTION_CATEGORY_LIMIT,
): Promise<StaffAttentionNotification[]> {
  const today = toIsoDate(new Date());

  const [noUpcomingAppointment, noWeeklyPlan, neverSignedIn] = await Promise.all([
    listClientsWithNoUpcomingAppointment(clinicId, today, perCategory),
    listClientsWithoutWeeklyPlan(clinicId, perCategory),
    listClientsNeverSignedIn(clinicId, perCategory),
  ]);

  /*
   * One client can qualify for several attention categories at once (no plan
   * *and* never signed in), and the same person appearing twice in one list
   * reads as a bug. First reason wins, in the order listed — the order the
   * reasons were judged most actionable in.
   */
  const seen = new Set<string>();
  const attention: StaffAttentionNotification[] = [];

  for (const item of [...noUpcomingAppointment, ...noWeeklyPlan, ...neverSignedIn]) {
    if (seen.has(item.clientId)) continue;
    seen.add(item.clientId);
    attention.push({ kind: 'attention', id: `${item.clientId}-${item.reason}`, ...item });
  }

  return attention;
}

export { DASHBOARD_ATTENTION_LIMIT };

export async function loadNotifications(clinicId: string): Promise<NotificationsData> {
  const now = new Date();

  const [pendingItems, pendingRequestCount, attention] = await Promise.all([
    listPendingRequestsPreview(clinicId, REQUEST_LIMIT),
    countPendingRequests(clinicId),
    loadStaffAttention(clinicId),
  ]);

  // `kind` is spelled out rather than spread: the row's own `kind` is the
  // request type, and the feed's is what sort of notification it is.
  const requests: StaffRequestNotification[] = pendingItems.map((request) => ({
    kind: 'request',
    id: request.id,
    clientId: request.clientId,
    clientName: request.clientName,
    requestKind: request.kind,
    preferredDate: request.preferredDate,
    preferredStartMinute: request.preferredStartMinute,
    note: request.note,
    createdAt: request.createdAt,
  }));

  return { requests, attention, pendingRequestCount, now };
}
