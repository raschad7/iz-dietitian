import { type Locale } from '@/i18n/routing';

/**
 * What the platform sells, and what each clinic is worth per month.
 *
 * ## This was a price list in code, and now it is a table
 *
 * The previous version of this file held four tiers as a frozen array and
 * argued for it: what a *clinic* charges its patients is the clinic's to
 * change, and what the *platform* charges its clinics is decided by whoever
 * runs the deployment — who is also the person who ships a release. Adding a
 * tier was a line here and two strings in the message catalogue, never a
 * migration.
 *
 * That argument rests on those being one person, and on this deployment they
 * are not. "Raise the Pro price" became a support request with a deploy
 * attached. See `src/db/schema/platform-plans.ts` for the rest of the reasoning
 * and for why packages are archived rather than deleted.
 *
 * **What did not change:** `clinics.plan` still stores a key as text, and
 * {@link planOf} still survives a key that names nothing. A platform screen
 * that 500s because one clinic holds a stale string is worse than one that
 * shows it on the fallback and lets the operator fix it.
 *
 * ## Everything here is pure
 *
 * Not one function in this file reads the database. They all take a
 * {@link PlanCatalog} — loaded once per request by `plan-catalog.ts` — which
 * keeps the arithmetic testable against a literal, keeps a page from issuing
 * the same read five times, and means two screens cannot disagree about a
 * price because they loaded it at different moments.
 *
 * ## A clinic's price is not necessarily its package's price
 *
 * `clinics.plan_price_minor` overrides the list price when it is set, which is
 * the ordinary shape of a real deployment — a first customer on a handshake, a
 * pilot at zero, a practice that negotiated. Every figure on the revenue screen
 * comes from {@link monthlyPriceOf}, never from the package alone, so a
 * discount is visible in the total rather than hidden behind a label.
 *
 * ## Nothing here is enforced
 *
 * `seats` and `aiPlansPerMonth` are what a package is *sold* with. They gate
 * nothing: a clinic over its seat count keeps working and shows up on the
 * platform screen as over its limit. Enforcement is a product decision with a
 * refund policy and a dunning email attached.
 */

/** Minor units per major, restated rather than imported: see `money.ts`. */
const MINOR_PER_MAJOR = 100;

/** One package, as the rest of the app reads it. Mirrors `platform_plans`. */
export type PlatformPlan = {
  id: string;
  /** The value `clinics.plan` holds. Fixed at creation; the name is what changes. */
  key: string;
  nameEn: string;
  nameAr: string;
  /** List price per month in minor units. */
  monthlyPriceMinor: number;
  /** Staff accounts the package is sold with. `null` means uncounted. */
  seats: number | null;
  /** AI plan generations per calendar month. `null` means uncounted. */
  aiPlansPerMonth: number | null;
  /** Days of trial a clinic starting here gets. `null` on a package that is not a trial. */
  trialDays: number | null;
  /** Ordered low to high, for sorting and for the ramp the charts colour by. */
  rank: number;
  /** Retired: still prices its clinics, no longer offered. */
  archivedAt: Date | null;
};

/**
 * The price list for one request.
 *
 * Holds the archived packages as well as the sellable ones, because a clinic
 * can be on a retired package and the revenue screen still has to price it.
 * {@link offered} is the subset a picker should show.
 */
export type PlanCatalog = {
  /** Every package, archived included, cheapest first. */
  all: PlatformPlan[];
  /** The sellable ones, cheapest first. */
  offered: PlatformPlan[];
  byKey: Map<string, PlatformPlan>;
  /**
   * Where an unrecognised key lands, and what sign-up starts a clinic on.
   *
   * The cheapest package that is still offered — which on an untouched
   * deployment is the trial, without this file having to know that word. A
   * platform that has archived every package falls back to the cheapest
   * archived one rather than to nothing, because {@link planOf} must always
   * return something for a clinic to be priced at.
   */
  fallback: PlatformPlan;
};

