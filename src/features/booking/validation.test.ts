import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  findClientBooking,
  isWorkingDay,
  validateBooking,
  type BookingCandidate,
  type ClinicHours,
  type ExistingAppointment,
} from './validation';

/**
 * 2026-08-05 is a Wednesday; 2026-08-07 a Friday and 2026-08-08 a Saturday —
 * the clinic's weekend under the default Sunday–Thursday week.
 */
const TUESDAY = '2026-08-04';
const WEDNESDAY = '2026-08-05';
const FRIDAY = '2026-08-07';
const SATURDAY = '2026-08-08';
const THURSDAY = '2026-08-06';

const HOURS: ClinicHours = {
  workingDays: [0, 1, 2, 3, 4],
  openMinute: 8 * 60, // 08:00
  closeMinute: 18 * 60, // 18:00
};

const PRACTITIONER = 'practitioner-a';
const OTHER_PRACTITIONER = 'practitioner-b';
const CLIENT = 'client-a';
const OTHER_CLIENT = 'client-b';

function candidate(overrides: Partial<BookingCandidate> = {}): BookingCandidate {
  return {
    practitionerId: PRACTITIONER,
    clientId: CLIENT,
    date: WEDNESDAY,
    startMinute: 9 * 60,
    durationMinutes: DEFAULT_DURATION_MINUTES,
    // No floor unless a test asks for one — which is also what every staff
    // caller passes, so the cases below ask exactly what the calendar asks.
    earliestDate: null,
    ...overrides,
  };
}

function existing(overrides: Partial<ExistingAppointment> = {}): ExistingAppointment {
  return {
    id: 'existing-1',
    practitionerId: PRACTITIONER,
    clientId: OTHER_CLIENT,
    date: WEDNESDAY,
    startMinute: 10 * 60, // 10:00
    durationMinutes: 60, // …–11:00
    ...overrides,
  };
}

describe('rule 1 — minimum duration', () => {
  test('accepts exactly one slot', () => {
    expect(validateBooking(candidate({ durationMinutes: MIN_DURATION_MINUTES }), [], HOURS)).toBeNull();
  });

  test('rejects one minute under a slot', () => {
    expect(validateBooking(candidate({ durationMinutes: MIN_DURATION_MINUTES - 1 }), [], HOURS)).toBe(
      'errors.tooShort',
    );
  });

  test('rejects a zero or negative duration', () => {
    expect(validateBooking(candidate({ durationMinutes: 0 }), [], HOURS)).toBe('errors.tooShort');
    expect(validateBooking(candidate({ durationMinutes: -30 }), [], HOURS)).toBe('errors.tooShort');
  });

  test('rejects a non-integer start or duration rather than letting NaN through', () => {
    expect(validateBooking(candidate({ durationMinutes: Number.NaN }), [], HOURS)).toBe('errors.tooShort');
    expect(validateBooking(candidate({ startMinute: Number.NaN }), [], HOURS)).toBe('errors.tooShort');
    expect(validateBooking(candidate({ startMinute: 540.5 }), [], HOURS)).toBe('errors.tooShort');
  });
});

describe('rule 2 — working days only', () => {
  test('accepts a working day', () => {
    expect(validateBooking(candidate({ date: THURSDAY }), [], HOURS)).toBeNull();
  });

  test('rejects the clinic weekend', () => {
    expect(validateBooking(candidate({ date: FRIDAY }), [], HOURS)).toBe('errors.closedDay');
    expect(validateBooking(candidate({ date: SATURDAY }), [], HOURS)).toBe('errors.closedDay');
  });

  test('reads the working week from config, not a constant', () => {
    const fridaySaturdayClinic: ClinicHours = { ...HOURS, workingDays: [5, 6] };

    expect(validateBooking(candidate({ date: FRIDAY }), [], fridaySaturdayClinic)).toBeNull();
    expect(validateBooking(candidate({ date: WEDNESDAY }), [], fridaySaturdayClinic)).toBe('errors.closedDay');
  });

  test('rejects a date that never existed', () => {
    expect(validateBooking(candidate({ date: '2026-02-30' }), [], HOURS)).toBe('errors.invalidDate');
    expect(validateBooking(candidate({ date: '05/08/2026' }), [], HOURS)).toBe('errors.invalidDate');
  });
});

