import { describe, expect, test } from 'bun:test';

import {
  averageRevenueMinor,
  monthlyPriceOf,
  monthlyRecurringMinor,
  overLimits,
  parsePlanPrice,
  planBreakdown,
  planOf,
  trialStateOf,
} from './plans';
import { TEST_CATALOG } from './plans.fixture';

const NOW = new Date('2026-09-05T12:00:00.000Z');

/** A clinic, with only the fields the revenue and trial arithmetic read. */
type TestClinic = {
  plan: string;
  planPriceMinor: number | null;
  suspendedAt: Date | null;
  trialEndsAt: Date | null;
};

function clinic(over: Partial<TestClinic> = {}): TestClinic {
  return {
    plan: 'pro',
    planPriceMinor: null,
    suspendedAt: null,
    trialEndsAt: null,
    ...over,
  };
}

describe('planOf', () => {
  test('finds a known tier', () => {
    expect(planOf(TEST_CATALOG, 'pro').monthlyPriceMinor).toBe(24_000);
  });

  /**
   * `clinics.plan` is a text column, so a value left behind by a renamed tier —
   * or written by a script — is a state this has to survive. A platform screen
   * that 500s because one clinic holds a stale string is worse than one that
   * shows it on the default and lets the operator fix it.
   */
  test('never throws on an unknown or missing key', () => {
    expect(planOf(TEST_CATALOG, 'enterprise').key).toBe('trial');
    expect(planOf(TEST_CATALOG, null).key).toBe('trial');
    expect(planOf(TEST_CATALOG, undefined).key).toBe('trial');
  });
});

describe('monthlyPriceOf', () => {
  test('falls back to the tier when there is no override', () => {
    expect(monthlyPriceOf(TEST_CATALOG, clinic({ plan: 'starter' }))).toBe(12_000);
  });

  test('an override wins', () => {
    expect(monthlyPriceOf(TEST_CATALOG, clinic({ plan: 'pro', planPriceMinor: 9_900 }))).toBe(9_900);
  });

  /**
   * The one that would have been a silent bug. `planPriceMinor ?? listPrice`
   * and `planPriceMinor || listPrice` differ on exactly one value, and it is the
   * one an operator most needs the revenue screen to be honest about: a clinic
   * on a free arrangement would otherwise be billed the list price in every
   * total.
   */
  test('an override of zero is a price, not an absence', () => {
    expect(monthlyPriceOf(TEST_CATALOG, clinic({ plan: 'pro', planPriceMinor: 0 }))).toBe(0);
  });
});

describe('monthlyRecurringMinor', () => {
  test('adds up what each clinic actually pays', () => {
    expect(
      monthlyRecurringMinor(TEST_CATALOG, [clinic({ plan: 'pro' }), clinic({ plan: 'starter' })]),
    ).toBe(36_000);
  });

  /**
   * Counting a practice the platform has switched off would make revenue go up
   * when the service stops working for somebody — the exact wrong direction.
   */
  test('a suspended clinic contributes nothing', () => {
    expect(
      monthlyRecurringMinor(TEST_CATALOG, [clinic({ plan: 'pro', suspendedAt: NOW }), clinic({ plan: 'starter' })]),
    ).toBe(12_000);
  });

  test('a trial contributes nothing, because its price is zero', () => {
    expect(monthlyRecurringMinor(TEST_CATALOG, [clinic({ plan: 'trial' })])).toBe(0);
  });

  /** And if a trial is ever given a price, it counts. One fewer special case. */
  test('a priced trial counts', () => {
    expect(monthlyRecurringMinor(TEST_CATALOG, [clinic({ plan: 'trial', planPriceMinor: 5_000 })])).toBe(5_000);
  });
});

describe('averageRevenueMinor', () => {
  test('divides by the clinics that pay, not by every clinic', () => {
    const rows = [clinic({ plan: 'pro' }), clinic({ plan: 'trial' }), clinic({ plan: 'trial' })];

    expect(averageRevenueMinor(TEST_CATALOG, rows)).toBe(24_000);
  });

  test('is zero rather than NaN when nobody pays', () => {
    expect(averageRevenueMinor(TEST_CATALOG, [clinic({ plan: 'trial' })])).toBe(0);
  });
});