/**
 * An empty catalog is not representable, so this throws rather than inventing a
 * package. It is called with rows straight out of a table the migration seeded,
 * and a truly empty `platform_plans` means the data migration did not run —
 * which is a deployment fault worth stopping on, not one to paper over with a
 * fabricated "Trial" that would then start pricing real customers.
 */
export function makePlanCatalog(rows: readonly PlatformPlan[]): PlanCatalog {
  if (rows.length === 0) {
    throw new Error(
      'platform_plans is empty. Run the migrations — 0059_seed_platform_plans installs the starting price list.',
    );
  }

  const all = [...rows].sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
  const offered = all.filter((plan) => plan.archivedAt === null);

  return {
    all,
    offered,
    byKey: new Map(all.map((plan) => [plan.key, plan])),
    fallback: offered[0] ?? all[0]!,
  };
}

/**
 * The package a key names, or the fallback when it names nothing.
 *
 * Never throws, for the reason the header gives: `clinics.plan` is text, so a
 * value written by a script or left behind by a renamed package is a state this
 * has to survive.
 */
export function planOf(catalog: PlanCatalog, key: string | null | undefined): PlatformPlan {
  return catalog.byKey.get(key ?? '') ?? catalog.fallback;
}

/** Whether a key is one this deployment sells — for flagging drift, not for control flow. */
export function isKnownPlan(catalog: PlanCatalog, key: string | null | undefined): boolean {
  return catalog.byKey.has(key ?? '');
}

/** A package's name in the reader's language. */
export function planNameOf(plan: PlatformPlan, locale: Locale): string {
  return locale === 'ar' ? plan.nameAr : plan.nameEn;
}

/** The subset of a clinic the money functions read. */
export type PricedClinic = { plan: string; planPriceMinor: number | null };

/**
 * What one clinic pays a month, in minor units.
 *
 * The override wins whenever it is set, **including when it is zero** — which
 * is why the check is `!= null` and not truthiness. A clinic on a free
 * arrangement is exactly the case an operator needs the revenue screen to be
 * honest about, and `0 || listPrice` would silently bill them the list.
 */
export function monthlyPriceOf(catalog: PlanCatalog, clinic: PricedClinic): number {
  return priceFor(planOf(catalog, clinic.plan), clinic);
}

/**
 * The same answer when the caller already holds the package.
 *
 * The pair exists so that code judging **one clinic against its own package** —
 * the health rules, a detail screen — never has to be handed the whole price
 * list to do it. Passing a catalog there would be handing over every package to
 * answer a question about one, and it is the difference between a pure function
 * a test can call with a literal and one that needs the table.
 */
export function priceFor(plan: PlatformPlan, clinic: PricedClinic): number {
  return clinic.planPriceMinor ?? plan.monthlyPriceMinor;
}

/** The subset the platform-wide totals read. */
export type BillableClinic = PricedClinic & { suspendedAt: Date | null };

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
 * package is special-cased. If a trial is ever given a price it will count,
 * which is the correct behaviour and one fewer rule to remember.
 *
 * Integer arithmetic throughout. See the header of `src/db/schema/billing.ts`
 * for why money never touches a float in this codebase.
 */
export function monthlyRecurringMinor(
  catalog: PlanCatalog,
  clinics: readonly BillableClinic[],
): number {
  return clinics.reduce(
    (total, clinic) => (clinic.suspendedAt ? total : total + monthlyPriceOf(catalog, clinic)),
    0,
  );
}

/** Annual run rate — twelve times the monthly figure, and nothing cleverer. */
export function annualRunRateMinor(monthlyMinor: number): number {
  return monthlyMinor * 12;
}

/** Average revenue per paying clinic, in minor units. Zero when none pay. */
export function averageRevenueMinor(
  catalog: PlanCatalog,
  clinics: readonly BillableClinic[],
): number {
  const paying = clinics.filter(
    (clinic) => !clinic.suspendedAt && monthlyPriceOf(catalog, clinic) > 0,
  );
  if (paying.length === 0) return 0;

  return Math.round(monthlyRecurringMinor(catalog, paying) / paying.length);
}

