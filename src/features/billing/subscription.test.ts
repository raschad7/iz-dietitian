import { describe, expect, test } from 'bun:test';

import type { BillEntry } from './bill';
import type { ClinicServiceView } from './services';
import {
  frozenDaysWithin,
  subscriptionCountdown,
  subscriptionCovering,
  subscriptionEnd,
  subscriptionStanding,
  type FreezeRange,
} from './subscription';

/**
 * Where a subscriber stands, tested as arithmetic on their own ledger.
 *
 * No database and no clock: `subscriptionStanding` is handed the rows, the
 * clinic's services and the day, which is what makes "does a term bought on 31
 * January end in February" a question with an answer rather than something to
 * find out in March.
 *
 * The services are a fixture rather than a constant now — how long a term runs
 * is the clinic's answer, one row per service, so a test has to say which clinic
 * it is asking about.
 */

function service(over: Partial<ClinicServiceView> = {}): ClinicServiceView {
  return {
    id: '0f3a9c2e-0000-4000-8000-000000000001',
    key: 'monthly',
    nameAr: 'اشتراك شهر واحد',
    nameEn: 'One month subscription',
    kind: 'subscription',
    durationMonths: 1,
    priceMinor: 27000,
    firstFree: false,
    active: true,
    sortOrder: 0,
    ...over,
  };
}

/** A clinic selling a month, three months, two months, and a visit. */
const SERVICES: ClinicServiceView[] = [
  service(),
  service({ id: 'b', key: 'quarterly', durationMonths: 3, sortOrder: 1 }),
  service({ id: 'c', key: 'twoMonth', durationMonths: 2, sortOrder: 2 }),
  service({
    id: 'd',
    key: 'consultation',
    kind: 'visit',
    durationMonths: null,
    firstFree: true,
    sortOrder: 3,
  }),
];

function charge(over: Partial<BillEntry> = {}): BillEntry {
  return {
    id: '1f3a9c2e-0000-4000-8000-000000000001',
    kind: 'charge',
    occurredOn: '2026-08-10',
    amountMinor: 27000,
    description: null,
    method: null,
    service: 'monthly',
    note: null,
    createdAt: new Date('2026-08-10T09:00:00Z'),
    ...over,
  };
}

describe('subscriptionEnd', () => {
  test('a month runs to the day before the anniversary', () => {
    expect(subscriptionEnd(1, '2026-08-10')).toBe('2026-09-09');
  });

  test('three months is three, not one', () => {
    expect(subscriptionEnd(3, '2026-08-10')).toBe('2026-11-09');
  });

  test('a term the clinic invented is arithmetic like any other', () => {
    expect(subscriptionEnd(2, '2026-08-10')).toBe('2026-10-09');
    expect(subscriptionEnd(12, '2026-08-10')).toBe('2027-08-09');
  });

  test('a month bought on the 31st ends inside the short one', () => {
    expect(subscriptionEnd(1, '2026-01-31')).toBe('2026-02-27');
  });
});

describe('subscriptionEnd — a freeze pushes the end out', () => {
  test('nine paused days add nine days to the term', () => {
    const freezes: FreezeRange[] = [{ startsOn: '2026-08-15', endsOn: '2026-08-23' }];

    expect(subscriptionEnd(1, '2026-08-10', freezes, '2026-08-30')).toBe('2026-09-18');
  });

  test('a freeze outside the term changes nothing', () => {
    const freezes: FreezeRange[] = [{ startsOn: '2026-06-01', endsOn: '2026-06-10' }];

    expect(subscriptionEnd(1, '2026-08-10', freezes, '2026-08-30')).toBe('2026-09-09');
  });

  test('an open freeze runs to today, so the end moves as the days pass', () => {
    const freezes: FreezeRange[] = [{ startsOn: '2026-08-15', endsOn: null }];

    expect(subscriptionEnd(1, '2026-08-10', freezes, '2026-08-20')).toBe('2026-09-15');
    expect(subscriptionEnd(1, '2026-08-10', freezes, '2026-08-25')).toBe('2026-09-20');
  });

  /*
    The circular case, which is the whole reason the arithmetic iterates: the
    second freeze falls *after* the term's original end and only lands inside it
    because the first freeze pushed the end past it.
  */
  test('a freeze pulled inside the term by an earlier one counts too', () => {
    const freezes: FreezeRange[] = [
      { startsOn: '2026-08-15', endsOn: '2026-08-24' },
      { startsOn: '2026-09-12', endsOn: '2026-09-16' },
    ];

    expect(subscriptionEnd(1, '2026-08-10', freezes, '2026-10-01')).toBe('2026-09-24');
  });
});

