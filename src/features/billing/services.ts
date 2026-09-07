import type { IconName } from '@/components/ui/icon';
import type { Locale } from '@/i18n/routing';

/**
 * The services a clinic bills for — the shape of one, and the list a new clinic
 * starts with.
 *
 * **This file used to be the catalogue itself.** Three entries, `as const`, with
 * the names in the message catalogue and the prices in a keyed table beside it.
 * Adding a service was "a line here and a pair of strings", which is cheap right
 * up until the person who needs the fourth one is a clinic rather than a
 * developer. The first practice to sell a two-month subscription could not, and
 * the second would have wanted a year.
 *
 * So the catalogue is `clinic_services`, one row per service per clinic, and
 * what is left here is:
 *
 *  - {@link DEFAULT_SERVICES}, the list a clinic is seeded with on sign-up;
 *  - the pure rules every screen reads a service through — its name in the
 *    reader's language, its tint, its icon, and whether it runs for a term.
 *
 * Nothing here reaches the database. `src/features/billing/queries.ts` loads the
 * rows and hands them down; these functions are what stops the card, the ledger
 * row, the Bills column and the settings screen from each having their own
 * opinion about what a service is.
 */

/**
 * What a service is, everywhere outside the database.
 *
 * A trimmed `ClinicService`: the row's timestamps and its `clinic_id` are of no
 * interest to a component, and leaving them out means a client component cannot
 * accidentally start reasoning about a tenant boundary it is not the guard for.
 */
export type ClinicServiceView = {
  id: string;
  /** The stable handle a charge records. Never shown. */
  key: string;
  nameAr: string;
  nameEn: string;
  kind: ServiceKind;
  /** Whole months for a subscription; null for a visit. */
  durationMonths: number | null;
  /** Minor units, or null where the clinic has set no price. */
  priceMinor: number | null;
  firstFree: boolean;
  active: boolean;
  sortOrder: number;
};

/**
 * A term, or a visit.
 *
 * Two values and not more. It is tempting to add `package` for "ten sessions",
 * and the right time to do that is when something can actually count the
 * sessions down — a third kind that behaves exactly like a visit would be a
 * label pretending to be a rule.
 */
export const SERVICE_KINDS = ['subscription', 'visit'] as const;

export type ServiceKind = (typeof SERVICE_KINDS)[number];

export function isServiceKind(value: unknown): value is ServiceKind {
  return SERVICE_KINDS.includes(value as ServiceKind);
}

/**
 * The longest term a clinic may sell, in months.
 *
 * Two years. Not a clinical limit — a bound on a typo: `120` in the months box
 * is a subscription running to 2036, and a register cannot show that it is
 * wrong. A practice that genuinely sells longer can sell it as two.
 */
export const MAX_TERM_MONTHS = 24;

/**
 * What a clinic is seeded with the day it signs up.
 *
 * The three that were hard-coded, with the keys they always had — see the
 * migration note on `clinic_services`. A clinic may rename any of them, reprice
 * them, retire them, or add a two-month term beside them, all without a deploy;
 * this is only the starting point, and it is deliberately the same starting
 * point every existing clinic was given.
 *
 * No prices. A rate this app invented is a rate somebody eventually charges a
 * subscriber by not noticing.
 */
export const DEFAULT_SERVICES = [
  {
    key: 'monthly',
    nameAr: 'اشتراك شهر واحد',
    nameEn: 'One month subscription',
    kind: 'subscription',
    durationMonths: 1,
    firstFree: false,
    sortOrder: 0,
  },
  {
    key: 'quarterly',
    nameAr: 'اشتراك ثلاثة أشهر',
    nameEn: 'Three month subscription',
    kind: 'subscription',
    durationMonths: 3,
    firstFree: false,
    sortOrder: 1,
  },
  {
    key: 'consultation',
    nameAr: 'استشارة',
    nameEn: 'Consultation',
    kind: 'visit',
    durationMonths: null,
    firstFree: true,
    sortOrder: 2,
  },
] as const satisfies readonly {
  key: string;
  nameAr: string;
  nameEn: string;
  kind: ServiceKind;
  durationMonths: number | null;
  firstFree: boolean;
  sortOrder: number;
}[];

