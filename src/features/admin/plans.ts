/**
 * What the platform sells, and what each clinic is worth per month.
 *
 * ## This is a price list in code, not a table
 *
 * Adding a tier is a line here plus a pair of strings in the message catalogue,
 * and it should never be a migration. `clinics.plan` stores the key as text and
 * this list is what validates it.
 *
 * ⚠ **A clinic's own service list took the opposite decision, deliberately.**
 * `BILLING_SERVICES` used to be exactly this shape one layer down, and it broke
 * the day a practice wanted to sell a two-month subscription — see
 * `clinic_services`. The difference is who owns the list: what a *clinic*
 * charges its patients is the clinic's to change, and what the *platform*
 * charges its clinics is decided by whoever runs the deployment, who is also
 * the person who ships a release.
 *
 * ## A clinic's price is not necessarily its tier's price
 *
 * `clinics.plan_price_minor` overrides the list price when it is set, which is
 * the ordinary shape of a real deployment — a first customer on a handshake, a
 * pilot at zero, a practice that negotiated. Every figure on the revenue screen
 * comes from `monthlyPriceOf`, never from the tier alone, so a discount is
 * visible in the total rather than hidden behind a label.
 *
 * ## Nothing here is enforced
 *
 * The `seats` and `aiPlansPerMonth` numbers are what the tier is *sold* as.
 * They gate nothing: a clinic over its seat count keeps working and shows up on
 * the platform screen as over its limit. Enforcement is a product decision with
 * a refund policy and a dunning email attached, and inventing it inside an
 * admin panel would mean a clinic losing access to its patients' records
 * because a number in this file was wrong. The panel's job is to show the
 * operator where the conversation is needed.
 */

/** Minor units per major, restated rather than imported: see `money.ts`. */
const MINOR_PER_MAJOR = 100;

export type PlanKey = 'trial' | 'starter' | 'pro' | 'clinic';

export type PlatformPlan = {
  key: PlanKey;
  /** List price per month in minor units — agorot, like every amount in the app. */
  monthlyPriceMinor: number;
  /** Staff accounts the tier is sold with. `null` means uncounted. */
  seats: number | null;
  /** AI plan generations per calendar month the tier is sold with. `null` means uncounted. */
  aiPlansPerMonth: number | null;
  /** Ordered low to high, for sorting and for the ramp the charts colour by. */
  rank: number;
};

/**
 * The tiers, cheapest first.
 *
 * `trial` is a real tier and not an absence: it is what a clinic is on the day
 * it signs up, it has a price of zero, and it is the row the trial-expiry
 * column belongs to. Treating "not paying yet" as a missing plan is how a
 * pipeline becomes invisible.
 */
export const PLATFORM_PLANS = [
  { key: 'trial', monthlyPriceMinor: 0, seats: 2, aiPlansPerMonth: 20, rank: 0 },
  { key: 'starter', monthlyPriceMinor: 12_000, seats: 2, aiPlansPerMonth: 60, rank: 1 },
  { key: 'pro', monthlyPriceMinor: 24_000, seats: 5, aiPlansPerMonth: 200, rank: 2 },
  { key: 'clinic', monthlyPriceMinor: 48_000, seats: null, aiPlansPerMonth: null, rank: 3 },
] as const satisfies readonly PlatformPlan[];

export const PLAN_KEYS = PLATFORM_PLANS.map((plan) => plan.key);

const BY_KEY = new Map<string, PlatformPlan>(PLATFORM_PLANS.map((plan) => [plan.key, plan]));

/** The default every clinic starts on, and the fallback for an unknown key. */
export const DEFAULT_PLAN = PLATFORM_PLANS[0];

/**
 * The tier a key names, or the default when it names nothing.
 *
 * Never throws. `clinics.plan` is text, so a value written by a script or left
 * behind by a renamed tier is a state this function has to survive — and a
 * platform screen that 500s because one clinic holds a stale string is worse
 * than one that shows it on the default and lets the operator fix it.
 */
export function planOf(key: string | null | undefined): PlatformPlan {
  return BY_KEY.get(key ?? '') ?? DEFAULT_PLAN;
}

/** Whether a key is one this build knows about — for flagging drift, not for control flow. */
export function isKnownPlan(key: string | null | undefined): boolean {
  return BY_KEY.has(key ?? '');
}

/**
 * What one clinic pays a month, in minor units.
 *
 * The override wins whenever it is set, **including when it is zero** — which
 * is why the check is `!= null` and not truthiness. A clinic on a free
 * arrangement is exactly the case an operator needs the revenue screen to be
 * honest about, and `0 || listPrice` would silently bill them the list.
 */
