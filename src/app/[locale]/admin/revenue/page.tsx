import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DismissibleCallout } from '@/components/ui/dismissible-callout';
import { EmptyState } from '@/components/ui/empty-state';
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
import { RankedBars } from '@/features/admin/components/charts';
import { PlanBadge } from '@/features/admin/components/clinic-status';
import { MetricCard } from '@/features/admin/components/metric-card';
import { isConversionCandidate } from '@/features/admin/health';
import {
  annualRunRateMinor,
  averageRevenueMinor,
  monthlyPriceOf,
  monthlyRecurringMinor,
  planBreakdown,
  planNameOf,
  planOf,
} from '@/features/admin/plans';
import { loadPlanCatalog } from '@/features/admin/plan-catalog';
import { getRevenue, listClinics } from '@/features/admin/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { getLocaleDirection } from '@/i18n/routing';
import { formatCurrency, formatNumber } from '@/lib/format';

type RevenuePageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: RevenuePageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'admin.revenue' });
  return { title: t('title') };
}

/** Tier to message key, written out rather than templated. See `BAND_KEY`. */
/**
 * What the platform earns.
 *
 * ## Two kinds of money, kept apart on purpose
 *
 * The deployment has a billing ledger already, and it is **not** this. That one
 * records what a clinic charges its own patients — cash in the room, typed in
 * afterwards. This screen is what the *clinic* pays the *platform*, which until
 * now had no representation in the data model at all.
 *
 * Both are on the page because both are worth knowing, and the second is
 * labelled at length so nobody adds them together. A clinic collecting ₪ 8,000 a
 * month from its patients is a clinic that can afford a plan; that is a sales
 * signal, not revenue.
 *
 * ## MRR excludes suspended clinics
 *
 * Counting a practice the platform has switched off would make the figure go up
 * when the service stops working for someone, which is the exact wrong
 * direction. Trials contribute nothing because their price is zero, not because
 * the tier is special-cased — give a trial a price and it counts, which is
 * correct and one fewer rule to remember.
 *
 * ## The upgrade queue is the point of the screen
 *
 * A total is something to look at. "These four clinics are on a free plan, have
 * patients on the books and wrote plans this month" is something to do. It is
 * the mirror of the overview's attention queue: that one lists who is leaving,
 * this one lists who is ready to pay.
 */
