import { hasEnded, type WallClock } from '@/features/booking/completed';
import { addDays } from '@/features/booking/date';

import { type PortalAppointment } from './types';

/**
 * Splitting a client's appointments into what is still to come and what has
 * been. Pure, so `appointments.test.ts` can assert the boundary cases directly.
 *
 * "Upcoming" is derived from the clock, never stored — the same rule the
 * dietitian's calendar uses (`src/features/booking/completed.ts`), so the two
 * areas can never disagree about whether this morning's appointment is over.
 */

export type SplitAppointments = {
  /** Soonest first — the next thing that happens is the thing worth showing. */
  upcoming: PortalAppointment[];
  /** Most recent first — history is read backwards. */
  past: PortalAppointment[];
};

export function splitAppointments(
  rows: readonly PortalAppointment[],
  now: WallClock,
): SplitAppointments {
  const upcoming: PortalAppointment[] = [];
  const past: PortalAppointment[] = [];

  for (const row of rows) {
    if (hasEnded(row, now)) past.push(row);
    else upcoming.push(row);
  }

  upcoming.sort(compareChronologically);
  past.sort((a, b) => compareChronologically(b, a));

  return { upcoming, past };
}

/** The one the dashboard leads with, or null when nothing is booked. */
export function nextAppointment(
  rows: readonly PortalAppointment[],
  now: WallClock,
): PortalAppointment | null {
  return splitAppointments(rows, now).upcoming[0] ?? null;
}

/** The one-word relative marker an upcoming appointment carries, if any. */
export type AppointmentMarker = 'today' | 'tomorrow' | 'next';

/**
 * How soon this one is, in the only terms worth a badge.
 *
 * "Today" and "tomorrow" are what someone opening the portal is actually
 * checking for, and a date alone makes them work it out. Everything further off
 * gets nothing — except the first of the list, which is marked as next so the
 * card that matters is obvious without counting down the page.
 *
 * `index` is the position within `upcoming`, so this is only meaningful for that
 * list. Past appointments take no marker: how long ago something was is not a
 * thing anyone acts on.
 */
export function appointmentMarker(
  appointment: PortalAppointment,
  index: number,
  now: WallClock,
): AppointmentMarker | null {
  if (appointment.date === now.date) return 'today';
  if (appointment.date === addDays(now.date, 1)) return 'tomorrow';
  return index === 0 ? 'next' : null;
}

/** Both dates are zero-padded ISO, so a string comparison is chronological. */
function compareChronologically(a: PortalAppointment, b: PortalAppointment): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.startMinute - b.startMinute;
}