/**
 * A service's name in the reader's language.
 *
 * Both names are stored and one is chosen, rather than one name shown to
 * everybody: the clinic works in Arabic and its printed bills are read in
 * Arabic, but the same practice has an English interface for staff who prefer
 * it, and a service called "استشارة" sitting in an otherwise English settings
 * table is the kind of half-translated screen this app does not ship.
 *
 * A clinic that types only one of the two gets that one in both languages —
 * `createService` fills the empty side from the filled one, because a blank name
 * on a bill is worse than an untranslated one.
 */
export function serviceName(service: { nameAr: string; nameEn: string }, locale: Locale): string {
  return locale === 'ar' ? service.nameAr : service.nameEn;
}

/**
 * The tint a service is drawn in.
 *
 * **Keyed on kind, not on the service.** It used to be a class name per entry in
 * a three-item list, which cannot survive a clinic inventing its own services —
 * there is no colour to give "برنامج ١٢ أسبوع" without asking somebody to pick
 * one, and a palette a clinic picks from is a palette that eventually contains
 * every colour.
 *
 * The split the tint marks is the one that changes what the ledger does with the
 * row: a term, or a single visit. A term is blue and a visit is the neutral
 * grey. Blue rather than the on-track green, because green is what the paid
 * figure and the on-track chip are drawn in, and a subscription wearing it says
 * something about money on a control that only names what was sold.
 */
export function serviceTone(kind: ServiceKind): string {
  return kind === 'subscription'
    ? 'bg-blue-tint text-blue'
    : 'bg-status-incomplete-bg text-status-incomplete-fg';
}

/**
 * The glyph beside the name on the charge card.
 *
 * A term repeats and a visit is clinical, which is the whole of what these two
 * say. The old list gave the month a `repeat` and the quarter a `calendar` to
 * tell two subscriptions apart; with a clinic free to sell five of them, the
 * words and the term beside them are what do that, and five glyphs would be five
 * things to learn.
 */
export function serviceIcon(kind: ServiceKind): IconName {
  return kind === 'subscription' ? 'repeat' : 'medical';
}

/** The service a charge's stored key names, or `undefined` once it is deleted. */
export function serviceByKey(
  services: readonly ClinicServiceView[],
  key: string | null | undefined,
): ClinicServiceView | undefined {
  return key ? services.find((service) => service.key === key) : undefined;
}

/**
 * The services a card may offer: active ones, in the clinic's own order.
 *
 * Retired services are still resolved by {@link serviceByKey} — an old charge
 * has to keep saying what it was — but they are never offered again, which is
 * what retiring one means.
 */
export function sellableServices(
  services: readonly ClinicServiceView[],
): readonly ClinicServiceView[] {
  return services.filter((service) => service.active);
}

/**
 * A key for a service a clinic has just typed in.
 *
 * Latin letters and digits from either name, hyphen-separated. Arabic names
 * produce nothing under that rule and that is fine: the key is never shown, so a
 * clinic whose services are all in Arabic gets `service-1`, `service-2`, and the
 * ledger is exactly as readable as it would have been. What the key must be is
 * *stable* and *unique within the clinic*, and both are this function's job.
 *
 * `taken` is every key the clinic already uses, retired services included — a
 * new service must not inherit an old one's charges by reusing its key.
 */
export function serviceKeyFrom(
  name: { nameAr: string; nameEn: string },
  taken: readonly string[],
): string {
  const slug = name.nameEn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

  const base = slug || 'service';
  const used = new Set(taken);

  if (!used.has(base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  /* A clinic with 999 services called the same thing has a different problem. */
  return `${base}-${Date.now()}`;
}
