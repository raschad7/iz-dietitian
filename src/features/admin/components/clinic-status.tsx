import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/routing';

import type { ClinicHealth, HealthBand, HealthSignal } from '../health';
import { planNameOf, priceFor, trialStateFor, type PlatformPlan } from '../plans';

/**
 * How a clinic is doing, said in one badge and a row of reasons.
 *
 * ## What replaced what
 *
 * The registry used to carry a three-way badge derived from two columns:
 * suspended, onboarding, or active. It was correct and told the operator almost
 * nothing — "active" covered a practice writing plans every day and one that
 * signed up in March and has not been back, which are the two rows a platform
 * screen exists to separate.
 *
 * The band comes from `health.ts`, where the rules are written out and tested.
 * This file only draws it.
 *
 * ## Why the signals are shown beside the band and not behind a tooltip
 *
 * The band is a sort key; the signals are the thing to act on. Hiding "no plans
 * written in 46 days" behind a hover would make the useful half of the answer
 * unavailable on a phone and unavailable to a keyboard — and the design system's
 * accessibility floor says hover-only content must be reachable another way, so
 * a tooltip would have needed the text on the page regardless.
 */

const BAND_VARIANT: Record<HealthBand, 'muted' | 'attention' | 'incomplete' | 'onTrack' | 'outline'> = {
  /* Grey, not red. A dormant clinic is not an emergency, it is a fact —
     and half of them are dormant because the platform suspended them. */
  dormant: 'muted',
  /* Amber. The system's warning colour: something to look at, not something
     broken. Clay is reserved for medical facts elsewhere in the product and
     borrowing it here would outrank a real allergy chip on a client's record. */
  'at-risk': 'attention',
  watch: 'incomplete',
  /* A new signup is a good thing that has not proved itself yet. Outline says
     "not classified" without implying either. */
  new: 'outline',
  healthy: 'onTrack',
};

/**
 * Band to message key, written out rather than built with a template literal.
 *
 * ⚠ `t(\`band.${band}\`)` typechecks against a union of every key in the
 * catalogue, and this application has roughly three thousand of them.
 * Multiplying that union by a five-member template blew past TypeScript's limit
 * — `TS2590: union type that is too complex to represent` — and the failure is
 * not local: once the union collapses, every `getTranslations` call in the file
 * stops resolving. A literal map costs five lines and keeps the keys checked.
 */
const BAND_KEY = {
  dormant: 'band.dormant',
  'at-risk': 'band.at-risk',
  watch: 'band.watch',
  new: 'band.new',
  healthy: 'band.healthy',
} as const satisfies Record<HealthBand, string>;

export async function HealthBadge({ band }: { band: HealthBand }) {
  const t = await getTranslations('admin.health');

  return <Badge variant={BAND_VARIANT[band]}>{t(BAND_KEY[band])}</Badge>;
}

/**
 * The reasons behind a band, as short phrases.
 *
 * Numbers are passed to the message rather than baked into the key, so Arabic
 * and English can put "46 days" wherever their grammar wants it. `formatNumber`
 * keeps the digits Latin in both — the app forces `numberingSystem: 'latn'`, and
 * a raw `${signal.days}` would be the one place that leaked Arabic-Indic digits
 * into a screen that has none anywhere else.
 */
/** Signal to message key. Written out for the reason `BAND_KEY` is. */
const SIGNAL_KEY = {
  noStaff: 'noStaff',
  noClients: 'noClients',
  noPlansEver: 'noPlansEver',
  quiet: 'quiet',
  slowing: 'slowing',
  trialExpired: 'trialExpired',
  trialEnding: 'trialEnding',
  overSeats: 'overSeats',
  overAi: 'overAi',
  onboardingStalled: 'onboardingStalled',
  suspended: 'suspended',
} as const satisfies Record<HealthSignal['key'], string>;

