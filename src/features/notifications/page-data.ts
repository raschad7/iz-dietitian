import { toIsoDate } from '@/features/booking/date';

import {
  listClientsNeverSignedIn,
  listClientsWithNoUpcomingAppointment,
  listClientsWithoutWeeklyPlan,
  listClientsWithStaleMeasurement,
} from './queries';
import {
  type NotificationsData,
  type StaffAttentionNotification,
} from './types';

/**
 * Client records that may need follow-up. Requests deliberately stay in the
 * dashboard request card and `/app/requests`, where staff can answer them.
 */

const ATTENTION_CATEGORY_LIMIT = 8;

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

  const [noUpcomingAppointment, noWeeklyPlan, neverSignedIn, measurementOverdue] =
    await Promise.all([
      listClientsWithNoUpcomingAppointment(clinicId, today, perCategory),
      listClientsWithoutWeeklyPlan(clinicId, perCategory),
      listClientsNeverSignedIn(clinicId, perCategory),
      listClientsWithStaleMeasurement(clinicId, today, perCategory),
    ]);

  /*
   * One client can qualify for several attention categories at once (no plan
   * *and* never signed in), and the same person appearing twice in one list
   * reads as a bug. First reason wins, in the order listed — the order the
   * reasons were judged most actionable in.
   */
  const seen = new Set<string>();
  const attention: StaffAttentionNotification[] = [];

  /*
    `measurementOverdue` comes last in the precedence order deliberately. A
    client with no upcoming visit and no plan has a more pressing gap than one
    who is simply due a weigh-in, and a client who is about to be seen anyway
    will be measured at that visit.
  */
  for (const item of [
    ...noUpcomingAppointment,
    ...noWeeklyPlan,
    ...neverSignedIn,
    ...measurementOverdue,
  ]) {
    if (seen.has(item.clientId)) continue;
    seen.add(item.clientId);
    attention.push({ kind: 'attention', id: `${item.clientId}-${item.reason}`, ...item });
  }

  return attention;
}

export async function loadNotifications(clinicId: string): Promise<NotificationsData> {
  return { attention: await loadStaffAttention(clinicId) };
}
