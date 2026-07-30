import { SLOT_MINUTES } from '@/lib/time-constants';

import { weekdayOf } from './date';

/**
 * The booking rules, and the only place they are written down.
 *
 * Pure by design — no React, no database, no Next.js. The client calls it on
 * every pointer move to paint a drag green or red; the server calls the very
 * same function inside the write transaction, against rows it has just read.
 * A rule cannot drift between the two because there is only one of it.
 *
 * The client's answer is a courtesy. The server's is the authority, and the
 * database constraints in `src/db/schema/appointments.ts` are the backstop for
 * the race the server cannot see: two staff members booking one slot at once.
 *
 * Returns a translation key rather than a sentence, so the same rejection reads
 * correctly in Arabic and in English.
 */

/**
 * Re-exported so the rules and the grid have one import to reach for. The value
 * itself lives in `src/lib/time-constants.ts`, which the database schema also
 * reads — the check constraints and these rules must not drift.
 */
export { SLOT_MINUTES };

/** Rule 1. One slot. */
export const MIN_DURATION_MINUTES = SLOT_MINUTES;

/** What a click on empty canvas creates: two slots, tall enough for name + time. */
export const DEFAULT_DURATION_MINUTES = 30;

/** When the clinic is open. Read from `clinics`, never hardcoded at a call site. */
export type ClinicHours = {
  /** Weekday numbers, 0 = Sunday … 6 = Saturday, matching `Date#getDay()`. */
  workingDays: readonly number[];
  /** Minutes from local midnight. */
  openMinute: number;
  closeMinute: number;
};

/** The fields of an existing appointment the rules actually consult. */
export type ExistingAppointment = {
  id: string;
  practitionerId: string;
  clientId: string;
  /** `YYYY-MM-DD`. */
  date: string;
  startMinute: number;
  durationMinutes: number;
};

export type BookingCandidate = {
  practitionerId: string;
  /**
   * Absent during the create gesture, before anyone has been picked. Rule 5 is
   * skipped rather than failed — otherwise dragging out a slot would be rejected
   * for a client who does not exist yet.
   */
  clientId?: string | null;
  /** `YYYY-MM-DD`. */
  date: string;
  startMinute: number;
  durationMinutes: number;
  /**
   * The appointment being moved or resized. It is excluded from rules 4 and 5,
   * so an appointment never conflicts with itself.
   */
  excludeId?: string | null;
};

/**
 * Message keys under the `booking` namespace. Typed as a union so a renamed key
 * is a compile error at every call site rather than a blank toast.
 */
export type BookingErrorKey =
  | 'errors.tooShort'
  | 'errors.invalidDate'
  | 'errors.closedDay'
  | 'errors.outsideHours'
  | 'errors.overlap'
  | 'errors.clientBooked';

/** Half-open ranges: an appointment ending at 10:00 does not touch one starting at 10:00. */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Applies every booking rule, in the order they are listed in the spec, and
 * returns the first failure — or null when the candidate is bookable.
 *
 * `existing` is whatever set the caller considers authoritative: on the client,
 * the appointments currently on screen; on the server, the rows just read inside
 * the transaction. Appointments on other dates are harmless to pass in — every
 * rule filters by date itself.
 */
export function validateBooking(
  candidate: BookingCandidate,
  existing: readonly ExistingAppointment[],
  hours: ClinicHours,
): BookingErrorKey | null {
  const { date, startMinute, durationMinutes, practitionerId, clientId, excludeId } = candidate;

  // Guard before the rules: a non-integer start or duration would slip past
  // every comparison below (`NaN < x` is false) and reach the database.
  if (!Number.isInteger(startMinute) || !Number.isInteger(durationMinutes)) {
    return 'errors.tooShort';
  }

  // 1. Minimum duration — one slot.
  if (durationMinutes < MIN_DURATION_MINUTES) {
    return 'errors.tooShort';
  }

  // 2. Working days only. An unparseable date fails here rather than being
  //    quietly treated as a closed day, which would be a confusing message.
  const weekday = weekdayOf(date);
  if (weekday === null) {
    return 'errors.invalidDate';
  }
  if (!hours.workingDays.includes(weekday)) {
    return 'errors.closedDay';
  }

  // 3. Inside the clinic day — both ends of the appointment, not just the start.
  const endMinute = startMinute + durationMinutes;
  if (startMinute < hours.openMinute || endMinute > hours.closeMinute) {
    return 'errors.outsideHours';
  }

  const sameDay = existing.filter((row) => row.date === date && row.id !== excludeId);

  // 4. No overlap — for this practitioner. Two practitioners may see two
  //    different clients at the same time; that is the whole point of a rota.
  const clash = sameDay.some(
    (row) =>
      row.practitionerId === practitionerId &&
      overlaps(startMinute, endMinute, row.startMinute, row.startMinute + row.durationMinutes),
  );
  if (clash) {
    return 'errors.overlap';
  }

  // 5. One booking per client per day — any practitioner, any time. Skipped
  //    while no client has been chosen.
  if (clientId && sameDay.some((row) => row.clientId === clientId)) {
    return 'errors.clientBooked';
  }

  return null;
}

/**
 * The appointment already booked for this client on this date, if any.
 *
 * Rule 5 answers "may they?"; the picker also needs "when, and with whom?" so it
 * can disable the row and explain itself instead of letting staff click into a
 * rejection. Shares the exclusion semantics so the client being edited is not
 * reported as blocking itself.
 */
export function findClientBooking(
  clientId: string,
  date: string,
  existing: readonly ExistingAppointment[],
  excludeId?: string | null,
): ExistingAppointment | null {
  return existing.find((row) => row.date === date && row.clientId === clientId && row.id !== excludeId) ?? null;
}

/** True when the clinic opens on that date. Used to grey out closed days. */
export function isWorkingDay(date: string, hours: ClinicHours): boolean {
  const weekday = weekdayOf(date);
  return weekday !== null && hours.workingDays.includes(weekday);
}
