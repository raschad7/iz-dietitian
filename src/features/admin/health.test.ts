import { describe, expect, test } from 'bun:test';

import {
  assessClinic,
  healthRank,
  isConversionCandidate,
  lastActivityAt,
  needsAttention,
  type ClinicActivity,
  type HealthSubject,
} from './health';

const NOW = new Date('2026-09-05T12:00:00.000Z');
const LIMITS = { seats: 2, aiPlansPerMonth: 60 };

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

function subject(over: Partial<HealthSubject> = {}): HealthSubject {
  return {
    plan: 'pro',
    planPriceMinor: null,
    trialEndsAt: null,
    suspendedAt: null,
    onboardingCompletedAt: daysAgo(80),
    createdAt: daysAgo(90),
    ...over,
  };
}

function activity(over: Partial<ClinicActivity> = {}): ClinicActivity {
  return {
    lastPlanAt: daysAgo(2),
    lastClientAt: daysAgo(10),
    lastSignInAt: daysAgo(1),
    plansRecent: 8,
    plansPrevious: 7,
    staff: 1,
    clients: 12,
    aiPlansThisMonth: 9,
    ...over,
  };
}

function assess(clinic = subject(), acts = activity()) {
  return assessClinic(clinic, acts, LIMITS, NOW);
}

describe('lastActivityAt', () => {
  test('takes the newest of the three', () => {
    expect(
      lastActivityAt(activity({ lastPlanAt: daysAgo(9), lastClientAt: daysAgo(3), lastSignInAt: daysAgo(20) })),
    ).toEqual(daysAgo(3));
  });

  test('is null when nothing has ever happened', () => {
    expect(
      lastActivityAt(activity({ lastPlanAt: null, lastClientAt: null, lastSignInAt: null })),
    ).toBeNull();
  });
});

describe('bands', () => {
  test('a working practice is healthy', () => {
    expect(assess().band).toBe('healthy');
  });

  /**
   * The rule that stops the queue filling with good news. A clinic three days
   * old has no plans, no patients and nothing to slow down from — judged by the
   * same rules as a year-old practice it is the sickest thing on the registry,
   * which would train the operator to ignore the list.
   */
  test('a clinic in its first fortnight is "new", not broken', () => {
    const health = assessClinic(
      subject({ createdAt: daysAgo(3), onboardingCompletedAt: null }),
      activity({ lastPlanAt: null, lastClientAt: null, plansRecent: 0, plansPrevious: 0, clients: 0 }),
      LIMITS,
      NOW,
    );

    expect(health.band).toBe('new');
  });

  test('but a new clinic nobody can sign in to is still at risk', () => {
    const health = assessClinic(
      subject({ createdAt: daysAgo(3) }),
      activity({ staff: 0 }),
      LIMITS,
      NOW,
    );

    expect(health.band).toBe('at-risk');
  });

  test('nothing for 45 days is dormant', () => {
    expect(
      assess(subject(), activity({ lastPlanAt: daysAgo(60), lastClientAt: daysAgo(70), lastSignInAt: daysAgo(50) }))
        .band,
    ).toBe('dormant');
  });

  test('never active at all is dormant', () => {
    expect(
      assess(subject(), activity({ lastPlanAt: null, lastClientAt: null, lastSignInAt: null })).band,
    ).toBe('dormant');
  });

  /**
   * A suspended clinic is quiet because the platform turned it off. Reporting
   * the consequence of the operator's own action as a health problem is how a
   * registry fills with noise — so the band is dormant and the *signal* names
   * the real cause.
   */
  test('a suspended clinic is dormant and says why', () => {
    const health = assess(subject({ suspendedAt: daysAgo(4) }));

    expect(health.band).toBe('dormant');
    expect(health.signals[0]).toMatchObject({ key: 'suspended', days: 4 });
  });

  test('one warning is a watch, two is at-risk', () => {
    const oneWarning = assess(subject(), activity({ lastPlanAt: daysAgo(20), lastSignInAt: daysAgo(20), lastClientAt: daysAgo(20) }));
    expect(oneWarning.band).toBe('watch');

    const twoWarnings = assess(
      subject(),
      activity({
        lastPlanAt: daysAgo(20),
        lastSignInAt: daysAgo(20),
        lastClientAt: daysAgo(20),
        plansRecent: 1,
        plansPrevious: 9,
      }),
    );
    expect(twoWarnings.band).toBe('at-risk');
  });
});