describe('planBreakdown', () => {
  test('keeps tiers with nobody on them', () => {
    const rows = planBreakdown(TEST_CATALOG, [clinic({ plan: 'pro' })]);

    expect(rows).toHaveLength(4);
    const starter = rows.find((row) => row.plan.key === 'starter');

    expect(starter?.clinics).toBe(0);
    expect(starter?.monthlyMinor).toBe(0);
  });

  test('an unknown plan lands on the default tier rather than vanishing', () => {
    const rows = planBreakdown(TEST_CATALOG, [clinic({ plan: 'enterprise' })]);

    expect(rows.find((row) => row.plan.key === 'trial')?.clinics).toBe(1);
  });
});

describe('trialStateOf', () => {
  const trial = (trialEndsAt: Date | null) => clinic({ plan: 'trial', trialEndsAt });

  test('running, ending, expired', () => {
    expect(trialStateOf(TEST_CATALOG, trial(new Date('2026-10-30T00:00:00Z')), NOW)).toBe('running');
    expect(trialStateOf(TEST_CATALOG, trial(new Date('2026-09-09T00:00:00Z')), NOW)).toBe('ending');
    expect(trialStateOf(TEST_CATALOG, trial(new Date('2026-09-01T00:00:00Z')), NOW)).toBe('expired');
  });

  test('no date is no trial', () => {
    expect(trialStateOf(TEST_CATALOG, trial(null), NOW)).toBe('none');
  });

  /**
   * A leftover date on a converted customer is not a deadline. Reporting one
   * would send the operator to have a conversation that already happened.
   */
  test('a paying clinic has no trial, whatever the column says', () => {
    expect(
      trialStateOf(TEST_CATALOG, clinic({ plan: 'pro', trialEndsAt: new Date('2026-01-01T00:00:00Z') }), NOW),
    ).toBe('none');
  });
});

describe('overLimits', () => {
  test('names the dimensions that are over', () => {
    expect(overLimits(planOf(TEST_CATALOG, 'starter'), { staff: 4, aiPlansThisMonth: 10 })).toEqual(['seats']);
    expect(overLimits(planOf(TEST_CATALOG, 'starter'), { staff: 4, aiPlansThisMonth: 99 })).toEqual([
      'seats',
      'ai',
    ]);
  });

  test('at the limit is not over it', () => {
    expect(overLimits(planOf(TEST_CATALOG, 'starter'), { staff: 2, aiPlansThisMonth: 60 })).toEqual([]);
  });

  test('an uncounted dimension is never over', () => {
    expect(overLimits(planOf(TEST_CATALOG, 'clinic'), { staff: 400, aiPlansThisMonth: 9_000 })).toEqual([]);
  });
});

describe('parsePlanPrice', () => {
  test('reads major units into minor', () => {
    expect(parsePlanPrice('240')).toBe(24_000);
    expect(parsePlanPrice('240.5')).toBe(24_050);
    expect(parsePlanPrice('240.50')).toBe(24_050);
    expect(parsePlanPrice('0')).toBe(0);
  });

  test('an empty field is not a price', () => {
    expect(parsePlanPrice('')).toBeNull();
    expect(parsePlanPrice('   ')).toBeNull();
  });

  /**
   * Stricter than the billing keypad on purpose: this is a subscription typed
   * once by one person, not a till. Guessing at "240,50" or "₪240" would be
   * guessing at money.
   */
  test('refuses anything it would have to guess about', () => {
    expect(parsePlanPrice('240,50')).toBeNull();
    expect(parsePlanPrice('₪240')).toBeNull();
    expect(parsePlanPrice('-10')).toBeNull();
    expect(parsePlanPrice('240.567')).toBeNull();
    expect(parsePlanPrice('abc')).toBeNull();
  });
});
