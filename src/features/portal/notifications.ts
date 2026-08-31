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
  /**
   * An appointment the dietitian booked in the last day or two — see
   * `PortalAppointment.bookedDate`. Independent of `appointmentReminder`: one
   * says "this is coming up", the other says "this was just scheduled", and an
   * appointment booked for tomorrow can honestly be both at once, the same way
   * the Web Push side sends an `appointment_booked` message and a later
   * `appointment_reminder` for the same visit without either replacing the
   * other (see `push/notify.ts`).
   */
  | { id: string; kind: 'appointmentBooked'; date: IsoDate; startMinute: number }
  /** A published plan covers the week `now` falls in. */
  | { id: string; kind: 'planUpdate'; weekStartDate: IsoDate }
  /** The dietitian answered a request the client filed. */
  | { id: string; kind: 'clinicMessage'; requestKind: RequestKind; status: 'approved' | 'declined'; respondedAt: Date };

/**
 * Where tapping a notification lands, under `/portal`.
 *
 * Every kind here has a real screen behind it — an appointment reminder or an
 * answered request is always about a booking, so both point at the
 * appointments tab; a plan update or an unlogged day both read off the home
 * screen. The map is total over {@link PortalNotification}'s kinds precisely
 * so a new kind is a compile error here rather than a row that renders as a
 * dead card. See `pushDestination` in `push/templates.ts` for the same
 * mapping's twin on the Web Push side — the two channels are reporting the
 * same events and are kept in step by hand rather than by sharing code, since
 * a push kind and a `PortalNotification` kind are two different unions.
 */
const NOTIFICATION_DESTINATION = {
  adherenceReminder: '/portal',
  appointmentReminder: '/portal/appointments',
  appointmentBooked: '/portal/appointments',
  planUpdate: '/portal',
  clinicMessage: '/portal/appointments',
} as const satisfies Record<PortalNotification['kind'], string>;

/** The screen a notification is about, as an app-relative path. */
export function notificationHref(kind: PortalNotification['kind']): string {
  return NOTIFICATION_DESTINATION[kind];
}

/** An appointment today, tomorrow or the day after is close enough to remind about. */
const APPOINTMENT_REMINDER_WINDOW_DAYS = 2;

/**
 * An appointment booked today or yesterday, clinic-local, is still "just
 * booked" news. Day-granular rather than a real elapsed-hours check, on
 * purpose — `now` here is a `WallClock`, not an instant, the same reason
 * {@link APPOINTMENT_REMINDER_WINDOW_DAYS} is a day count rather than a
 * minute count.
 */
const RECENTLY_BOOKED_WINDOW_DAYS = 1;

/** How many just-booked appointments the feed shows at once — a repeat series is the case this guards. */
const RECENTLY_BOOKED_LIMIT = 5;

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
  const reminded = next && next.date <= addDays(now.date, APPOINTMENT_REMINDER_WINDOW_DAYS) ? next : null;
  if (reminded) {
    items.push({
      id: `appointment-${reminded.id}`,
      kind: 'appointmentReminder',
      date: reminded.date,
      startMinute: reminded.startMinute,
    });
  }

  // Excludes whichever appointment just got the reminder card above, if any —
  // a second card about the same visit would read as two systems agreeing by
  // coincidence rather than one system stating it once. `next` alone is not
  // enough to exclude: it is always the *closest* appointment, reminder
  // window or not, so excluding it unconditionally would silently drop the
  // booked card for a far-future appointment that happens to be the only one
  // on file.
  const bookedSince = addDays(now.date, -RECENTLY_BOOKED_WINDOW_DAYS);
  const recentlyBooked = appointments
    .filter((appointment) => appointment.id !== reminded?.id && appointment.bookedDate >= bookedSince)
    .slice(0, RECENTLY_BOOKED_LIMIT);

  for (const appointment of recentlyBooked) {
    items.push({
      id: `booked-${appointment.id}`,
      kind: 'appointmentBooked',
      date: appointment.date,
      startMinute: appointment.startMinute,
    });
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
