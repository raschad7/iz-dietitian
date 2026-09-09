import { makePlanCatalog, type PlanCatalog, type PlatformPlan } from './plans';

/**
 * A price list for tests, matching what `0059_seed_platform_plans` installs.
 *
 * ## Why this is a module and not a constant in `plans.ts`
 *
 * Because the whole point of the change these packages went through is that
 * there is no longer a list of them in the source. Re-exporting one "for
 * convenience" would put the old constant back with a new name, and the first
 * time somebody imported it from a page the price list would be forked: the
 * table for some screens, this array for others, disagreeing the moment the
 * operator edits a price.
 *
 * So it lives in its own file, named for what it is, and nothing under
 * `src/app` may import it. Tests get a catalogue they can reason about without
 * a database; production gets one from `loadPlanCatalog` and only from there.
 *
 * The values mirror the migration so a test that says "pro costs 24000" is
 * saying something true about a fresh deployment rather than about a fixture.
 */

function plan(over: Partial<PlatformPlan> & Pick<PlatformPlan, 'key'>): PlatformPlan {
  return {
    id: `plan-${over.key}`,
    nameEn: over.key,
    nameAr: over.key,
    monthlyPriceMinor: 0,
    seats: null,
    aiPlansPerMonth: null,
    trialDays: null,
    rank: 0,
    archivedAt: null,
    ...over,
  };
}

/** The four packages a fresh deployment starts with. */
export const SEEDED_PLANS: PlatformPlan[] = [
  plan({ key: 'trial', nameEn: 'Trial', nameAr: 'تجريبي', monthlyPriceMinor: 0, seats: 2, aiPlansPerMonth: 20, trialDays: 14, rank: 0 }),
  plan({ key: 'starter', nameEn: 'Starter', nameAr: 'مبتدئ', monthlyPriceMinor: 12_000, seats: 2, aiPlansPerMonth: 60, rank: 1 }),
  plan({ key: 'pro', nameEn: 'Pro', nameAr: 'احترافي', monthlyPriceMinor: 24_000, seats: 5, aiPlansPerMonth: 200, rank: 2 }),
  plan({ key: 'clinic', nameEn: 'Clinic', nameAr: 'عيادة', monthlyPriceMinor: 48_000, rank: 3 }),
];

/** That list as a catalogue. */
export const TEST_CATALOG: PlanCatalog = makePlanCatalog(SEEDED_PLANS);

/** A catalogue with extra or altered packages, for a test that needs one. */
export function catalogWith(...plans: PlatformPlan[]): PlanCatalog {
  return makePlanCatalog([...SEEDED_PLANS, ...plans]);
}

/** One package, built from partial fields. Re-exported for tests that need a bare plan. */
export { plan as testPlan };
