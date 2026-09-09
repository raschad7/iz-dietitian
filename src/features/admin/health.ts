import { daysBetween } from './period';
import { overLimits, priceFor, trialStateFor, type PlatformPlan } from './plans';

/**
 * Whether a clinic is doing well, and what says so.
 *
 * ## Why this is a band and a list of reasons, not a score out of 100
 *
 * The usual shape for this is a composite health score — weight last login,
 * weight usage, weight support tickets, add them up, colour the number. Every
 * source recommends it and it is the wrong thing to build here.
 *
 * A weighted score is a number nobody can argue with, because nobody can see
 * what is in it. An operator reading "38" learns that something is wrong and
 * nothing about what; two clinics with the same 38 can need opposite
 * conversations. And the weights are invented — there is no data on this
 * deployment to fit them against, so they would be my guesses wearing the
 * costume of a measurement.
 *
 * So this returns a **band** derived from rules you can read, plus the
 * **signals** that put it there. The screen shows "no plans written in 46 days"
 * and "3 of 5 patients went quiet", which is what the operator would have had
 * to work out anyway. The band is for sorting; the signals are for acting.
 *
 * ## The rules are ordered, and the first match wins
 *
 * A clinic can trip several signals at once. The band takes the worst of them,
 * and every signal is still reported — a dormant clinic that is also over its
 * seat count is both, and hiding the second because the first is more urgent is
 * how a support call ends up incomplete.
 */

/** How a clinic is doing, worst first. */
export type HealthBand = 'dormant' | 'at-risk' | 'watch' | 'new' | 'healthy';

/** Ordered worst to best, for sorting a registry by "who needs me". */
export const HEALTH_BANDS: readonly HealthBand[] = ['dormant', 'at-risk', 'watch', 'new', 'healthy'];

const BAND_RANK = new Map<HealthBand, number>(HEALTH_BANDS.map((band, index) => [band, index]));

export function healthRank(band: HealthBand): number {
  return BAND_RANK.get(band) ?? HEALTH_BANDS.length;
}

/**
 * One thing that is true about a clinic and worth saying out loud.
 *
 * `severity` is what the band is computed from; `key` is what the screen
 * translates; `days`/`count` are the numbers the sentence needs. Keeping the
 * numbers on the signal rather than pre-formatting the sentence is what lets
 * the same signal read in Arabic and in English.
 */
export type HealthSignal = {
  key:
    | 'noStaff'
    | 'noClients'
    | 'noPlansEver'
    | 'quiet'
    | 'slowing'
    | 'trialExpired'
    | 'trialEnding'
    | 'overSeats'
    | 'overAi'
    | 'onboardingStalled'
    | 'suspended';
  severity: 'critical' | 'warning' | 'info';
  days?: number;
  count?: number;
  limit?: number;
};

/** What a clinic has been doing, as the registry reads it. */
export type ClinicActivity = {
  /** Newest plan written, or null if none ever was. */
  lastPlanAt: Date | null;
  /** Newest client added. */
  lastClientAt: Date | null;
  /** Most recent staff sign-in this deployment still has a session for. */
  lastSignInAt: Date | null;
  /** Plans written in the last 30 days, and in the 30 before that. */
  plansRecent: number;
  plansPrevious: number;
  staff: number;
  clients: number;
  aiPlansThisMonth: number;
};

/** The clinic fields the rules read. */
export type HealthSubject = {
  plan: string;
  planPriceMinor: number | null;
  trialEndsAt: Date | null;
  suspendedAt: Date | null;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
};

/** A clinic younger than this is judged on setup, not on output. */
export const NEW_CLINIC_DAYS = 14;

/** No activity for this long and the clinic is quiet enough to ask about. */
export const QUIET_DAYS = 14;

/** No activity for this long and it has stopped. */
export const DORMANT_DAYS = 45;

/** Setup left unfinished for this long is stalled, not in progress. */
export const ONBOARDING_STALLED_DAYS = 7;