describe('frozenDaysWithin', () => {
  test('counts both ends of the range', () => {
    expect(frozenDaysWithin([{ startsOn: '2026-08-15', endsOn: '2026-08-23' }], '2026-08-01', '2026-08-31', '2026-08-31')).toBe(9);
  });

  test('clips a freeze that starts before the window', () => {
    expect(frozenDaysWithin([{ startsOn: '2026-07-28', endsOn: '2026-08-02' }], '2026-08-01', '2026-08-31', '2026-08-31')).toBe(2);
  });

  test('two overlapping freezes give the same day back once', () => {
    const freezes: FreezeRange[] = [
      { startsOn: '2026-08-10', endsOn: '2026-08-14' },
      { startsOn: '2026-08-12', endsOn: '2026-08-16' },
    ];

    expect(frozenDaysWithin(freezes, '2026-08-01', '2026-08-31', '2026-08-31')).toBe(7);
  });

  test('a freeze entirely outside the window is nothing', () => {
    expect(frozenDaysWithin([{ startsOn: '2026-09-01', endsOn: '2026-09-09' }], '2026-08-01', '2026-08-31', '2026-08-31')).toBe(0);
  });
});

describe('subscriptionStanding', () => {
  test('no subscription charge at all is `none`, not an expired term', () => {
    const standing = subscriptionStanding([charge({ service: 'consultation' })], SERVICES, '2026-08-24');

    expect(standing.state).toBe('none');
  });

  test('a ledger of payments alone is `none`', () => {
    expect(
      subscriptionStanding([charge({ kind: 'payment', service: null })], SERVICES, '2026-08-24').state,
    ).toBe('none');
  });

  test('a charge naming a service this clinic does not have is `none`', () => {
    expect(subscriptionStanding([charge({ service: 'yearly' })], SERVICES, '2026-08-24').state).toBe(
      'none',
    );
  });

  test('today inside the term is active, and carries the day it runs out', () => {
    const standing = subscriptionStanding([charge()], SERVICES, '2026-08-24');

    expect(standing).toMatchObject({
      state: 'active',
      startedOn: '2026-08-10',
      endsOn: '2026-09-09',
      frozenDays: 0,
    });
  });

  test('the term is the clinic’s own, so a two-month one runs two months', () => {
    expect(subscriptionStanding([charge({ service: 'twoMonth' })], SERVICES, '2026-08-24')).toMatchObject({
      endsOn: '2026-10-09',
    });
  });

  test('the last day of the term is still inside it', () => {
    expect(subscriptionStanding([charge()], SERVICES, '2026-09-09').state).toBe('active');
  });

  test('the day after is not', () => {
    expect(subscriptionStanding([charge()], SERVICES, '2026-09-10').state).toBe('expired');
  });

  test('the newest term wins, however the rows are ordered', () => {
    const standing = subscriptionStanding(
      [
        charge({ id: 'a', service: 'quarterly', occurredOn: '2026-08-10' }),
        charge({ id: 'b', service: 'monthly', occurredOn: '2026-09-01' }),
      ],
      SERVICES,
      '2026-09-05',
    );

    expect(standing).toMatchObject({ startedOn: '2026-09-01' });
  });

  test('a renewal recorded on the same day as the term it renews is told apart by when it was typed', () => {
    const standing = subscriptionStanding(
      [
        charge({
          id: 'a',
          service: 'monthly',
          occurredOn: '2026-08-10',
          createdAt: new Date('2026-08-10T09:00:00Z'),
        }),
        charge({
          id: 'b',
          service: 'quarterly',
          occurredOn: '2026-08-10',
          createdAt: new Date('2026-08-10T17:00:00Z'),
        }),
      ],
      SERVICES,
      '2026-08-24',
    );

    expect(standing).toMatchObject({ service: { key: 'quarterly' } });
  });

  test('an expired term keeps its dates — the column says how long they have been off it', () => {
    expect(subscriptionStanding([charge()], SERVICES, '2026-12-01')).toMatchObject({
      state: 'expired',
      startedOn: '2026-08-10',
      endsOn: '2026-09-09',
    });
  });

  test('a term bought ahead of its start reads active', () => {
    expect(
      subscriptionStanding([charge({ occurredOn: '2026-09-01' })], SERVICES, '2026-08-24').state,
    ).toBe('active');
  });

  test('a subscriber paused today reads frozen, and the term end has moved', () => {
    const freezes: FreezeRange[] = [{ startsOn: '2026-08-15', endsOn: null }];
    const standing = subscriptionStanding([charge()], SERVICES, '2026-08-20', freezes);

    expect(standing).toMatchObject({ state: 'frozen', endsOn: '2026-09-15', frozenDays: 6 });
  });

  test('once the freeze has ended the term is running again, later than it was', () => {
    const freezes: FreezeRange[] = [{ startsOn: '2026-08-15', endsOn: '2026-08-23' }];
    const standing = subscriptionStanding([charge()], SERVICES, '2026-09-12', freezes);

    expect(standing).toMatchObject({ state: 'active', endsOn: '2026-09-18', frozenDays: 9 });
  });

  test('a freeze can keep a term alive past the day it would otherwise have ended', () => {
    const freezes: FreezeRange[] = [{ startsOn: '2026-08-15', endsOn: '2026-08-23' }];

    expect(subscriptionStanding([charge()], SERVICES, '2026-09-12', []).state).toBe('expired');
    expect(subscriptionStanding([charge()], SERVICES, '2026-09-12', freezes).state).toBe('active');
  });
});