export async function HealthSignals({
  signals,
  locale,
  max,
}: {
  signals: readonly HealthSignal[];
  locale: Locale;
  /** Show only the most severe few. The detail screen passes nothing and shows all. */
  max?: number;
}) {
  const t = await getTranslations('admin.health.signals');
  if (signals.length === 0) return null;

  const shown = max ? signals.slice(0, max) : signals;
  const hidden = signals.length - shown.length;

  return (
    <ul className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {shown.map((signal) => (
        <li
          key={signal.key}
          className={
            signal.severity === 'critical'
              ? 'text-caption text-status-attention-fg'
              : 'text-caption text-muted-foreground'
          }
        >
          {t(SIGNAL_KEY[signal.key], {
            days: formatNumber(locale, signal.days ?? 0),
            count: formatNumber(locale, signal.count ?? 0),
            limit: formatNumber(locale, signal.limit ?? 0),
          })}
        </li>
      ))}

      {hidden > 0 ? (
        <li className="text-caption text-muted-foreground">
          {t('more', { count: formatNumber(locale, hidden) })}
        </li>
      ) : null}
    </ul>
  );
}

/**
 * Which tier a clinic is on, and whether its trial is running out.
 *
 * The trial state is drawn into the same badge rather than beside it. Two chips
 * saying "trial" and "expired" is one fact wearing two hats, and on a table row
 * that width belongs to the clinic's name.
 */
/** Tier to message key. Written out for the reason `BAND_KEY` is. */
/* The tier -> message-key map lived here. A package the operator invents at
   runtime cannot have a translation shipped for it, so a package now carries
   its own name in both languages and `planNameOf` reads the right one. */

export async function PlanBadge({
  clinic,
  plan,
  locale,
  now,
}: {
  clinic: { plan: string; planPriceMinor: number | null; trialEndsAt: Date | null };
  /** The clinic's own package, resolved by the caller from the catalogue. */
  plan: PlatformPlan;
  locale: Locale;
  now: Date;
}) {
  const t = await getTranslations('admin.plans');
  const trial = trialStateFor(plan, clinic, now);

  /*
    A free package gets the outline treatment. Keyed off the price rather than
    off the key being the literal string "trial", which stopped being safe the
    moment the operator could name a package anything they like.
  */
  const variant =
    trial === 'expired'
      ? 'attention'
      : trial === 'ending'
        ? 'incomplete'
        : priceFor(plan, clinic) === 0
          ? 'outline'
          : 'muted';

  return (
    <Badge variant={variant}>
      {planNameOf(plan, locale)}
      {trial === 'expired' ? ` · ${t('trialExpired')}` : null}
      {trial === 'ending' ? ` · ${t('trialEnding')}` : null}
    </Badge>
  );
}

/**
 * The old three-way status, kept for the one place it is still the right answer.
 *
 * A clinic's *administrative* state — suspended, still setting up, running — is
 * a different question from its health, and the detail screen states both: one
 * says what the platform has done to it, the other says how it is going. On the
 * registry only health is shown, because a suspended clinic already reports
 * `suspended` as its first signal.
 */
export type ClinicStatus = 'suspended' | 'onboarding' | 'active';

export function clinicStatusOf(clinic: {
  suspendedAt: Date | null;
  onboardingCompletedAt: Date | null;
}): ClinicStatus {
  /*
    Suspension wins. A clinic can be both suspended and half-set-up, and which
    of the two a reader needs to know is never the second one.

    ⚠ Both are timestamps, so both are TRUTHY when present — including the epoch.
    Testing `clinic.suspendedAt !== null` rather than a boolean cast is what
    keeps a date of 1970 from reading as "not suspended".
  */
  if (clinic.suspendedAt !== null) return 'suspended';
  if (clinic.onboardingCompletedAt === null) return 'onboarding';

  return 'active';
}

export async function ClinicStatusBadge({ status }: { status: ClinicStatus }) {
  const t = await getTranslations('admin.clinics.status');

  const variant = status === 'suspended' ? 'attention' : status === 'onboarding' ? 'incomplete' : 'muted';

  return <Badge variant={variant}>{t(status)}</Badge>;
}

/** Whether a clinic pays anything at all — for the "worth a call" marker. */
export function isPaying(
  plan: PlatformPlan,
  clinic: { plan: string; planPriceMinor: number | null },
): boolean {
  return priceFor(plan, clinic) > 0;
}

/** A clinic's health, its plan, and its signals, as one cell in a table row. */
export async function ClinicHealthCell({
  health,
  locale,
}: {
  health: ClinicHealth;
  locale: Locale;
}) {
  return (
    <div className="space-y-1">
      <HealthBadge band={health.band} />
      <HealthSignals signals={health.signals} locale={locale} max={2} />
    </div>
  );
}