describe('rule 2 — no earlier than the caller allows', () => {
  test('rejects any date before the floor', () => {
    expect(validateBooking(candidate({ date: TUESDAY, earliestDate: WEDNESDAY }), [], HOURS)).toBe('errors.pastDate');
    expect(validateBooking(candidate({ date: '2020-01-06', earliestDate: WEDNESDAY }), [], HOURS)).toBe(
      'errors.pastDate',
    );
  });

  test('accepts the floor itself', () => {
    expect(validateBooking(candidate({ date: WEDNESDAY, earliestDate: WEDNESDAY }), [], HOURS)).toBeNull();
  });

  test('accepts the floor at a time that has already gone — it is about dates, not clocks', () => {
    // 08:00 on a day whose afternoon has arrived is still bookable: writing up
    // the morning is bookkeeping, not a booking in the past.
    expect(
      validateBooking(
        candidate({ date: WEDNESDAY, startMinute: HOURS.openMinute, earliestDate: WEDNESDAY }),
        [],
        HOURS,
      ),
    ).toBeNull();
  });

  test('accepts a later date', () => {
    expect(validateBooking(candidate({ date: THURSDAY, earliestDate: WEDNESDAY }), [], HOURS)).toBeNull();
  });

  test('a closed day below the floor reports the floor, not that the clinic is shut', () => {
    // Friday the 7th judged from the following Wednesday: both rules would
    // reject it, and the more useful answer is the one about the date.
    expect(validateBooking(candidate({ date: FRIDAY, earliestDate: '2026-08-12' }), [], HOURS)).toBe(
      'errors.pastDate',
    );
  });

  test('still rejects a date that never existed, even against a floor', () => {
    expect(validateBooking(candidate({ date: '2026-02-30', earliestDate: WEDNESDAY }), [], HOURS)).toBe(
      'errors.invalidDate',
    );
  });
});

describe('a date that has already gone', () => {
  /**
   * Whether the past is bookable belongs to the caller, not to the rules. Staff
   * pass no floor at all: the clinic writes up visits after they happen, and a
   * calendar that refuses to record last Tuesday is a calendar the clinic has
   * to keep notes beside. The portal passes its own today, because a patient
   * asking for last Tuesday is only ever a mistake.
   */
  test('is bookable with no floor — every staff path', () => {
    expect(validateBooking(candidate({ date: TUESDAY, earliestDate: null }), [], HOURS)).toBeNull();
  });

  test('is refused against a floor — the portal', () => {
    expect(validateBooking(candidate({ date: TUESDAY, earliestDate: WEDNESDAY }), [], HOURS)).toBe('errors.pastDate');
  });

  test('an hour of today that has gone is bookable either way', () => {
    // The date is the only granularity either side enforces; neither has ever
    // cared what the clock says within a day it accepts.
    expect(
      validateBooking(candidate({ date: WEDNESDAY, startMinute: 9 * 60, earliestDate: WEDNESDAY }), [], HOURS),
    ).toBeNull();
  });

  test('a closed day is still closed, floor or no floor', () => {
    expect(validateBooking(candidate({ date: FRIDAY, earliestDate: null }), [], HOURS)).toBe('errors.closedDay');
  });
});

