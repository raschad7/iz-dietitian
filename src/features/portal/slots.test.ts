import { describe, expect, test } from 'bun:test';

import { type ExistingAppointment } from '@/features/booking/validation';

import {
  availableSlots,
  isWithinRequestWindow,
  lastRequestableDate,
  selectableDays,
  REQUEST_DURATION_MINUTES,
  REQUEST_SLOT_MINUTES,
  REQUEST_WINDOW_DAYS,
} from './slots';

/** Sunday–Thursday, 08:00 to 12:00 — a short day, so the slot list is countable. */
const HOURS = { workingDays: [0, 1, 2, 3, 4], openMinute: 8 * 60, closeMinute: 12 * 60 };

/** Wednesday 5 August 2026. */
const WEDNESDAY = '2026-08-05';
/** Friday 7 August 2026 — outside `workingDays`. */
const FRIDAY = '2026-08-07';

const CLIENT = 'client-1';

/** Long before opening, so nothing is filtered out for being in the past. */
const EARLY = { date: WEDNESDAY, minute: 0 };

function booking(overrides: Partial<ExistingAppointment> = {}): ExistingAppointment {
  return {
    id: 'appointment-1',
    practitionerId: 'practitioner-1',
    clientId: 'someone-else',
    date: WEDNESDAY,
    startMinute: 9 * 60,
    durationMinutes: 30,
    ...overrides,
  };
}

function slots(overrides: Partial<Parameters<typeof availableSlots>[0]> = {}): number[] {
  return availableSlots({
    date: WEDNESDAY,
    hours: HOURS,
    existing: [],
    clientId: CLIENT,
    now: EARLY,
    ...overrides,
  });
}

describe('availableSlots', () => {
  test('offers every half hour that fits inside the clinic day', () => {
    // 08:00 to 12:00 with a 30-minute consultation: the last one that fits
    // starts at 11:30.
    expect(slots()).toEqual([480, 510, 540, 570, 600, 630, 660, 690]);
  });

  test('spaces the offers by the request grid, not the booking grid', () => {
    const [first, second] = slots();
    expect((second ?? 0) - (first ?? 0)).toBe(REQUEST_SLOT_MINUTES);
  });

  test('offers nothing on a day the clinic is closed', () => {
    expect(slots({ date: FRIDAY })).toEqual([]);
  });

  test('offers nothing for a date that never existed', () => {
    expect(slots({ date: '2026-02-30' })).toEqual([]);
  });

  test('withholds a time another appointment overlaps', () => {
    expect(slots({ existing: [booking()] })).not.toContain(9 * 60);
  });

  test('offers the times either side of a booking', () => {
    // Half-open ranges: an 08:30 consultation ends exactly as the 09:00–09:30
    // booking starts, and 09:30 begins exactly as it finishes. Neither clashes.
    const open = slots({ existing: [booking()] });

    expect(open).toContain(8 * 60 + 30);
    expect(open).toContain(9 * 60 + 30);
  });

  test('treats the clinic as one calendar, whichever practitioner is busy', () => {
    // Rule 4 is per practitioner, but the portal cannot know who a request will
    // land with, so any booked time is withheld.
    const other = booking({ practitionerId: 'practitioner-2' });
    expect(slots({ existing: [other] })).not.toContain(9 * 60);
  });

  test('offers nothing on a day the client is already booked', () => {
    // Rule 5: one appointment per client per day, whatever the time.
    expect(slots({ existing: [booking({ clientId: CLIENT, startMinute: 8 * 60 })] })).toEqual([]);
  });

  test('ignores the appointment being rescheduled', () => {
    const own = booking({ id: 'moving', clientId: CLIENT, startMinute: 8 * 60 });

    // Without the exclusion the client's own booking blocks the whole day; with
    // it, only the time it actually occupies is unavailable.
    expect(slots({ existing: [own], excludeAppointmentId: 'moving' })).toContain(11 * 60);
  });

  test('does not offer a time that has already passed today', () => {
    const midMorning = { date: WEDNESDAY, minute: 9 * 60 + 5 };

    expect(slots({ now: midMorning })).not.toContain(9 * 60);
    expect(slots({ now: midMorning })).toContain(9 * 60 + 30);
  });

  test('offers a whole day that is still ahead', () => {
    // The clock only rules out times on the day it is on.
    expect(slots({ date: '2026-08-06', now: { date: WEDNESDAY, minute: 23 * 60 } })).toHaveLength(8);
  });

  test('ignores bookings on other days', () => {
    expect(slots({ existing: [booking({ date: '2026-08-04' })] })).toHaveLength(8);
  });

  test('never offers a time an appointment would run past closing from', () => {
    const last = slots().at(-1) ?? 0;
    expect(last + REQUEST_DURATION_MINUTES).toBeLessThanOrEqual(HOURS.closeMinute);
  });

  test('rounds the first offer up onto the half-hour grid', () => {
    const openingAt0810 = slots({ hours: { ...HOURS, openMinute: 8 * 60 + 10 } });
    expect(openingAt0810[0]).toBe(8 * 60 + 30);
  });
});

