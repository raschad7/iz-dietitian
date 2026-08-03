import { toIsoDate } from '@/features/booking/date';

import {
  listClientsNeverSignedIn,
  listClientsWithNoUpcomingAppointment,
  listClientsWithoutWeeklyPlan,
  listPendingRequestsPreview,
  countPendingRequests,
} from './queries';
import { type NotificationsData, type StaffNotification } from './types';

/**
 * Everything waiting on the dietitian, as one feed.
 *
 * Appointment requests and clients drifting out of care were two cards side by
 * side once, which meant two places to check and neither ordered by urgency.
 * They are the same job — "someone needs an answer from me" — so they are one
 * list, requests first, because a request has a person waiting at the other end.
 *
 * Loaded by the staff layout rather than by a page: the bell is part of the
 * shell now, so every staff screen shows the same count.
 */

const FEED_LIMIT = 6;
const REQUEST_PREVIEW_LIMIT = 4;
const ATTENTION_CATEGORY_LIMIT = 3;

export async function loadNotifications(clinicId: string): Promise<NotificationsData> {
  const now = new Date();
  const today = toIsoDate(now);

  const [pendingItems, pendingRequestCount, noUpcomingAppointment, noWeeklyPlan, neverSignedIn] = await Promise.all([
    listPendingRequestsPreview(clinicId, REQUEST_PREVIEW_LIMIT),
    countPendingRequests(clinicId),
    listClientsWithNoUpcomingAppointment(clinicId, today, ATTENTION_CATEGORY_LIMIT),
    listClientsWithoutWeeklyPlan(clinicId, ATTENTION_CATEGORY_LIMIT),
    listClientsNeverSignedIn(clinicId, ATTENTION_CATEGORY_LIMIT),
  ]);

  // `kind` is spelled out rather than spread: the row's own `kind` is the
  // request type, and the feed's is what sort of notification it is.
  const requests: StaffNotification[] = pendingItems.map((request) => ({
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

  /*
   * One client can qualify for several attention categories at once (no plan
   * *and* never signed in), and the same person twice in a six-row feed reads
   * as a bug. First reason wins, in the order listed — the order the reasons
   * were judged most actionable in.
   */
  const seen = new Set<string>();
  const attention: StaffNotification[] = [];

  for (const item of [...noUpcomingAppointment, ...noWeeklyPlan, ...neverSignedIn]) {
    if (seen.has(item.clientId)) continue;
    seen.add(item.clientId);
    attention.push({ kind: 'attention', id: `${item.clientId}-${item.reason}`, ...item });
  }

  return {
    items: [...requests, ...attention].slice(0, FEED_LIMIT),
    pendingRequestCount,
    now,
  };
}