describe('rule 3 — within working hours', () => {
  test('uses the selected weekday range instead of the weekly envelope', () => {
    const variableHours: ClinicHours = {
      ...HOURS,
      days: [
        { weekday: 0, isWorking: true, openMinute: 9 * 60, closeMinute: 17 * 60 },
        { weekday: 1, isWorking: true, openMinute: 10 * 60, closeMinute: 14 * 60 },
        { weekday: 2, isWorking: false, openMinute: null, closeMinute: null },
        { weekday: 3, isWorking: true, openMinute: 9 * 60, closeMinute: 17 * 60 },
        { weekday: 4, isWorking: true, openMinute: 9 * 60, closeMinute: 17 * 60 },
        { weekday: 5, isWorking: false, openMinute: null, closeMinute: null },
        { weekday: 6, isWorking: false, openMinute: null, closeMinute: null },
      ],
    };

    expect(validateBooking(candidate({ date: '2026-08-03', startMinute: 9 * 60 }), [], variableHours)).toBe(
      'errors.outsideHours',
    );
    expect(validateBooking(candidate({ date: '2026-08-04', startMinute: 11 * 60 }), [], variableHours)).toBe(
      'errors.closedDay',
    );
  });

  test('accepts an appointment starting exactly at opening time', () => {
    expect(validateBooking(candidate({ startMinute: HOURS.openMinute }), [], HOURS)).toBeNull();
  });

  test('rejects one minute before opening', () => {
    expect(validateBooking(candidate({ startMinute: HOURS.openMinute - 1 }), [], HOURS)).toBe('errors.outsideHours');
  });

  test('accepts an appointment ending exactly at closing time', () => {
    expect(
      validateBooking(candidate({ startMinute: HOURS.closeMinute - 30, durationMinutes: 30 }), [], HOURS),
    ).toBeNull();
  });

  test('rejects an appointment that ends one minute after closing', () => {
    expect(
      validateBooking(candidate({ startMinute: HOURS.closeMinute - 30, durationMinutes: 31 }), [], HOURS),
    ).toBe('errors.outsideHours');
  });

  test('rejects a long appointment that starts inside hours but runs past closing', () => {
    expect(validateBooking(candidate({ startMinute: 17 * 60, durationMinutes: 120 }), [], HOURS)).toBe(
      'errors.outsideHours',
    );
  });

  test('reads opening hours from config', () => {
    const halfDay: ClinicHours = { ...HOURS, openMinute: 9 * 60, closeMinute: 13 * 60 };

    expect(validateBooking(candidate({ startMinute: 8 * 60 }), [], halfDay)).toBe('errors.outsideHours');
    expect(validateBooking(candidate({ startMinute: 12 * 60 + 30 }), [], halfDay)).toBeNull();
  });
});

describe('rule 4 — no overlap', () => {
  const booked = existing(); // 10:00–11:00 with practitioner A

  test('rejects a candidate landing inside an existing appointment', () => {
    expect(validateBooking(candidate({ startMinute: 10 * 60 + 30 }), [booked], HOURS)).toBe('errors.overlap');
  });

  test('rejects a candidate that swallows an existing appointment', () => {
    expect(validateBooking(candidate({ startMinute: 9 * 60, durationMinutes: 180 }), [booked], HOURS)).toBe(
      'errors.overlap',
    );
  });

  test('accepts an appointment ending exactly when the next begins', () => {
    // 09:30–10:00 against 10:00–11:00. Touching edges do not overlap.
    expect(validateBooking(candidate({ startMinute: 9 * 60 + 30, durationMinutes: 30 }), [booked], HOURS)).toBeNull();
  });

  test('accepts an appointment starting exactly when the previous ends', () => {
    // 11:00–11:30 against 10:00–11:00.
    expect(validateBooking(candidate({ startMinute: 11 * 60, durationMinutes: 30 }), [booked], HOURS)).toBeNull();
  });

  test('rejects an overlap of a single minute at each edge', () => {
    expect(validateBooking(candidate({ startMinute: 9 * 60 + 31, durationMinutes: 30 }), [booked], HOURS)).toBe(
      'errors.overlap',
    );
    expect(validateBooking(candidate({ startMinute: 10 * 60 + 59, durationMinutes: 30 }), [booked], HOURS)).toBe(
      'errors.overlap',
    );
  });

  test('overlap is per practitioner — a second practitioner may book the same slot', () => {
    expect(
      validateBooking(candidate({ practitionerId: OTHER_PRACTITIONER, startMinute: 10 * 60 }), [booked], HOURS),
    ).toBeNull();
  });

  test('ignores appointments on other dates', () => {
    expect(validateBooking(candidate({ date: THURSDAY, startMinute: 10 * 60 }), [booked], HOURS)).toBeNull();
  });
});

describe('rule 5 — one booking per client per day', () => {
  const clientsBooking = existing({ id: 'existing-2', clientId: CLIENT, startMinute: 10 * 60, durationMinutes: 60 });

  test('rejects a second appointment for the same client on the same day', () => {
    expect(validateBooking(candidate({ startMinute: 14 * 60 }), [clientsBooking], HOURS)).toBe('errors.clientBooked');
  });

  test('applies across practitioners', () => {
    expect(
      validateBooking(candidate({ practitionerId: OTHER_PRACTITIONER, startMinute: 14 * 60 }), [clientsBooking], HOURS),
    ).toBe('errors.clientBooked');
  });

  test('allows the same client on a different day', () => {
    expect(validateBooking(candidate({ date: THURSDAY, startMinute: 14 * 60 }), [clientsBooking], HOURS)).toBeNull();
  });

  test('is skipped entirely when no client has been chosen yet', () => {
    // The create gesture: a range has been dragged, the picker is not open yet.
    expect(validateBooking(candidate({ clientId: undefined, startMinute: 14 * 60 }), [clientsBooking], HOURS)).toBeNull();
    expect(validateBooking(candidate({ clientId: null, startMinute: 14 * 60 }), [clientsBooking], HOURS)).toBeNull();
  });

  test('still enforces overlap when no client has been chosen', () => {
    expect(validateBooking(candidate({ clientId: null, startMinute: 10 * 60 }), [clientsBooking], HOURS)).toBe(
      'errors.overlap',
    );
  });
});

