import { describe, expect, test } from 'bun:test';

import { type HealthSignal } from './health';
import { summariseStanding, type StandingSubject } from './overview-summary';
import { TEST_CATALOG } from './plans.fixture';

const NOW = new Date('2026-09-09T12:00:00Z');

/** A live, paying, activated, healthy clinic — each test states only its difference. */
function clinic(over: Partial<StandingSubject> = {}): StandingSubject {
  return {
    plan: 'pro',
    planPriceMinor: null,
    suspendedAt: null,
    trialEndsAt: null,
    plans: 4,
    health: { band: 'healthy', signals: [] },
    ...over,
  };
}

const signal = (key: HealthSignal['key']): HealthSignal => ({ key, severity: 'warning' });

describe('summariseStanding', () => {
  test('counts recurring revenue from the tier when no price is overridden', () => {
    // `pro` is 24000 minor in PLATFORM_PLANS.
    const standing = summariseStanding(TEST_CATALOG, [clinic(), clinic()], NOW);

    expect(standing.monthlyMinor).toBe(48_000);
    expect(standing.payingClinics).toBe(2);
  });

  test('a negotiated price wins over the tier, including a free one', () => {
    const standing = summariseStanding(TEST_CATALOG, 
      [clinic({ planPriceMinor: 10_000 }), clinic({ planPriceMinor: 0 })],
      NOW,
    );

    expect(standing.monthlyMinor).toBe(10_000);
    // The clinic on zero is served but is not paying.
    expect(standing.payingClinics).toBe(1);
  });

  test('a suspended clinic is not revenue, not activated and not at risk', () => {
    const standing = summariseStanding(TEST_CATALOG, 
      [clinic({ suspendedAt: new Date('2026-09-01T00:00:00Z'), health: { band: 'dormant', signals: [] } })],
      NOW,
    );

    expect(standing.monthlyMinor).toBe(0);
    expect(standing.liveClinics).toBe(0);
    expect(standing.activatedClinics).toBe(0);
    expect(standing.atRiskClinics).toBe(0);
    expect(standing.atRiskMinor).toBe(0);
  });

  describe('trials', () => {
    const trial = (endsAt: string) =>
      clinic({ plan: 'trial', trialEndsAt: new Date(endsAt), plans: 0 });

    test('splits by how close the end is', () => {
      const standing = summariseStanding(TEST_CATALOG, 
        [
          trial('2026-10-30T00:00:00Z'), // weeks away
          trial('2026-09-12T00:00:00Z'), // inside the ending window
          trial('2026-09-01T00:00:00Z'), // gone
        ],
        NOW,
      );

      expect(standing.trialsRunning).toBe(1);
      expect(standing.trialsEnding).toBe(1);
      expect(standing.trialsExpired).toBe(1);
    });

    test('a trial contributes no revenue', () => {
      expect(summariseStanding(TEST_CATALOG, [trial('2026-10-30T00:00:00Z')], NOW).monthlyMinor).toBe(0);
    });

    /* A leftover date on a clinic that already converted is not a deadline —
       reporting one sends the operator to a conversation that already happened. */
    test('a paying clinic with a stale trial date is not counted as a trial', () => {
      const standing = summariseStanding(TEST_CATALOG, 
        [clinic({ trialEndsAt: new Date('2026-09-10T00:00:00Z') })],
        NOW,
      );

      expect(standing.trialsEnding).toBe(0);
      expect(standing.trialsRunning).toBe(0);
    });
  });

  describe('revenue at risk', () => {
    test('sums what the failing clinics actually pay, not how many there are', () => {
      const standing = summariseStanding(TEST_CATALOG, 
        [
          clinic({ health: { band: 'at-risk', signals: [] }, planPriceMinor: 30_000 }),
          clinic({ health: { band: 'dormant', signals: [] }, planPriceMinor: 5_000 }),
          clinic({ health: { band: 'healthy', signals: [] }, planPriceMinor: 99_000 }),
        ],
        NOW,
      );

      expect(standing.atRiskClinics).toBe(2);
      expect(standing.atRiskMinor).toBe(35_000);
    });

    test('watch and new are not at risk', () => {
      const standing = summariseStanding(TEST_CATALOG, 
        [clinic({ health: { band: 'watch', signals: [] } }), clinic({ health: { band: 'new', signals: [] } })],
        NOW,
      );

      expect(standing.atRiskClinics).toBe(0);
    });
  });

  test('activation counts clinics that have written a plan, not clinics that signed up', () => {
    const standing = summariseStanding(TEST_CATALOG, [clinic({ plans: 0 }), clinic({ plans: 1 })], NOW);

    expect(standing.liveClinics).toBe(2);
    expect(standing.activatedClinics).toBe(1);
  });

  test('over-limit reads the health signals rather than recomputing the tiers', () => {
    const standing = summariseStanding(TEST_CATALOG, 
      [
        clinic({ health: { band: 'healthy', signals: [signal('overSeats')] } }),
        clinic({ health: { band: 'healthy', signals: [signal('overAi')] } }),
        clinic({ health: { band: 'healthy', signals: [signal('quiet')] } }),
      ],
      NOW,
    );

    expect(standing.overLimitClinics).toBe(2);
  });

  test('an empty platform is all zeroes rather than a crash', () => {
    const standing = summariseStanding(TEST_CATALOG, [], NOW);

    expect(standing.monthlyMinor).toBe(0);
    expect(standing.liveClinics).toBe(0);
    expect(standing.atRiskMinor).toBe(0);
  });
});
