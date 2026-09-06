import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DismissibleCallout } from '@/components/ui/dismissible-callout';
import { AuditLine } from '@/features/admin/components/audit-table';
import { PairedLines, RankedBars, TrendArea } from '@/features/admin/components/charts';
import { GlobalSearch } from '@/features/admin/components/global-search';
import { MetricCard } from '@/features/admin/components/metric-card';
import { UsageBreakdown } from '@/features/admin/components/usage-breakdown';
import { UsageRangeTabs } from '@/features/admin/components/usage-range-tabs';
import {
  ClinicUsageTable,
  FailuresTable,
  KeyedUsageTable,
} from '@/features/admin/components/usage-tables';
import { formatCost, formatDuration, formatTokens } from '@/features/admin/format';
import { resolveLocale } from '@/i18n/params';
import { getLocaleDirection } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';

import {
  FIXTURE_AUDIT,
  FIXTURE_CLINIC_USAGE,
  FIXTURE_DAILY,
  FIXTURE_FAILURES,
  FIXTURE_MODEL_USAGE,
  FIXTURE_PREVIOUS,
  FIXTURE_SCOPE_USAGE,
  FIXTURE_SPEND_MANY,
  FIXTURE_SPEND_ONE,
  FIXTURE_TOTALS,
} from './fixture';

type DevAdminPageProps = {
  params: Promise<{ locale: string }>;
};

const NO_VALUE = '—';

/**
 * A dev-only harness for the platform area's surfaces.
 *
 * The same reasoning `/dev/board` and `/dev/measurements` write down, and it
 * bites harder here than anywhere else in the product: every screen under
 * `/admin` sits behind `requireAdminSession`, which grants nothing to a
 * dietitian and nothing to a client — so the metric row, the ranked spend chart,
 * the activity feed and the four-way usage tab set were the surfaces **nobody
 * could look at while changing them**, in either language, at any width.
 *
 * That is not a hypothetical cost. The ranked bar chart shipped drawing a single
 * charcoal rectangle two hundred pixels tall whenever the window held one
 * clinic, and the global search box shipped with its magnifier printed on top of
 * its own Arabic placeholder. Both are obvious in a screenshot and invisible in
 * a diff.
 *
 * ## What it is allowed to do
 *
 * Nothing but render. Dev-only — `notFound()` in production — and **no data
 * access and no session guard, and it must never acquire either**: the same
 * contract as `/dev/board`, `/dev/meals`, `/dev/dishes` and `/dev/ui`. The rows
 * come from `fixture.ts`, shaped like the reads return them.
 *
 * The fixture leans on the awkward cases on purpose — one bar, a rise from zero,
 * a null median, an unpriced model, a refused action, a clinic name too long for
 * an axis. Those are the states that break a layout, and tidy sample data is how
 * they get missed.
 */