describe('excludeId — the appointment being edited', () => {
  const self = existing({ id: 'self', clientId: CLIENT, startMinute: 10 * 60, durationMinutes: 60 });

  test('an appointment does not overlap itself when moved onto its own slot', () => {
    expect(
      validateBooking(candidate({ startMinute: 10 * 60, durationMinutes: 60, excludeId: 'self' }), [self], HOURS),
    ).toBeNull();
  });

  test('an appointment does not trip the one-per-day rule against itself', () => {
    expect(validateBooking(candidate({ startMinute: 14 * 60, excludeId: 'self' }), [self], HOURS)).toBeNull();
  });

  test('resizing an appointment over a *different* one is still rejected', () => {
    const neighbour = existing({ id: 'neighbour', practitionerId: PRACTITIONER, startMinute: 11 * 60, durationMinutes: 60 });

    expect(
      validateBooking(
        candidate({ startMinute: 10 * 60, durationMinutes: 120, excludeId: 'self' }),
        [self, neighbour],
        HOURS,
      ),
    ).toBe('errors.overlap');
  });

  test('without the exclusion the same move is rejected — proving the id is what saves it', () => {
    expect(
      validateBooking(candidate({ startMinute: 10 * 60, durationMinutes: 60 }), [self], HOURS),
    ).toBe('errors.overlap');
  });
});

describe('rule order', () => {
  test('duration is judged before the working day', () => {
    // A 5-minute booking on a Friday reports the duration, the first rule listed.
    expect(validateBooking(candidate({ date: FRIDAY, durationMinutes: 5 }), [], HOURS)).toBe('errors.tooShort');
  });

  test('the working day is judged before opening hours', () => {
    expect(validateBooking(candidate({ date: FRIDAY, startMinute: 3 * 60 }), [], HOURS)).toBe('errors.closedDay');
  });

  test('opening hours are judged before overlap', () => {
    const early = existing({ startMinute: 6 * 60, durationMinutes: 60 });
    expect(validateBooking(candidate({ startMinute: 6 * 60 }), [early], HOURS)).toBe('errors.outsideHours');
  });

  test('overlap is judged before the one-per-day rule', () => {
    const clash = existing({ id: 'clash', clientId: CLIENT, startMinute: 9 * 60, durationMinutes: 60 });
    expect(validateBooking(candidate({ startMinute: 9 * 60 }), [clash], HOURS)).toBe('errors.overlap');
  });
});

describe('findClientBooking', () => {
  const booking = existing({ id: 'b1', clientId: CLIENT, startMinute: 10 * 60 });

  test('finds the appointment blocking a client that day', () => {
    expect(findClientBooking(CLIENT, WEDNESDAY, [booking])?.id).toBe('b1');
  });

  test('returns null for a free client', () => {
    expect(findClientBooking(OTHER_CLIENT, WEDNESDAY, [booking])).toBeNull();
  });

  test('returns null on another date', () => {
    expect(findClientBooking(CLIENT, THURSDAY, [booking])).toBeNull();
  });

  test('does not report the appointment being edited as blocking itself', () => {
    expect(findClientBooking(CLIENT, WEDNESDAY, [booking], 'b1')).toBeNull();
  });
});

describe('isWorkingDay', () => {
  test('agrees with the validator', () => {
    expect(isWorkingDay(WEDNESDAY, HOURS)).toBe(true);
    expect(isWorkingDay(FRIDAY, HOURS)).toBe(false);
  });

  test('an invalid date is not a working day', () => {
    expect(isWorkingDay('2026-13-01', HOURS)).toBe(false);
  });
});