/** A drop of more than this fraction against the previous period is a slowdown. */
export const SLOWDOWN_RATIO = 0.5;

/**
 * The newest thing that happened at a clinic, or null if nothing ever has.
 *
 * Sign-ins count as activity, but they are the weakest of the three: a
 * dietitian who signs in every morning and writes nothing is not a working
 * practice. They are included because the alternative — calling a clinic
 * dormant while someone is looking at it daily — is worse and more embarrassing.
 */
export function lastActivityAt(activity: ClinicActivity): Date | null {
  const stamps = [activity.lastPlanAt, activity.lastClientAt, activity.lastSignInAt].filter(
    (value): value is Date => value !== null,
  );

  if (stamps.length === 0) return null;

  return stamps.reduce((newest, stamp) => (stamp > newest ? stamp : newest));
}

/**
 * Everything true about a clinic that an operator would want to know.
 *
 * Order is stable — the list below is the order they appear on screen — so a row
 * does not reshuffle its own badges between renders.
 */
export function healthSignals(
  clinic: HealthSubject,
  activity: ClinicActivity,
  /*
    The clinic's OWN package, not the whole price list. These rules judge one
    practice against what it was sold, so handing them the catalogue would be
    passing every package in to answer a question about one — and would make
    every test here need a catalogue to say "over its seats".
  */
  plan: PlatformPlan,
  now: Date,
): HealthSignal[] {
  const signals: HealthSignal[] = [];

  if (clinic.suspendedAt) {
    signals.push({ key: 'suspended', severity: 'critical', days: daysBetween(clinic.suspendedAt, now) });
  }

  const trial = trialStateFor(plan, clinic, now);
  if (trial === 'expired') {
    signals.push({
      key: 'trialExpired',
      severity: 'critical',
      days: clinic.trialEndsAt ? daysBetween(clinic.trialEndsAt, now) : undefined,
    });
  } else if (trial === 'ending') {
    signals.push({
      key: 'trialEnding',
      severity: 'warning',
      days: clinic.trialEndsAt ? Math.max(0, daysBetween(now, clinic.trialEndsAt)) : undefined,
    });
  }

  if (activity.staff === 0) {
    // Nobody can sign in. Every other signal about this clinic is downstream of
    // that, so it is reported first and reported as critical.
    signals.push({ key: 'noStaff', severity: 'critical' });
  }

  const age = daysBetween(clinic.createdAt, now);

  if (!clinic.onboardingCompletedAt && age >= ONBOARDING_STALLED_DAYS) {
    signals.push({ key: 'onboardingStalled', severity: 'warning', days: age });
  }

  if (activity.clients === 0 && age >= NEW_CLINIC_DAYS) {
    signals.push({ key: 'noClients', severity: 'warning', days: age });
  }

  const last = lastActivityAt(activity);

  if (!activity.lastPlanAt && age >= NEW_CLINIC_DAYS) {
    signals.push({ key: 'noPlansEver', severity: 'warning', days: age });
  }

  if (last) {
    const quiet = daysBetween(last, now);
    if (quiet >= QUIET_DAYS) {
      signals.push({
        key: 'quiet',
        severity: quiet >= DORMANT_DAYS ? 'critical' : 'warning',
        days: quiet,
      });
    }
  }

  /*
    A slowdown, not a low count.

    The comparison needs a previous period with something in it — a clinic that
    wrote nothing last month and nothing this month is quiet, which the rule
    above already says, and calling that a "slowdown" as well would report the
    same fact twice under two names. The floor of 2 is there because dropping
    from one plan to zero is not a trend.
  */
  if (activity.plansPrevious >= 2 && activity.plansRecent < activity.plansPrevious * SLOWDOWN_RATIO) {
    signals.push({
      key: 'slowing',
      severity: 'warning',
      count: activity.plansRecent,
      limit: activity.plansPrevious,
    });
  }

  /*
    Through `overLimits` rather than comparing here, so "past what the package
    was sold with" is decided in one place. This file and the platform screen
    used to answer that question with two copies of the same two comparisons.
  */
  const over = overLimits(plan, activity);

  if (over.includes('seats')) {
    signals.push({ key: 'overSeats', severity: 'info', count: activity.staff, limit: plan.seats ?? undefined });
  }

  if (over.includes('ai')) {
    signals.push({
      key: 'overAi',
      severity: 'info',
      count: activity.aiPlansThisMonth,
      limit: plan.aiPlansPerMonth ?? undefined,
    });
  }

  return signals;
}

