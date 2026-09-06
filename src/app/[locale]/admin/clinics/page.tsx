import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import {
  ClinicHealthCell,
  PlanBadge,
} from '@/features/admin/components/clinic-status';
import { AdminToolbar, FilterSelect } from '@/features/admin/components/toolbar';
import { HEALTH_BANDS, healthRank, type HealthBand } from '@/features/admin/health';
import { monthlyPriceOf, PLAN_KEYS, planOf, type PlanKey } from '@/features/admin/plans';
import { listClinics, type ClinicRecord } from '@/features/admin/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/routing';

type ClinicsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; health?: string; plan?: string; sort?: string }>;
};

export async function generateMetadata({ params }: ClinicsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'admin.clinics' });
  return { title: t('title') };
}

/**
 * How the registry can be ordered.
 *
 * `attention` is the default and that is the whole change from the first
 * version, which sorted newest-first. Newest-first answers "who signed up
 * lately", which is a question with a chart on the overview; the question this
 * screen is opened with is "who needs me", and the list should open on the
 * answer rather than requiring a click to get there.
 */
const SORTS = ['attention', 'joined', 'name', 'clients', 'plans', 'revenue'] as const;
type Sort = (typeof SORTS)[number];

const SORT_KEY = {
  attention: 'sort.attention',
  joined: 'sort.joined',
  name: 'sort.name',
  clients: 'sort.clients',
  plans: 'sort.plans',
  revenue: 'sort.revenue',
} as const satisfies Record<Sort, string>;

const TIER_KEY = {
  trial: 'tier.trial',
  starter: 'tier.starter',
  pro: 'tier.pro',
  clinic: 'tier.clinic',
} as const satisfies Record<PlanKey, string>;

const BAND_KEY = {
  dormant: 'band.dormant',
  'at-risk': 'band.at-risk',
  watch: 'band.watch',
  new: 'band.new',
  healthy: 'band.healthy',
} as const satisfies Record<HealthBand, string>;

function compare(sort: Sort, locale: Locale) {
  return (a: ClinicRecord, b: ClinicRecord): number => {
    switch (sort) {
      case 'attention':
        /*
          Worst band first, then by how long it has been quiet. The secondary key
          matters: without it a dozen dormant clinics arrive in whatever order
          the database returned them, and the one that went quiet yesterday sits
          above the one that has been gone since March.
        */
        return (
          healthRank(a.health.band) - healthRank(b.health.band) ||
          (b.health.quietDays ?? Number.MAX_SAFE_INTEGER) -
            (a.health.quietDays ?? Number.MAX_SAFE_INTEGER)
        );
      case 'name':
        // `localeCompare` with the page's own locale, so Arabic sorts as Arabic
        // rather than by code point — which puts أ after ي.
        return a.name.localeCompare(b.name, locale);
      case 'clients':
        return b.clients - a.clients;
      case 'plans':
        return b.plans - a.plans;
      case 'revenue':
        return monthlyPriceOf(b) - monthlyPriceOf(a);
      case 'joined':
      default:
        return b.createdAt.getTime() - a.createdAt.getTime();
    }
  };
}

/**
 * Every practice on the deployment, and how each one is doing.
 *
 * ## What this screen could not answer before
 *
 * It listed name, status, three lifetime counts and a join date. Lifetime counts
 * never go down, so a clinic that stopped working in March looked identical to
 * one working today with the same history — and "which of these is dying" is the
 * only question a platform registry exists to answer.
 *
 * Now every row carries a health band and the reasons behind it, computed in
 * `health.ts` from six aggregates: last plan, last patient, last seen, plans
 * this period against last, staff count, AI usage this month. The list opens
 * sorted by who needs attention.
 *
 * ## Filtering happens here, not in SQL, and that is deliberate
 *
 * Health is derived in JavaScript from rules that are written out and tested. To
 * filter by it in the database those rules would have to be restated as a `where`
 * clause, in a place no unit test can reach, where the two definitions would
 * drift. The set is one row per clinic — the smallest table on the deployment —
 * so filtering after the read costs nothing worth the risk.
 *
 * The **text** search is the exception in reverse: it is a simple name match,
 * and it is also done here so that all four filters compose the same way.
 *
 * ## The row is not a link — only the name is
 *
 * A row-wide target makes the numbers unselectable and turns every stray click
 * into a navigation, which is the wrong trade on a table someone reads across.
 * The search results screen goes the other way, and says why.
 */
