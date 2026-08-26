import { describe, expect, test } from 'bun:test';

import type { BillEntry } from './bill';
import {
  subscriptionCountdown,
  subscriptionCovering,
  subscriptionEnd,
  subscriptionStanding,
} from './subscription';

/**
 * Where a subscriber stands, tested as arithmetic on their own ledger.
 *
 * No database and no clock: `subscriptionStanding` is handed the rows and the
 * day, which is what makes "does a term bought on 31 January end in February"
 * a question with an answer rather than something to find out in March.
 */

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
    expect(subscriptionEnd('monthly', '2026-08-10')).toBe('2026-09-09');
  });

  test('three months is three, not one', () => {
    expect(subscriptionEnd('quarterly', '2026-08-10')).toBe('2026-11-09');
  });

  test('a month bought on the 31st ends inside the short one', () => {
    expect(subscriptionEnd('monthly', '2026-01-31')).toBe('2026-02-27');
  });
});

describe('subscriptionStanding', () => {
  test('no subscription charge at all is `none`, not an expired term', () => {
    const standing = subscriptionStanding([charge({ service: 'consultation' })], '2026-08-24');

    expect(standing.state).toBe('none');
  });

  test('a ledger of payments alone is `none`', () => {
    expect(
      subscriptionStanding([charge({ kind: 'payment', service: null })], '2026-08-24').state,
    ).toBe('none');
  });

  test('today inside the term is active, and carries the day it runs out', () => {
    const standing = subscriptionStanding([charge()], '2026-08-24');

    expect(standing).toEqual({
      state: 'active',
      service: 'monthly',
      startedOn: '2026-08-10',
      endsOn: '2026-09-09',
    });
  });

  test('the last day of the term is still inside it', () => {
    expect(subscriptionStanding([charge()], '2026-09-09').state).toBe('active');
  });

  test('the day after is not', () => {
    expect(subscriptionStanding([charge()], '2026-09-10').state).toBe('expired');
  });

  test('the newest term wins, however the rows are ordered', () => {
    const standing = subscriptionStanding(
      [
        charge({ id: 'a', service: 'quarterly', occurredOn: '2026-08-10' }),
        charge({ id: 'b', service: 'monthly', occurredOn: '2026-09-01' }),
      ],
      '2026-09-05',
    );

    expect(standing).toMatchObject({ service: 'monthly', startedOn: '2026-09-01' });
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
      '2026-08-24',
    );

    expect(standing).toMatchObject({ service: 'quarterly' });
  });

  test('an expired term keeps its dates — the column says how long they have been off it', () => {
    expect(subscriptionStanding([charge()], '2026-12-01')).toEqual({
      state: 'expired',
      service: 'monthly',
      startedOn: '2026-08-10',
      endsOn: '2026-09-09',
    });
  });

  test('a term bought ahead of its start reads active', () => {
    expect(subscriptionStanding([charge({ occurredOn: '2026-09-01' })], '2026-08-24').state).toBe(
      'active',
    );
  });
});
describe('subscriptionCovering — one subscription at a time', () => {
  const month = [{ service: 'monthly', occurredOn: '2026-08-10' }];

  test('a day inside the term is covered, and names the term in the way', () => {
    expect(subscriptionCovering(month, '2026-08-24')).toEqual({
      service: 'monthly',
      startedOn: '2026-08-10',
      endsOn: '2026-09-09',
    });
  });

  test('the first and last days of the term are inside it', () => {
    expect(subscriptionCovering(month, '2026-08-10')).not.toBeNull();
    expect(subscriptionCovering(month, '2026-09-09')).not.toBeNull();
  });

  test('the day after the term ends is free — the next one starts there', () => {
    expect(subscriptionCovering(month, '2026-09-10')).toBeNull();
  });

  test('a day before the term started is not covered by it', () => {
    expect(subscriptionCovering(month, '2026-08-09')).toBeNull();
  });

  test('a consultation covers nothing — a visit is not a term', () => {
    expect(subscriptionCovering([{ service: 'consultation', occurredOn: '2026-08-10' }], '2026-08-11')).toBeNull();
  });

  test('a freehand charge with no service covers nothing', () => {
    expect(subscriptionCovering([{ service: null, occurredOn: '2026-08-10' }], '2026-08-11')).toBeNull();
  });

  test('an older term still blocks a back-dated charge, whatever the newest one says', () => {
    const sold = [
      { service: 'monthly', occurredOn: '2026-01-05' },
      { service: 'monthly', occurredOn: '2026-08-10' },
    ];

    expect(subscriptionCovering(sold, '2026-01-20')).toMatchObject({ startedOn: '2026-01-05' });
  });

  test('a quarter covers three months of them', () => {
    const quarter = [{ service: 'quarterly', occurredOn: '2026-08-10' }];

    expect(subscriptionCovering(quarter, '2026-11-09')).not.toBeNull();
    expect(subscriptionCovering(quarter, '2026-11-10')).toBeNull();
  });
});
describe('subscriptionCountdown — days, which is what the column says', () => {
  const term = { state: 'active', service: 'monthly', startedOn: '2026-08-10', endsOn: '2026-09-09' } as const;

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