export default async function DevAdminPage({ params }: DevAdminPageProps) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const locale = await resolveLocale(params);
  const direction = getLocaleDirection(locale);

  const t = await getTranslations('admin.ai');
  const tAdmin = await getTranslations('admin');
  const tAudit = await getTranslations('admin.audit');
  const tOverview = await getTranslations('admin.overview');

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 p-5 text-start">
      <GlobalSearch locale={locale} />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('title')}</h1>
          <p className="max-w-2xl text-body-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <UsageRangeTabs current="30d" locale={locale} />
      </header>

      <DismissibleCallout
        tone="attention"
        noticeId="dev.admin.unpriced"
        dismissLabel={tAdmin('dismissNotice')}
      >
        {t('unpriced', { models: 'gpt-5.6-luna', count: 1 })}
      </DismissibleCallout>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label={t('cards.runs')}
          value={FIXTURE_TOTALS.runs}
          previous={FIXTURE_PREVIOUS.runs}
          locale={locale}
          polarity="neutral"
          icon="ai"
        />
        <MetricCard
          label={t('cards.cost')}
          value={FIXTURE_TOTALS.costMicroUsd}
          previous={FIXTURE_PREVIOUS.costMicroUsd}
          locale={locale}
          polarity="up-is-bad"
          icon="bills"
          format={(value) => formatCost(locale, value) ?? NO_VALUE}
          hint={t('tiles.costFloor', { count: FIXTURE_TOTALS.unpricedRuns })}
        />
        <MetricCard
          label={t('cards.failed')}
          value={FIXTURE_TOTALS.failed}
          previous={FIXTURE_PREVIOUS.failed}
          locale={locale}
          polarity="up-is-bad"
          icon="attention"
        />
        <MetricCard
          label={t('tiles.tokens')}
          value={FIXTURE_TOTALS.promptTokens + FIXTURE_TOTALS.completionTokens}
          previous={FIXTURE_PREVIOUS.promptTokens + FIXTURE_PREVIOUS.completionTokens}
          locale={locale}
          polarity="neutral"
          icon="notes"
          format={(value) => formatTokens(locale, value)}
          hint={t('tiles.tokenSplit', {
            prompt: formatTokens(locale, FIXTURE_TOTALS.promptTokens),
            completion: formatTokens(locale, FIXTURE_TOTALS.completionTokens),
          })}
        />
        <MetricCard
          label={t('tiles.median')}
          value={FIXTURE_TOTALS.medianDurationMs ?? 0}
          previous={FIXTURE_PREVIOUS.medianDurationMs}
          locale={locale}
          polarity="up-is-bad"
          icon="clock"
          format={(value) => formatDuration(locale, value) ?? NO_VALUE}
          hint={t('tiles.medianHint')}
        />
        <MetricCard
          label={t('cards.clinics')}
          value={FIXTURE_CLINIC_USAGE.length}
          previous={null}
          locale={locale}
          icon="clinicOutline"
          hint={t('idleClinics', { count: 1, total: formatNumber(locale, 3) })}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2" size="sm">
              {t('charts.daily')}
            </CardTitle>
            <CardDescription>{t('charts.dailyHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <PairedLines
              data={FIXTURE_DAILY}
              direction={direction}
              firstLabel={t('charts.runs')}
              secondLabel={t('charts.failed')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2" size="sm">
              {t('charts.spend')}
            </CardTitle>
            <CardDescription>{t('charts.spendHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* The single-row case, which is the one that used to draw a slab. */}
            <RankedBars data={FIXTURE_SPEND_ONE} direction={direction} seriesLabel={t('cards.cost')} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2" size="sm">
              {t('charts.spend')}
            </CardTitle>
            <CardDescription>{t('charts.spendHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars data={FIXTURE_SPEND_MANY} direction={direction} seriesLabel={t('cards.cost')} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2" size="sm">
              {tAudit('recent')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {FIXTURE_AUDIT.map((entry) => (
                <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                  <AuditLine entry={entry} locale={locale} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2" size="sm">
            {tOverview('charts.plans')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TrendArea
            data={FIXTURE_DAILY}
            direction={direction}
            seriesLabel={tOverview('charts.plansSeries')}
          />
        </CardContent>
      </Card>

      <UsageBreakdown
        ariaLabel={t('tabsLabel')}
        clinicLabel={t('byClinic')}
        modelLabel={t('byModel')}
        scopeLabel={t('byScope')}
        failuresLabel={t('failures.heading')}
        failureCount={FIXTURE_FAILURES.length}
        clinic={<ClinicUsageTable rows={FIXTURE_CLINIC_USAGE} locale={locale} />}
        model={
          <KeyedUsageTable rows={FIXTURE_MODEL_USAGE} locale={locale} heading={t('columns.model')} />
        }
        scope={
          <KeyedUsageTable
            rows={FIXTURE_SCOPE_USAGE}
            locale={locale}
            heading={t('columns.scope')}
            labelFor={(key) =>
              t.has(`scopes.${key}` as 'scopes.week') ? t(`scopes.${key}` as 'scopes.week') : key
            }
          />
        }
        failures={<FailuresTable rows={FIXTURE_FAILURES} locale={locale} />}
      />
    </main>
  );
}
