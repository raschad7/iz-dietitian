import { hasEnded, type WallClock } from '@/features/booking/completed';

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

/** Both dates are zero-padded ISO, so a string comparison is chronological. */
function compareChronologically(a: PortalAppointment, b: PortalAppointment): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.startMinute - b.startMinute;
}