export default async function RevenuePage({ params }: RevenuePageProps) {
  const locale = await resolveLocale(params);
  const now = new Date();
  const direction = getLocaleDirection(locale);

  const [t, tPlans, tAdmin, revenue, clinics, catalog] = await Promise.all([
    getTranslations('admin.revenue'),
    getTranslations('admin.plans'),
    getTranslations('admin'),
    getRevenue(),
    listClinics(now),
    loadPlanCatalog(),
  ]);

  const mrr = monthlyRecurringMinor(catalog, revenue.clinics);
  const paying = revenue.clinics.filter(
    (clinic) => !clinic.suspendedAt && monthlyPriceOf(catalog, clinic) > 0,
  );
  const breakdown = planBreakdown(catalog, revenue.clinics);

  const money = (minor: number) => formatCurrency(locale, minor / 100);

  const candidates = clinics.filter((clinic) =>
    isConversionCandidate(clinic, clinic.activity, clinic.health, planOf(catalog, clinic.plan)),
  );

  /* Ranked by what each clinic moves through its own ledger — the sales signal,
     not platform revenue. Top eight, because a ranked bar chart stops being
     readable somewhere around ten rows and the tail is not the question. */
  const flow = [...clinics]
    .filter((clinic) => clinic.collectedMinor > 0)
    .sort((a, b) => b.collectedMinor - a.collectedMinor)
    .slice(0, 8)
    // `display` is formatted here, on the server: the chart component knows
    // nothing about locales and cannot be handed a formatter. See `Point`.
    .map((clinic) => ({
      label: clinic.name,
      value: clinic.collectedMinor,
      display: money(clinic.collectedMinor),
    }));

  return (
    <div className="space-y-6 text-start">
      <header className="space-y-1">
        <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-3xl text-body-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {revenue.unknownPlans.length > 0 ? (
        /*
          A clinic holding a plan string this build does not know. It is charged
          the default tier's price by `planOf`, which would otherwise be a silent
          discount — so it is stated rather than absorbed.
        */
        <DismissibleCallout
          tone="attention"
          /* The id names the plans, not the screen: a *different* unknown plan
             string is a different warning and must not be silenced by a click
             made about the last one. See `DismissibleCallout`. */
          noticeId={`admin.revenue.unknownPlan:${[...revenue.unknownPlans].sort().join(',')}`}
          dismissLabel={tAdmin('dismissNotice')}
        >
          {t('unknownPlan', { plans: revenue.unknownPlans.join('، ') })}
        </DismissibleCallout>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/*
          `previous={null}` on all four: the platform does not yet keep a history
          of what MRR was last month, so there is no honest baseline to compare
          against. The card renders "no earlier period" rather than inventing
          one. Recording a monthly snapshot is the feature that would fix it, and
          it is a feature — not a line on this page.
        */}
        <MetricCard
          label={t('mrr')}
          value={mrr}
          previous={null}
          locale={locale}
          format={money}
          hint={t('suspendedExcluded')}
          icon="bills"
        />
        <MetricCard
          label={t('arr')}
          value={annualRunRateMinor(mrr)}
          previous={null}
          locale={locale}
          format={money}
          icon="trend"
        />
        <MetricCard
          label={t('arpa')}
          value={averageRevenueMinor(catalog, revenue.clinics)}
          previous={null}
          locale={locale}
          format={money}
          icon="recordPayment"
        />
        <MetricCard
          label={t('paying')}
          value={paying.length}
          previous={null}
          locale={locale}
          hint={t('columns.clinic')}
          href="/admin/clinics"
          icon="clinicOutline"
        />
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2" size="sm">
              {t('byTier')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TableRoot>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tPlans('label')}</TableHead>
                    <TableHead numeric>{t('columns.clinic')}</TableHead>
                    <TableHead numeric>{t('columns.price')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdown.map((row) => (
                    <TableRow key={row.plan.key}>
                      <TableCell>
                        {planNameOf(row.plan, locale)}
                        <span className="block text-caption text-muted-foreground" dir="ltr">
                          {money(row.plan.monthlyPriceMinor)}
                        </span>
                      </TableCell>
                      <TableCell numeric>{formatNumber(locale, row.clinics)}</TableCell>
                      <TableCell numeric>{money(row.monthlyMinor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableRoot>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2" size="sm">
              {t('clinicFlow')}
            </CardTitle>
            <CardDescription>{t('clinicFlowHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            {flow.length === 0 ? (
              <EmptyState icon="bills" layout="row" title={t('pipelineEmpty')} />
            ) : (
              <RankedBars data={flow} direction={direction} seriesLabel={t('collected')} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" size="sm">
            {t('pipeline')}
          </CardTitle>
          <CardDescription className="max-w-3xl">{t('pipelineHint')}</CardDescription>
        </CardHeader>
        <CardContent>
          <TableRoot>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.clinic')}</TableHead>
                  <TableHead>{t('columns.plan')}</TableHead>
                  <TableHead numeric>{t('columns.billed')}</TableHead>
                  <TableHead numeric>{t('columns.collected')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.length === 0 ? (
                  <TableEmpty colSpan={4}>{t('pipelineEmpty')}</TableEmpty>
                ) : (
                  candidates.map((clinic) => (
                    <TableRow key={clinic.id}>
                      <TableCell>
                        <Link
                          href={`/admin/clinics/${clinic.id}`}
                          className="rounded-sm font-medium underline-offset-4 outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {clinic.name}
                        </Link>
                        <span className="block text-caption text-muted-foreground">
                          {t('columns.clinic')} ·{' '}
                          {formatNumber(locale, clinic.clients)} · {formatNumber(locale, clinic.plans)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <PlanBadge
                          clinic={clinic}
                          plan={planOf(catalog, clinic.plan)}
                          locale={locale}
                          now={now}
                        />
                      </TableCell>
                      <TableCell numeric>{money(clinic.billedMinor)}</TableCell>
                      <TableCell numeric>{money(clinic.collectedMinor)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableRoot>
        </CardContent>
      </Card>
    </div>
  );
}