describe('selectableDays', () => {
  const input = { hours: HOURS, existing: [], clientId: CLIENT, now: EARLY };

  test('starts on today and runs for the whole window', () => {
    const days = selectableDays(input, 7);

    expect(days).toHaveLength(7);
    expect(days[0]?.date).toBe(WEDNESDAY);
    expect(days[6]?.date).toBe('2026-08-11');
  });

  test('reports closed days rather than hiding them', () => {
    const days = selectableDays(input, 7);
    const friday = days.find((day) => day.date === FRIDAY);

    // Present, and visibly empty: a date strip with holes in it reads as a bug.
    expect(friday).toBeDefined();
    expect(friday?.openCount).toBe(0);
  });

  test('counts what is actually free on each day', () => {
    const days = selectableDays({ ...input, existing: [booking()] }, 2);

    // Today loses only the 09:00 slot the booking sits on; tomorrow is untouched.
    expect(days[0]?.openCount).toBe(7);
    expect(days[1]?.openCount).toBe(8);
  });

  test('offers no more than the window, so nothing beyond a month can be picked', () => {
    const days = selectableDays(input);
    const last = days.at(-1);

    expect(days).toHaveLength(REQUEST_WINDOW_DAYS);
    expect(last?.date).toBe(lastRequestableDate(WEDNESDAY));
    expect(isWithinRequestWindow(last!.date, WEDNESDAY)).toBe(true);
  });
});

describe('isWithinRequestWindow', () => {
  test('accepts today and the last day of the window', () => {
    expect(isWithinRequestWindow(WEDNESDAY, WEDNESDAY)).toBe(true);
    expect(isWithinRequestWindow(lastRequestableDate(WEDNESDAY), WEDNESDAY)).toBe(true);
  });

  /**
   * The rule the date strip cannot enforce on its own: a form posts whatever it
   * is given, and `availableSlots` would happily call a Tuesday six months out
   * open, because the clinic is indeed open on Tuesdays.
   */
  test('refuses the day after the window closes', () => {
    // Thirty days from Wednesday 5 August, counting today, ends on 3 September.
    expect(isWithinRequestWindow('2026-09-03', WEDNESDAY)).toBe(true);
    expect(isWithinRequestWindow('2026-09-04', WEDNESDAY)).toBe(false);
  });

  test('refuses a date months out', () => {
    expect(isWithinRequestWindow('2027-02-05', WEDNESDAY)).toBe(false);
  });

  test('refuses yesterday — a request is never about the past', () => {
    expect(isWithinRequestWindow('2026-08-04', WEDNESDAY)).toBe(false);
  });

  test('the last requestable date is today plus the window, inclusive of today', () => {
    // 30 days offered starting Wednesday 5 August is the 3rd of September.
    expect(lastRequestableDate(WEDNESDAY)).toBe('2026-09-03');
  });
});
