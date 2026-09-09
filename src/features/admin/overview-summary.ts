import { type ClinicHealth } from './health';
import {
  monthlyPriceOf,
  monthlyRecurringMinor,
  trialStateOf,
  type PlanCatalog,
} from './plans';

/**
 * The state of the business, in the six numbers a platform owner opens the
 * panel to read.
 *
 * ## Why this exists as its own file
 *
 * The overview used to lead with four counters — clinics joined, plans written,
 * model calls, failed calls — and three of them were what the dashboard
 * literature calls vanity metrics: totals that only ever climb, and that no
 * decision hangs on. "Plans written: 8" cannot be acted on. It is not wrong, it
 * is merely true, and a screen made of true-but-inert numbers is why an
 * operator can read the whole thing and still not know how the platform is
 * doing.
 *
 * The test each figure below has to pass is the obvious one: **if this number
 * moved, would the person reading it do something differently?** Recurring
 * revenue falling, a trial ending this week, money attached to a clinic that
 * has gone quiet, a practice that signed up and never wrote a plan — each of
 * those is a phone call. That is the bar.
 *
 * ## It adds no queries
 *
 * Every figure here is derived from the clinic list the overview already loads
 * for its attention queue, so the redesign costs nothing at the database. That
 * is also why this takes a `readonly` array rather than reaching for `db`: it
 * is arithmetic over rows somebody else read, it is trivially testable, and it
 * cannot drift from the registry screens that read the same list.
 *
 * ## Money is counted the same way the revenue screen counts it
 *
 * Through `monthlyPriceOf` and `monthlyRecurringMinor`, never from the tier
 * alone — a clinic on a negotiated price or a free arrangement is exactly the
 * case these numbers have to be honest about. Two screens disagreeing about
 * MRR is worse than either of them being approximate.
 */

/** What one clinic has to expose for the summary. A subset of `ClinicRecord`. */
export type StandingSubject = {
  plan: string;
  planPriceMinor: number | null;
  suspendedAt: Date | null;
  trialEndsAt: Date | null;
  /** Plans the practice has ever written. Zero is the un-activated case. */
  plans: number;
  health: Pick<ClinicHealth, 'band' | 'signals'>;
};

export type PlatformStanding = {
  /** Monthly recurring revenue in minor units. Suspended clinics excluded. */
  monthlyMinor: number;
  /** Clinics actually paying something — not suspended, price above zero. */
  payingClinics: number;

  /** Trials with time left, and no decision due yet. */
  trialsRunning: number;
  /** Trials inside {@link TRIAL_ENDING_DAYS} of their end. The week's calls. */
  trialsEnding: number;
  /** Trials whose date has passed and which are still not paying. */
  trialsExpired: number;

  /**
   * Recurring revenue attached to clinics the health rules have given up on or
   * nearly given up on.
   *
   * **The figure the old overview could not state.** It said "1 clinic at
   * risk", which is a count of rows; this says how much money stops if that
   * conversation does not happen. A platform with one at-risk clinic paying
   * nothing and one paying half the revenue has two very different mornings,
   * and the count cannot tell them apart.
   */
  atRiskMinor: number;
  atRiskClinics: number;

  /** Clinics being served — everything that is not suspended. */
  liveClinics: number;
  /**
   * Live clinics that have written at least one plan.
   *
   * Activation, not signups. A practice that signed up and never wrote a plan
   * has not started, whatever the joined-this-month counter says, and at this
   * platform's size that is the difference between a customer and a row.
   */
  activatedClinics: number;

  /** Live clinics past the seats or AI allowance their tier is sold with. */
  overLimitClinics: number;
};

/** Bands that mean the practice has stopped, or is stopping. */
const AT_RISK_BANDS = new Set(['at-risk', 'dormant']);

/**
 * The whole standing, in one pass.
 *
 * Suspended clinics are excluded from every figure except nothing at all —
 * they are not being served, so counting them as revenue, as activated or as
 * at risk would each be a different flavour of wrong. `monthlyRecurringMinor`
 * already drops them; the rest of this file does so explicitly.
 */
export function summariseStanding(
  catalog: PlanCatalog,
  clinics: readonly StandingSubject[],
  now: Date,
): PlatformStanding {
  const live = clinics.filter((clinic) => !clinic.suspendedAt);

  const standing: PlatformStanding = {
    monthlyMinor: monthlyRecurringMinor(catalog, clinics),
    payingClinics: live.filter((clinic) => monthlyPriceOf(catalog, clinic) > 0).length,

    trialsRunning: 0,
    trialsEnding: 0,
    trialsExpired: 0,

    atRiskMinor: 0,
    atRiskClinics: 0,

    liveClinics: live.length,
    activatedClinics: live.filter((clinic) => clinic.plans > 0).length,

    overLimitClinics: live.filter((clinic) =>
      clinic.health.signals.some(
        (signal) => signal.key === 'overSeats' || signal.key === 'overAi',
      ),
    ).length,
  };

  for (const clinic of live) {
    switch (trialStateOf(catalog, clinic, now)) {
      case 'running':
        standing.trialsRunning += 1;
        break;
      case 'ending':
        standing.trialsEnding += 1;
        break;
      case 'expired':
        standing.trialsExpired += 1;
        break;
      default:
        break;
    }

    if (AT_RISK_BANDS.has(clinic.health.band)) {
      standing.atRiskClinics += 1;
      standing.atRiskMinor += monthlyPriceOf(catalog, clinic);
    }
  }

  return standing;
}
