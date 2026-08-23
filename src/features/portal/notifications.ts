import { type WallClock } from '@/features/booking/completed';
import { addDays, type IsoDate } from '@/features/booking/date';

import { type AdherenceLevel } from './adherence';
import { nextAppointment } from './appointments';
import { weekDates } from './check-ins';
import { type PortalAppointment, type PortalRequest, type RequestKind } from './types';

/**
 * Turning the client's own data — never a separate notifications table — into
 * the feed behind the portal header's bell (`PortalNotificationsBell`) and the
 * full screen at `/portal/notifications` (`NotificationsPage`) that "see all"
 * opens. Both read this same array — the popover slices a preview off the
 * front of it, the screen renders all of it — so the two can never disagree
 * about what the feed contains.
 *
 * Pure — no database, no Next.js, no `Date.now()` — same reasoning as
 * `adherence.ts` and `check-ins.ts`: everything time-dependent arrives as the
 * clinic's `now`, so this can be tested directly. There is deliberately no
 * "unread" flag or a table of its own: every item here is derived from a
 * record that already exists for its own reason (an appointment, a plan, a
 * request, today's adherence), so the feed can never drift out of sync with
 * what those screens themselves show.
 */

export type PortalNotification =
  /** Today's adherence has not been logged yet — the progress tab's own ask, echoed here. */
  | { id: string; kind: 'adherenceReminder' }
  /** An appointment close enough to be worth a reminder. */
  | { id: string; kind: 'appointmentReminder'; date: IsoDate; startMinute: number }
  /** A published plan covers the week `now` falls in. */
  | { id: string; kind: 'planUpdate'; weekStartDate: IsoDate }
  /** The dietitian answered a request the client filed. */
  | { id: string; kind: 'clinicMessage'; requestKind: RequestKind; status: 'approved' | 'declined'; respondedAt: Date };

/** An appointment today, tomorrow or the day after is close enough to remind about. */
const APPOINTMENT_REMINDER_WINDOW_DAYS = 2;

/** How many answered requests the feed shows — a preview, not the full history. */
const CLINIC_MESSAGE_LIMIT = 5;

export function buildNotifications({
  now,
  todayAdherenceLevel,
  appointments,
  requests,
  currentWeekPlanStartDate,
}: {
  now: WallClock;
  /** Today's own adherence report, or null when nothing has been logged yet. */
  todayAdherenceLevel: AdherenceLevel | null;
  appointments: readonly PortalAppointment[];
  requests: readonly PortalRequest[];
  /** The published plan's week, or null when there is none — see `loadCurrentPlan`. */
  currentWeekPlanStartDate: IsoDate | null;
}): PortalNotification[] {
  const items: PortalNotification[] = [];

  if (todayAdherenceLevel === null) {
    items.push({ id: `adherence-${now.date}`, kind: 'adherenceReminder' });
  }

  const next = nextAppointment(appointments, now);
  if (next && next.date <= addDays(now.date, APPOINTMENT_REMINDER_WINDOW_DAYS)) {
    items.push({ id: `appointment-${next.id}`, kind: 'appointmentReminder', date: next.date, startMinute: next.startMinute });
  }

  const currentWeekStart = weekDates(now.date)[0];
  if (currentWeekPlanStartDate && currentWeekPlanStartDate === currentWeekStart) {
    items.push({ id: `plan-${currentWeekPlanStartDate}`, kind: 'planUpdate', weekStartDate: currentWeekPlanStartDate });
  }

  const answered = requests
    .filter(
      (request): request is PortalRequest & { status: 'approved' | 'declined' } =>
        request.status === 'approved' || request.status === 'declined',
    )
    .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, CLINIC_MESSAGE_LIMIT);

  for (const request of answered) {
    items.push({
      id: `request-${request.id}`,
      kind: 'clinicMessage',
      requestKind: request.kind,
      status: request.status,
      respondedAt: request.updatedAt,
    });
  }

  return items;
}
