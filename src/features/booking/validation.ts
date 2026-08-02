import { SLOT_MINUTES } from '@/lib/time-constants';
import type { ClinicDayHours } from '@/features/clinic-profile/types';

import { type WallClock } from './completed';
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
  /** Present for clinics using independently editable per-day ranges. */
  days?: readonly ClinicDayHours[];
};

export function hoursForDate(
  date: string,
  hours: ClinicHours,
): { openMinute: number; closeMinute: number } | null {
  const weekday = weekdayOf(date);
  if (weekday === null) return null;

  if (hours.days) {
    const day = hours.days.find((candidate) => candidate.weekday === weekday);
    return day?.isWorking
      ? { openMinute: day.openMinute, closeMinute: day.closeMinute }
      : null;
  }

  return hours.workingDays.includes(weekday)
    ? { openMinute: hours.openMinute, closeMinute: hours.closeMinute }
    : null;
}

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
  /**
   * The clinic's today, `YYYY-MM-DD`. Rule 2 refuses any date before it.
   *
   * Null when there is no clock to read — the server render, before
   * `useCalendarClock` has ticked — and the rule is then skipped rather than
   * guessed at, the same convention `isCompleted` uses for the same reason.
   * Required rather than optional so that every candidate has to say which
   * clock it was judged against; forgetting one is a compile error, not a rule
   * that silently does not run.
   */
  today: string | null;
};

/**
 * Message keys under the `booking` namespace. Typed as a union so a renamed key
 * is a compile error at every call site rather than a blank toast.
 */
export type BookingErrorKey =
  | 'errors.tooShort'
  | 'errors.invalidDate'
  | 'errors.pastDate'
  | 'errors.pastTime'
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
  const { date, startMinute, durationMinutes, practitionerId, clientId, excludeId, today } = candidate;

  // Guard before the rules: a non-integer start or duration would slip past
  // every comparison below (`NaN < x` is false) and reach the database.
  if (!Number.isInteger(startMinute) || !Number.isInteger(durationMinutes)) {
    return 'errors.tooShort';
  }

  // 1. Minimum duration — one slot.
  if (durationMinutes < MIN_DURATION_MINUTES) {
    return 'errors.tooShort';
  }

  // 2. A usable date: one that existed, one that has not already gone, and one
  //    the clinic opens on. An unparseable date fails first rather than being
  //    quietly treated as a closed day, which would be a confusing message.
  const weekday = weekdayOf(date);
  if (weekday === null) {
    return 'errors.invalidDate';
  }

  // Whole dates, not instants: today is bookable at any hour, so the 09:00 slot
  // can still be filled in at 15:00 — writing up the morning is bookkeeping,
  // not time travel. Both sides are zero-padded ISO, so `<` is chronological.
  //
  // Checked before the working-day rule so that a date which is both past and a
  // closed day reports the more useful of the two: that the day has gone.
  if (today !== null && date < today) {
    return 'errors.pastDate';
  }

  const selectedHours = hoursForDate(date, hours);
  if (!selectedHours) {
    return 'errors.closedDay';
  }

  // 3. Inside the clinic day — both ends of the appointment, not just the start.
  const endMinute = startMinute + durationMinutes;
  if (startMinute < selectedHours.openMinute || endMinute > selectedHours.closeMinute) {
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

/**
 * Whether a move would put an appointment at a moment that has already passed.
 *
 * Separate from {@link validateBooking}, and deliberately so: this is the one
 * rule that needs to know where the appointment *was*, and a candidate has no
 * business carrying its own history. Keeping it here still means the rules live
 * in one file, and the client and the server call the same function.
 *
 * ## Why moving is stricter than creating
 *
 * Creating is bounded by the date only — the clinic can write up this morning's
 * walk-in at three in the afternoon, which is bookkeeping. Moving a patient to a
 * time that has gone is not bookkeeping; it is telling someone to attend an
 * appointment they cannot attend, and it now sends them a WhatsApp message
 * naming that time.
 *
 * ## The two exemptions
 *
 * An appointment that has *ended* is refused earlier and by something else — the
 * completed-lock in `updateAppointment` — so the only appointments reaching here
 * are in progress or still to come.
 *
 * An appointment in progress must stay editable. Its start is behind the clock by
 * definition, so a naive "start must be in the future" would make a 14:30
 * appointment uneditable at 15:00 — its reason could never be corrected. Hence
 * the first check: a candidate that did not move is not moving into the past.
 */
export function movesIntoThePast(
  next: { date: string; startMinute: number },
  previous: { date: string; startMinute: number },
  now: WallClock | null,
): boolean {
  // No clock — the server render, before `useCalendarClock` ticks. Skipped
  // rather than guessed at, the same convention the past-date rule uses.
  if (!now) return false;

  // Nothing moved: an edit to the reason, the duration or the client. Whether
  // the start is behind the clock is not this rule's business.
  if (next.date === previous.date && next.startMinute === previous.startMinute) return false;

  if (next.date < now.date) return true;

  return next.date === now.date && next.startMinute < now.minute;
}

/** True when the clinic opens on that date. Used to grey out closed days. */
export function isWorkingDay(date: string, hours: ClinicHours): boolean {
  return hoursForDate(date, hours) !== null;
}
