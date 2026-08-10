import { addDays, isIsoDate, type IsoDate } from '@/features/booking/date';
import {
  DEFAULT_DURATION_MINUTES,
  isWorkingDay,
  validateBooking,
  type ClinicHours,
  type ExistingAppointment,
} from '@/features/booking/validation';
import { hasEnded, type WallClock } from '@/features/booking/completed';

/**
 * Which times a client may ask for, and on which days.
 *
 * Pure: no database, no React, no `Intl` — so `slots.test.ts` asserts it
 * directly and the portal's request form can be rendered from it on the server.
 *
 * Every answer here comes from `validateBooking`, the same rule engine the
 * dietitian's calendar uses. The rules are not restated: a slot this module
 * offers is one that would survive a real booking, so the client is never
 * invited to ask for something that could not be granted.
 */

/**
 * The clinic is treated as one calendar.
 *
 * Rule 4 — no overlap — is keyed on the practitioner, because two practitioners
 * may legitimately see two clients at once. The portal cannot know which
 * practitioner a request will land with, so every appointment on the day is
 * mapped onto one synthetic id before the rules run. The effect is that a busy
 * time is never offered, even if some other practitioner happens to be free:
 * conservative on purpose, since the alternative is offering a slot and
 * refusing it after the client has asked for it.
 */
const CLINIC_AS_ONE = 'portal-clinic';

/** Offered start times, half an hour apart. A 15-minute grid is a wall of buttons on a phone. */
export const REQUEST_SLOT_MINUTES = 30;

/**
 * How long a requested appointment is assumed to run.
 *
 * The client does not choose this — the length of a consultation is the
 * dietitian's call. It is only used to ask "would something of the usual size
 * fit here?", so the times offered are ones that can actually be honoured.
 */
export const REQUEST_DURATION_MINUTES = DEFAULT_DURATION_MINUTES;

/** How far ahead the portal lets a client look. Beyond a month is not a request, it is a guess. */
export const REQUEST_WINDOW_DAYS = 30;

/**
 * The last date a client may ask for: today plus the window, inclusive of
 * today. Thirty days offered means today and the twenty-nine after it.
 */
export function lastRequestableDate(today: IsoDate, days = REQUEST_WINDOW_DAYS): IsoDate {
  return addDays(today, days - 1);
}

/**
 * Whether a date falls inside the month a client may ask within.
 *
 * **This is the rule, not the date strip.** The strip only renders
 * {@link selectableDays}, and a form posts whatever it is given — so without a
 * check on the write, a crafted request could name a date six months out and
 * land in the dietitian's inbox looking exactly like a real one. Nothing else
 * would have caught it: `availableSlots` asks whether the clinic is open and
 * whether the time is free, and a Tuesday next spring is both.
 *
 * ISO dates compare lexicographically in date order, which is why this is a
 * string comparison rather than two `Date` constructions.
 */
export function isWithinRequestWindow(
  date: IsoDate,
  today: IsoDate,
  days = REQUEST_WINDOW_DAYS,
): boolean {
  return date >= today && date <= lastRequestableDate(today, days);
}

export type SlotInput = {
  date: IsoDate;
  hours: ClinicHours;
  /** Every appointment already on that date, whichever practitioner. */
  existing: readonly ExistingAppointment[];
  /** The client asking, so rule 5 — one booking per client per day — applies. */
  clientId: string;
  /** The clinic's wall clock, so today's past times are not offered. */
  now: WallClock;
  /** Set when rescheduling: that appointment does not block its own new time. */
  excludeAppointmentId?: string | null;
};

/**
 * The start minutes still open on one date, in clock order.
 *
 * Empty is a perfectly ordinary answer — a closed day, a fully booked one, or a
 * day the client already has an appointment on all produce it.
 */
export function availableSlots({
  date,
  hours,
  existing,
  clientId,
  now,
  excludeAppointmentId = null,
}: SlotInput): number[] {
  if (!isIsoDate(date) || !isWorkingDay(date, hours)) return [];

  // One calendar, so an appointment with any practitioner blocks the time.
  const sameDay = existing
    .filter((row) => row.date === date)
    .map((row) => ({ ...row, practitionerId: CLINIC_AS_ONE }));

  const open: number[] = [];

  for (
    let startMinute = firstSlotOnOrAfter(hours.openMinute);
    startMinute + REQUEST_DURATION_MINUTES <= hours.closeMinute;
    startMinute += REQUEST_SLOT_MINUTES
  ) {
    // A time that has already passed is not on offer, however free it is.
    if (hasEnded({ date, startMinute, durationMinutes: 0 }, now)) continue;

    const rejection = validateBooking(
      {
        practitionerId: CLINIC_AS_ONE,
        clientId,
        date,
        startMinute,
        durationMinutes: REQUEST_DURATION_MINUTES,
        excludeId: excludeAppointmentId,
        // The portal's floor, and the reason this is a parameter rather than a
        // rule: staff pass null and may record a visit on the day it happened,
        // where a patient asking for last Tuesday is only ever a mistake.
        //
        // Already covered by the `hasEnded` guard above, which drops every past
        // time before the rules run. Passed anyway so the portal states its own
        // limit rather than relying on that guard staying where it is.
        earliestDate: now.date,
      },
      sameDay,
      hours,
    );

    if (rejection === null) open.push(startMinute);
  }

  return open;
}

/** Rounds the opening time up onto the half-hour grid: an 08:10 open first offers 08:30. */
function firstSlotOnOrAfter(minute: number): number {
  return Math.ceil(minute / REQUEST_SLOT_MINUTES) * REQUEST_SLOT_MINUTES;
}

export type SelectableDay = {
  date: IsoDate;
  /** How many start times are still open. Zero days are shown greyed rather than hidden. */
  openCount: number;
};

/**
 * The dates the request form offers, starting today.
 *
 * Days with nothing left are returned too, with `openCount: 0`. Hiding them
 * would leave a date strip with holes in it, which reads as a bug rather than
 * as "we are closed on Fridays".
 */
export function selectableDays(input: Omit<SlotInput, 'date'>, days = REQUEST_WINDOW_DAYS): SelectableDay[] {
  return Array.from({ length: days }, (_, offset) => {
    const date = addDays(input.now.date, offset);
    return { date, openCount: availableSlots({ ...input, date }).length };
  });
}
