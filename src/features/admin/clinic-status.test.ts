import { describe, expect, test } from 'bun:test';

import { clinicStatusOf } from './components/clinic-status';

/**
 * The three states are derived from two timestamps rather than stored, so this
 * is where the derivation is pinned down. A stored `status` column would be a
 * third thing to keep in step with the two, and the first write that forgot one
 * would leave a clinic labelled one way and behaving another.
 */

const RUNNING = { suspendedAt: null, onboardingCompletedAt: new Date('2026-01-01T00:00:00Z') };

describe('clinicStatusOf', () => {
  test('a set-up clinic that is switched on is active', () => {
    expect(clinicStatusOf(RUNNING)).toBe('active');
  });

  test('a clinic that never finished setting up is onboarding', () => {
    expect(clinicStatusOf({ suspendedAt: null, onboardingCompletedAt: null })).toBe('onboarding');
  });

  test('a switched-off clinic is suspended', () => {
    expect(clinicStatusOf({ ...RUNNING, suspendedAt: new Date('2026-09-05T00:00:00Z') })).toBe('suspended');
  });

  /**
   * The precedence that matters. A half-configured clinic that has ALSO been
   * turned off is turned off — that is the fact explaining why nobody there can
   * sign in, and reporting "onboarding" would send the reader looking for a
   * setup problem that is not the cause.
   */
  test('suspension wins over an unfinished setup', () => {
    expect(
      clinicStatusOf({
        suspendedAt: new Date('2026-09-05T00:00:00Z'),
        onboardingCompletedAt: null,
      }),
    ).toBe('suspended');
  });

  /**
   * `suspended_at` is a timestamp, so anything non-null means suspended. The
   * epoch is the value most likely to be read as falsy by a careless check.
   */
  test('reads the epoch as suspended rather than as no value', () => {
    expect(clinicStatusOf({ ...RUNNING, suspendedAt: new Date(0) })).toBe('suspended');
  });
});