/**
 * How many clinics sit on each package, cheapest first. Packages with none are
 * kept, so the shape of the price list is visible rather than only its
 * occupied rows.
 *
 * Archived packages appear **only when somebody is still on one** — a retired
 * package with no clinics is history, and printing it every month would grow
 * the table without adding a fact.
 */
export function planBreakdown(
  catalog: PlanCatalog,
  clinics: readonly BillableClinic[],
): { plan: PlatformPlan; clinics: number; monthlyMinor: number }[] {
  return catalog.all
    .map((plan) => {
      const held = clinics.filter((clinic) => planOf(catalog, clinic.plan).key === plan.key);

      return {
        plan,
        clinics: held.length,
        monthlyMinor: monthlyRecurringMinor(catalog, held),
      };
    })
    .filter((row) => row.plan.archivedAt === null || row.clinics > 0);
}

/** A trial state the screen has a word for. */
export type TrialState = 'none' | 'running' | 'ending' | 'expired';

/** The subset the trial functions read. */
export type TrialClinic = PricedClinic & { trialEndsAt: Date | null };

/**
 * Where a clinic's trial stands.
 *
 * `ending` is the one that earns its place: a trial with a week left is the
 * only row on the registry that is *about to* need a decision, and a screen
 * that cannot tell it from one with a month left cannot be used to plan a week.
 *
 * A clinic on a paid package is `none` regardless of what `trialEndsAt` holds —
 * a leftover date on a converted customer is not a deadline, and reporting one
 * would send the operator to have a conversation that already happened.
 */
export function trialStateOf(catalog: PlanCatalog, clinic: TrialClinic, now: Date): TrialState {
  return trialStateFor(planOf(catalog, clinic.plan), clinic, now);
}

/** {@link trialStateOf} when the caller already holds the package. See {@link priceFor}. */
export function trialStateFor(plan: PlatformPlan, clinic: TrialClinic, now: Date): TrialState {
  if (priceFor(plan, clinic) > 0) return 'none';
  if (!clinic.trialEndsAt) return 'none';

  const daysLeft = (clinic.trialEndsAt.getTime() - now.getTime()) / 86_400_000;

  if (daysLeft < 0) return 'expired';
  if (daysLeft <= TRIAL_ENDING_DAYS) return 'ending';

  return 'running';
}

/**
 * How close to its end a trial has to be before the registry calls it out.
 *
 * Still a constant while `trialDays` became a column, and the asymmetry is
 * deliberate: the length of a trial is an offer, which is the operator's to
 * set, and this is how much warning they want before one lapses — a property of
 * how they work, not of what they sell. Making it per-package would ask them to
 * answer the same question once per package for no gain.
 */
export const TRIAL_ENDING_DAYS = 7;

/**
 * When a trial that starts now should run out, or null on a package that does
 * not offer one.
 *
 * Sign-up calls this. Before it existed nothing wrote `clinics.trial_ends_at`
 * at all, so every clinic that ever signed up had a null deadline and the
 * platform screen's trial pipeline was reporting on a column only a human had
 * ever filled in.
 */
export function trialEndsAtFrom(plan: PlatformPlan, startedAt: Date): Date | null {
  if (plan.trialDays === null) return null;

  return new Date(startedAt.getTime() + plan.trialDays * 86_400_000);
}

/**
 * Whether a clinic is past what its package was sold with.
 *
 * Returns the dimensions that are over, so the screen can name them rather than
 * printing a flag. An uncounted dimension (`null` on the package) is never over.
 */
export function overLimits(
  plan: PlatformPlan,
  usage: { staff: number; aiPlansThisMonth: number },
): ('seats' | 'ai')[] {
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

/**
 * A package key as typed by the operator, normalised, or null when it could
 * never be one.
 *
 * Lowercase, digits, and single hyphens. It goes into `clinics.plan` on every
 * clinic that takes the package and appears in no URL, so the bar is only that
 * it is stable and comparable — but it is written once and can never be
 * changed, which is reason enough not to let a stray space or capital in.
 */
export function parsePlanKey(input: string): string | null {
  const key = input.trim().toLowerCase().replace(/\s+/g, '-');

  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(key) && key.length <= 40 ? key : null;
}