describe('subscriptionCovering — one subscription at a time', () => {
  const month = [{ service: 'monthly', occurredOn: '2026-08-10' }];

  test('a day inside the term is covered, and names the term in the way', () => {
    expect(subscriptionCovering(month, SERVICES, '2026-08-24')).toMatchObject({
      service: { key: 'monthly' },
      startedOn: '2026-08-10',
      endsOn: '2026-09-09',
    });
  });

  test('the first and last days of the term are inside it', () => {
    expect(subscriptionCovering(month, SERVICES, '2026-08-10')).not.toBeNull();
    expect(subscriptionCovering(month, SERVICES, '2026-09-09')).not.toBeNull();
  });

  test('the day after the term ends is free — the next one starts there', () => {
    expect(subscriptionCovering(month, SERVICES, '2026-09-10')).toBeNull();
  });

  test('a day before the term started is not covered by it', () => {
    expect(subscriptionCovering(month, SERVICES, '2026-08-09')).toBeNull();
  });

  test('a consultation covers nothing — a visit is not a term', () => {
    expect(
      subscriptionCovering([{ service: 'consultation', occurredOn: '2026-08-10' }], SERVICES, '2026-08-11'),
    ).toBeNull();
  });

  test('a freehand charge with no service covers nothing', () => {
    expect(
      subscriptionCovering([{ service: null, occurredOn: '2026-08-10' }], SERVICES, '2026-08-11'),
    ).toBeNull();
  });

  test('an older term still blocks a back-dated charge, whatever the newest one says', () => {
    const sold = [
      { service: 'monthly', occurredOn: '2026-01-05' },
      { service: 'monthly', occurredOn: '2026-08-10' },
    ];

    expect(subscriptionCovering(sold, SERVICES, '2026-01-20')).toMatchObject({
      startedOn: '2026-01-05',
    });
  });

  test('a quarter covers three months of them', () => {
    const quarter = [{ service: 'quarterly', occurredOn: '2026-08-10' }];

    expect(subscriptionCovering(quarter, SERVICES, '2026-11-09')).not.toBeNull();
    expect(subscriptionCovering(quarter, SERVICES, '2026-11-10')).toBeNull();
  });

  /*
    The rule that matters most about a frozen term: the days it gained are days
    the subscriber has already paid for, so a second subscription cannot be sold
    across them.
  */
  test('a frozen term still blocks the next one over the days it gained', () => {
    const freezes: FreezeRange[] = [{ startsOn: '2026-08-15', endsOn: '2026-08-23' }];

    expect(subscriptionCovering(month, SERVICES, '2026-09-15', [], '2026-09-15')).toBeNull();
    expect(subscriptionCovering(month, SERVICES, '2026-09-15', freezes, '2026-09-15')).not.toBeNull();
  });
});

describe('subscriptionCountdown — days, which is what the column says', () => {
  const term = {
    state: 'active',
    service: service(),
    startedOn: '2026-08-10',
    endsOn: '2026-09-09',
    frozenDays: 0,
  } as const;

  test('counts the days left inclusively', () => {
    expect(subscriptionCountdown(term, '2026-08-20')).toEqual({ kind: 'remaining', days: 21 });
  });

  test('the last day of the term has one day left, not none', () => {
    expect(subscriptionCountdown(term, '2026-09-09')).toEqual({ kind: 'remaining', days: 1 });
  });

  test('the day after it ends is finished, one day ago', () => {
    expect(subscriptionCountdown({ ...term, state: 'expired' }, '2026-09-10')).toEqual({
      kind: 'finished',
      days: 1,
    });
  });

  test('a term three days gone says three', () => {
    expect(subscriptionCountdown({ ...term, state: 'expired' }, '2026-09-12')).toEqual({
      kind: 'finished',
      days: 3,
    });
  });

  test('counts across a month boundary without a timezone in sight', () => {
    expect(subscriptionCountdown(term, '2026-08-31')).toEqual({ kind: 'remaining', days: 10 });
  });
});