/**
 * Which band a clinic falls in.
 *
 * ## `new` is checked before the failures, and that is the point
 *
 * A clinic three days old has no plans, no patients and no history to slow down
 * from. Judged by the same rules as a year-old practice it is the sickest thing
 * on the registry, which would put every new signup at the top of the
 * "needs attention" list and train the operator to ignore it. Below
 * `NEW_CLINIC_DAYS` it is `new` unless something is genuinely wrong — suspended,
 * or with nobody able to sign in.
 *
 * ## A suspended clinic is not "dormant"
 *
 * It is quiet because the platform turned it off. Reporting the consequence of
 * an operator's own action as a health problem is how a registry fills with
 * noise, so suspension takes the `dormant` band but the signal names the real
 * cause, and the screen shows the badge for it.
 */
export function healthBandOf(
  clinic: HealthSubject,
  activity: ClinicActivity,
  signals: readonly HealthSignal[],
  now: Date,
): HealthBand {
  if (clinic.suspendedAt) return 'dormant';
  if (activity.staff === 0) return 'at-risk';

  const age = daysBetween(clinic.createdAt, now);
  if (age < NEW_CLINIC_DAYS) return 'new';

  const last = lastActivityAt(activity);
  if (!last || daysBetween(last, now) >= DORMANT_DAYS) return 'dormant';

  if (signals.some((signal) => signal.severity === 'critical')) return 'at-risk';

  const warnings = signals.filter((signal) => signal.severity === 'warning').length;
  if (warnings >= 2) return 'at-risk';
  if (warnings === 1) return 'watch';

  return 'healthy';
}

export type ClinicHealth = {
  band: HealthBand;
  signals: HealthSignal[];
  lastActiveAt: Date | null;
  /** Days since anything happened, or null when nothing ever has. */
  quietDays: number | null;
};

/** The whole verdict, in one call. */
export function assessClinic(
  clinic: HealthSubject,
  activity: ClinicActivity,
  plan: PlatformPlan,
  now: Date,
): ClinicHealth {
  const signals = healthSignals(clinic, activity, plan, now);
  const lastActiveAt = lastActivityAt(activity);

  return {
    band: healthBandOf(clinic, activity, signals, now),
    signals,
    lastActiveAt,
    quietDays: lastActiveAt ? daysBetween(lastActiveAt, now) : null,
  };
}

/**
 * Whether a clinic belongs on the overview's attention queue.
 *
 * Deliberately narrower than "not healthy". `new` and `watch` are states to be
 * aware of, not things to do today, and a queue that lists everything is a queue
 * nobody works through. A suspended clinic is excluded too: the operator
 * suspended it, so it is not news.
 */
export function needsAttention(clinic: HealthSubject, health: ClinicHealth): boolean {
  if (clinic.suspendedAt) return false;

  return health.band === 'dormant' || health.band === 'at-risk';
}

/**
 * A clinic that pays nothing and is doing real work — the upgrade conversation.
 *
 * The mirror of the attention queue, and the reason the platform screen is worth
 * opening on a good day as well as a bad one.
 */
export function isConversionCandidate(
  clinic: HealthSubject,
  activity: ClinicActivity,
  health: ClinicHealth,
  plan: PlatformPlan,
): boolean {
  if (clinic.suspendedAt) return false;
  if (priceFor(plan, clinic) > 0) return false;

  return health.band === 'healthy' && activity.plansRecent > 0 && activity.clients > 0;
}