export default async function ClinicsPage({ params, searchParams }: ClinicsPageProps) {
  const locale = await resolveLocale(params);
  const query = await searchParams;
  const now = new Date();

  const [t, tPlans, tHealth, tFilters, all] = await Promise.all([
    getTranslations('admin.clinics'),
    getTranslations('admin.plans'),
    getTranslations('admin.health'),
    getTranslations('admin.filters'),
    listClinics(now),
  ]);

  const term = query.q?.trim().toLowerCase() ?? '';
  const band = query.health ?? '';
  const plan = query.plan ?? '';
  const sort: Sort = SORTS.includes(query.sort as Sort) ? (query.sort as Sort) : 'attention';

  const clinics = all
    .filter((clinic) => {
      if (term && !clinic.name.toLowerCase().includes(term)) return false;
      if (band && clinic.health.band !== band) return false;
      if (plan && planOf(clinic.plan).key !== plan) return false;

      return true;
    })
    .sort(compare(sort, locale));

  const money = (minor: number) => formatCurrency(locale, minor / 100);

  return (
    <div className="space-y-4 text-start">
      <header className="space-y-1">
        <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-3xl text-body-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <AdminToolbar
        action={`/${locale}/admin/clinics`}
        path="/admin/clinics"
        searchValue={query.q}
        searchLabel={t('searchLabel')}
        hasFilters={Boolean(term || band || plan || query.sort)}
      >
        <FilterSelect
          name="health"
          label={tFilters('health')}
          value={band}
          options={[
            { value: '', label: tFilters('any') },
            ...HEALTH_BANDS.map((value) => ({ value, label: tHealth(BAND_KEY[value]) })),
          ]}
        />
        <FilterSelect
          name="plan"
          label={tFilters('plan')}
          value={plan}
          options={[
            { value: '', label: tFilters('any') },
            ...PLAN_KEYS.map((value) => ({ value, label: tPlans(TIER_KEY[value]) })),
          ]}
        />
        <FilterSelect
          name="sort"
          label={t('sort.label')}
          value={sort}
          options={SORTS.map((value) => ({ value, label: t(SORT_KEY[value]) }))}
        />
      </AdminToolbar>

      <p className="text-body-sm text-muted-foreground">
        {t('showing', {
          count: formatNumber(locale, clinics.length),
          total: formatNumber(locale, all.length),
        })}
      </p>

      <TableRoot>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.clinic')}</TableHead>
              <TableHead>{t('columns.health')}</TableHead>
              <TableHead>{t('columns.plan')}</TableHead>
              <TableHead numeric>{t('columns.mrr')}</TableHead>
              <TableHead numeric>{t('columns.staff')}</TableHead>
              <TableHead numeric>{t('columns.clients')}</TableHead>
              <TableHead numeric>{t('columns.plans')}</TableHead>
              <TableHead numeric>{t('columns.lastActive')}</TableHead>
              <TableHead numeric>{t('columns.joined')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clinics.length === 0 ? (
              <TableEmpty colSpan={9}>{t('empty')}</TableEmpty>
            ) : (
              clinics.map((clinic) => (
                <TableRow key={clinic.id} zebra>
                  <TableCell className="font-medium">
                    <Link
                      href={`/admin/clinics/${clinic.id}`}
                      className="rounded-sm underline-offset-4 outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {clinic.name}
                    </Link>
                  </TableCell>

                  <TableCell>
                    <ClinicHealthCell health={clinic.health} locale={locale} />
                  </TableCell>

                  <TableCell>
                    <PlanBadge clinic={clinic} now={now} />
                  </TableCell>

                  <TableCell numeric>{money(monthlyPriceOf(clinic))}</TableCell>
                  <TableCell numeric>{formatNumber(locale, clinic.staff)}</TableCell>
                  <TableCell numeric>{formatNumber(locale, clinic.clients)}</TableCell>
                  <TableCell numeric>{formatNumber(locale, clinic.plans)}</TableCell>

                  <TableCell numeric className="whitespace-nowrap text-muted-foreground">
                    {clinic.health.lastActiveAt
                      ? formatDate(locale, clinic.health.lastActiveAt)
                      : t('never')}
                  </TableCell>

                  <TableCell numeric className="whitespace-nowrap text-muted-foreground">
                    {formatDate(locale, clinic.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableRoot>
    </div>
  );
}