export function monthlyPriceOf(clinic: { plan: string; planPriceMinor: number | null }): number {
  return clinic.planPriceMinor ?? planOf(clinic.plan).monthlyPriceMinor;
}

/**
 * Monthly recurring revenue across a set of clinics, in minor units.
 *
 * ## What is deliberately excluded
 *
 * **A suspended clinic contributes nothing.** It is not being served, so
 * counting it as revenue would make the number go up when the platform stops
 * working for someone — the exact wrong direction.
 *
 * **A trial contributes nothing**, because its price is zero, not because the
 * tier is special-cased. If a trial is ever given a price it will count, which
 * is the correct behaviour and one fewer rule to remember.
 *
 * Integer arithmetic throughout. See the header of `src/db/schema/billing.ts`
 * for why money never touches a float in this codebase.
 */
export function monthlyRecurringMinor(
  clinics: readonly { plan: string; planPriceMinor: number | null; suspendedAt: Date | null }[],
): number {
  return clinics.reduce(
    (total, clinic) => (clinic.suspendedAt ? total : total + monthlyPriceOf(clinic)),
    0,
  );
}

/** Annual run rate — twelve times the monthly figure, and nothing cleverer. */
export function annualRunRateMinor(monthlyMinor: number): number {
  return monthlyMinor * 12;
}

/** Average revenue per paying clinic, in minor units. Zero when none pay. */
export function averageRevenueMinor(
  clinics: readonly { plan: string; planPriceMinor: number | null; suspendedAt: Date | null }[],
): number {
  const paying = clinics.filter((clinic) => !clinic.suspendedAt && monthlyPriceOf(clinic) > 0);
  if (paying.length === 0) return 0;

  return Math.round(monthlyRecurringMinor(paying) / paying.length);
}

/** How many clinics sit on each tier, in list order. Tiers with none are kept. */
export function planBreakdown(
  clinics: readonly { plan: string; planPriceMinor: number | null; suspendedAt: Date | null }[],
): { key: PlanKey; clinics: number; monthlyMinor: number }[] {
  return PLATFORM_PLANS.map((plan) => {
    const held = clinics.filter((clinic) => planOf(clinic.plan).key === plan.key);

    return {
      key: plan.key,
      clinics: held.length,
      monthlyMinor: monthlyRecurringMinor(held),
    };
  });
}

/** A trial state the screen has a word for. */
export type TrialState = 'none' | 'running' | 'ending' | 'expired';

/**
 * Where a clinic's trial stands.
 *
 * `ending` is the one that earns its place: a trial with a week left is the
 * only row on the registry that is *about to* need a decision, and a screen
 * that cannot tell it from one with a month left cannot be used to plan a week.
 *
 * A clinic on a paid tier is `none` regardless of what `trialEndsAt` holds — a
 * leftover date on a converted customer is not a deadline, and reporting one
 * would send the operator to have a conversation that already happened.
 */
export function trialStateOf(
  clinic: { plan: string; planPriceMinor: number | null; trialEndsAt: Date | null },
  now: Date,
): TrialState {
  if (monthlyPriceOf(clinic) > 0) return 'none';
  if (!clinic.trialEndsAt) return 'none';

  const daysLeft = (clinic.trialEndsAt.getTime() - now.getTime()) / 86_400_000;

  if (daysLeft < 0) return 'expired';
  if (daysLeft <= TRIAL_ENDING_DAYS) return 'ending';

  return 'running';
}

/** How close to its end a trial has to be before the registry calls it out. */
export const TRIAL_ENDING_DAYS = 7;

/**
 * Whether a clinic is past what its tier was sold with.
 *
 * Returns the dimensions that are over, so the screen can name them rather than
 * printing a flag. An uncounted dimension (`null` on the tier) is never over.
 */
export function overLimits(
  clinic: { plan: string },
  usage: { staff: number; aiPlansThisMonth: number },
): ('seats' | 'ai')[] {
  const plan = planOf(clinic.plan);
  const over: ('seats' | 'ai')[] = [];

  if (plan.seats !== null && usage.staff > plan.seats) over.push('seats');
  if (plan.aiPlansPerMonth !== null && usage.aiPlansThisMonth > plan.aiPlansPerMonth) over.push('ai');

  return over;
}

/**
 * A plan price typed as major units — "240" — as minor units, or null.
 *
 * Deliberately stricter than the billing keypad's parser: this is a monthly
 * subscription typed once by one person, not a till. It takes digits and at
 * most two decimal places, and refuses everything else rather than guessing.
 */
export function parsePlanPrice(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  if (!/^\d{1,7}(\.\d{1,2})?$/.test(trimmed)) return null;

  const [major, minor = ''] = trimmed.split('.');

  return Number(major) * MINOR_PER_MAJOR + Number(minor.padEnd(2, '0'));
}