describe('signals', () => {
  test('a real slowdown is reported with both figures', () => {
    const health = assess(subject(), activity({ plansRecent: 2, plansPrevious: 10 }));

    expect(health.signals).toContainEqual({ key: 'slowing', severity: 'warning', count: 2, limit: 10 });
  });

  /**
   * Dropping from one plan to zero is not a trend, and a clinic that wrote
   * nothing in either period is already reported as quiet — saying "slowing"
   * as well would be the same fact under two names.
   */
  test('a drop from almost nothing is not a slowdown', () => {
    expect(
      assess(subject(), activity({ plansRecent: 0, plansPrevious: 1 })).signals.map((s) => s.key),
    ).not.toContain('slowing');
  });

  test('setup left unfinished past a week is called out', () => {
    const health = assess(subject({ onboardingCompletedAt: null }));

    expect(health.signals.map((signal) => signal.key)).toContain('onboardingStalled');
  });

  test('an expired trial is critical, an ending one is a warning', () => {
    const expired = assess(subject({ plan: 'trial', trialEndsAt: daysAgo(3) }));
    expect(expired.signals.find((s) => s.key === 'trialExpired')?.severity).toBe('critical');

    const ending = assess(
      subject({ plan: 'trial', trialEndsAt: new Date(NOW.getTime() + 3 * 86_400_000) }),
    );
    expect(ending.signals.find((s) => s.key === 'trialEnding')).toMatchObject({
      severity: 'warning',
      days: 3,
    });
  });

  test('over its seat count is information, not an alarm', () => {
    const health = assess(subject(), activity({ staff: 5 }));

    expect(health.signals).toContainEqual({ key: 'overSeats', severity: 'info', count: 5, limit: 2 });
    // Info does not move the band: being over a limit is a sales conversation,
    // not a clinic in trouble.
    expect(health.band).toBe('healthy');
  });
});

describe('needsAttention', () => {
  test('dormant and at-risk qualify; watch and new do not', () => {
    expect(needsAttention(subject(), { ...assess(), band: 'dormant' })).toBe(true);
    expect(needsAttention(subject(), { ...assess(), band: 'at-risk' })).toBe(true);
    expect(needsAttention(subject(), { ...assess(), band: 'watch' })).toBe(false);
    expect(needsAttention(subject(), { ...assess(), band: 'new' })).toBe(false);
  });

  /** The operator suspended it. It is not news. */
  test('a suspended clinic is never in the queue', () => {
    const clinic = subject({ suspendedAt: daysAgo(2) });

    expect(needsAttention(clinic, assess(clinic))).toBe(false);
  });
});

describe('isConversionCandidate', () => {
  test('a healthy free clinic doing real work is worth a call', () => {
    const clinic = subject({ plan: 'trial' });
    const acts = activity();

    expect(isConversionCandidate(clinic, acts, assess(clinic, acts))).toBe(true);
  });

  test('a paying clinic is not a candidate', () => {
    const clinic = subject({ plan: 'pro' });
    const acts = activity();

    expect(isConversionCandidate(clinic, acts, assess(clinic, acts))).toBe(false);
  });

  test('an empty free clinic is not a candidate either', () => {
    const clinic = subject({ plan: 'trial' });
    const acts = activity({ clients: 0, plansRecent: 0 });

    expect(isConversionCandidate(clinic, acts, assess(clinic, acts))).toBe(false);
  });
});

describe('healthRank', () => {
  test('orders worst first, so a registry can sort by who needs you', () => {
    expect(healthRank('dormant')).toBeLessThan(healthRank('at-risk'));
    expect(healthRank('at-risk')).toBeLessThan(healthRank('watch'));
    expect(healthRank('watch')).toBeLessThan(healthRank('healthy'));
  });
});
