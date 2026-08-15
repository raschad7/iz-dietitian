import { toIsoDate } from '@/features/booking/date';

import {
  listClientsNeverSignedIn,
  listClientsWithNoUpcomingAppointment,
  listClientsWithoutWeeklyPlan,
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

export async function loadNotifications(clinicId: string): Promise<NotificationsData> {
  return { attention: await loadStaffAttention(clinicId) };
}
