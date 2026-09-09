import { getTranslations } from 'next-intl/server';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { listAuditEntries } from '@/features/admin/audit';
import { AuditLine } from '@/features/admin/components/audit-table';
import { TrendArea } from '@/features/admin/components/charts';
import { ClinicHealthCell } from '@/features/admin/components/clinic-status';
import { MetricCard, Standing } from '@/features/admin/components/metric-card';
import { UsageRangeTabs } from '@/features/admin/components/usage-range-tabs';
import { needsAttention } from '@/features/admin/health';
import { loadPlanCatalog } from '@/features/admin/plan-catalog';
import { summariseStanding } from '@/features/admin/overview-summary';
import { parseUsageRange, periodOf } from '@/features/admin/period';
import { getPlatformOverview, listClinics } from '@/features/admin/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { getLocaleDirection } from '@/i18n/routing';
import { formatCurrency, formatDate, formatDateLtr, formatNumber, toIntlLocale } from '@/lib/format';

type AdminOverviewPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string }>;
};

/**
 * One block of the overview, as a card.
 *
 * Composed from the shared `Card` anatomy rather than a hand-rolled heading row:
 * `CardHeader` already owns the title/description/action grid, so a panel that
 * has something to say under its heading gets the same rhythm as every other
 * card in the product instead of a second `space-y` stack invented here.
 */
function Panel({
  heading,
  description,
  action,
  children,
}: {
  heading: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle as="h2" size="sm">
          {heading}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * The platform at a glance — and, above all, the queue of what to do about it.
 *
 * ## What changed, and why
 *
 * The first version of this screen printed twenty-seven live counts and nothing
 * else. Every figure was correct and the screen was close to useless: a count
 * with no baseline cannot be acted on, so the operator had to remember last week
 * to make anything of this week, and nothing on the page said which of seventeen
 * clinics needed them today.
 *
 * Three things replaced that.
 *
 * **Windowed figures now come in pairs.** Each card carries the equally-long
 * previous period and shows the delta. The range picker at the top drives both
 * halves, so "last 7 days" is compared against the 7 before it and not against a
 * fixed month.
 *
 * **The charts are real charts**, drawn through the app's own Recharts wrapper
 * in the `viz-*` ramp, RTL-aware. The hand-rolled `<div>` with an inline pixel
 * height was defensible for six bars and stopped being so the moment the screen
 * wanted ninety points.
 *
 * ## The second rewrite: standing before exceptions
 *
 * The screen still did not answer "how is the platform doing". Its headline row
 * was clinics joined, plans written, model calls and failed calls — activity,
 * three-quarters of it vanity in the strict sense: totals that only climb and
 * that no decision hangs on. Two of the four also restated the AI screen. And
 * the money, the one thing a platform owner opens this panel for, was on
 * another page entirely.
 *
 * So the row is now recurring revenue, the share of it attached to a clinic
 * that has stopped, the trials that need a call this week, and how many
 * practices ever actually started. `summariseStanding` derives all of it from
 * the clinic list the queue already loads, so the answer costs no query and
 * cannot disagree with the rows underneath it.
 *
 * **The attention queue moved one step down.** It was first, and leading with
 * the exceptions meant opening the panel to a list of problems with no sense of
 * the scale they were problems against. Standing, then who needs you — which is
 * the order the two questions get asked in. It is still deliberately narrower
 * than "everything not healthy": a queue that lists every new signup is a queue
 * the operator learns to scroll past.
 *
 * **Signups-by-month was deleted.** On a deployment with a handful of clinics it
 * is one bar and five empty months; a monthly bucket needs more rows than that
 * before its shape says anything. Plans per day survives being read at this
 * size and took the width.
 *
 * ## One figure was deleted rather than fixed
 *
 * The old "failed sign-ins, last 24h" tile counted `auth_attempts`, a table
 * `recordAttempt` prunes to one hour on every write and `clearAttempts` empties
 * for an address the moment it signs in. It read near-zero during an attack that
 * ended an hour earlier. See the note in `getPlatformOverview`.
 */
export default async function AdminOverviewPage({ params, searchParams }: AdminOverviewPageProps) {
  const locale = await resolveLocale(params);
  const range = parseUsageRange((await searchParams).range);

  /*
    One clock for the render, so every window on the page — the metric pair, the
    health rules, the charts — is measured from the same instant. Reading
    `new Date()` inside each query would let a slow first read put the second
    one's boundary a millisecond later, which is invisible until it is a row
    appearing in one total and not another.
  */
  const now = new Date();
  const period = periodOf(range, now);

  const [t, overview, clinics, recentAudit, catalog] = await Promise.all([
    getTranslations('admin.overview'),
    getPlatformOverview(period),
    listClinics(now),
    listAuditEntries({ limit: 6 }),
    loadPlanCatalog(),
  ]);

  const tAudit = await getTranslations('admin.audit');
  const direction = getLocaleDirection(locale);

  const queue = clinics
    .filter((clinic) => needsAttention(clinic, clinic.health))
    .sort((a, b) => (b.health.quietDays ?? Infinity) - (a.health.quietDays ?? Infinity))
    .slice(0, 8);

  /* Axis ticks are formatted here, on the server, so the chart components never
     need to know what a locale is. See the header of `charts.tsx`. */
  const dayLabel = new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  const planPoints = overview.planSeries.map((row) => ({
    label: dayLabel.format(new Date(`${row.key}T00:00:00Z`)),
    value: row.value,
  }));

  /*
    Read off the same clinic list the queue above is built from, so the figures
    and the names underneath them can never disagree. See `summariseStanding`.
  */
  const standing = summariseStanding(catalog, clinics, now);

  /* Minor units to a shekel amount, the revenue screen's own one-liner. */
  const money = (minor: number) => formatCurrency(locale, minor / 100);

  return (
    <div className="space-y-6 text-start">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('heading')}</h1>
          <p className="max-w-2xl text-body-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <UsageRangeTabs current={range} locale={locale} basePath="/admin" />
      </header>

      {/*
        The standing, not the activity.

        This row used to be clinics joined, plans written, model calls and
        failed calls. Three of those are the shape the dashboard literature
        calls a vanity metric — a total that only climbs, that reads as
        information and changes no decision. "Plans written: 8" is true and
        inert. Two of them also restated the AI screen, which owns that subject
        and says more about it.

        What replaces them is the question the operator actually opened the
        panel with: is the business alright. Recurring revenue and what share of
        it is attached to a clinic that has stopped; the trials that need a
        conversation this week; whether the practices who signed up ever
        started. Each of the four is a number someone would act on.

        None of it costs a query — every figure is arithmetic over the clinic
        list the attention queue below was already loading. See
        `summariseStanding`.
      */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t('standing.mrr')}
          value={standing.monthlyMinor}
          locale={locale}
          format={money}
          hint={t('standing.mrrHint', {
            paying: formatNumber(locale, standing.payingClinics),
            live: formatNumber(locale, standing.liveClinics),
          })}
          href="/admin/revenue"
          icon="bills"
          pointInTime
        />
        <MetricCard
          label={t('standing.atRisk')}
          value={standing.atRiskMinor}
          locale={locale}
          format={money}
          polarity="up-is-bad"
          /*
            The figure the old screen could not state. "1 clinic at risk" is a
            count of rows; this is what stops arriving if nobody calls them.
          */
          hint={
            standing.atRiskClinics === 0
              ? t('standing.atRiskNone')
              : t('standing.atRiskHint', { count: formatNumber(locale, standing.atRiskClinics) })
          }
          href="/admin/clinics"
          icon="attention"
          pointInTime
        />
        <MetricCard
          label={t('standing.trials')}
          /*
            Ending AND already expired, together.

            Leading with "ending" alone put a 0 on this card on a day a trial
            had expired that morning — the single most actionable state the
            platform can be in, reported as nothing to do, because it had
            crossed from "about to need a decision" into "needed one
            yesterday". Both are the same job. The split is in the hint.
          */
          value={standing.trialsEnding + standing.trialsExpired}
          locale={locale}
          polarity="neutral"
          hint={t('standing.trialsHint', {
            ending: formatNumber(locale, standing.trialsEnding),
            expired: formatNumber(locale, standing.trialsExpired),
            running: formatNumber(locale, standing.trialsRunning),
          })}
          href="/admin/clinics"
          icon="clock"
          pointInTime
        />
        <MetricCard
          label={t('standing.activated')}
          value={standing.activatedClinics}
          locale={locale}
          hint={t('standing.activatedHint', { live: formatNumber(locale, standing.liveClinics) })}
          href="/admin/clinics"
          icon="clinicOutline"
          pointInTime
        />
      </section>

      {/*
        The queue, one step down the page.

        It led the screen before, and leading with the exceptions meant opening
        the panel every morning to a list of problems with no sense of the scale
        they were problems against. The standing above answers "how are we", and
        this answers "who needs me" — that is the order the two questions are
        actually asked in, and the queue is still the first thing with a name in
        it.
      */}
      <Panel
        heading={t('queue.heading')}
        description={t('queue.hint')}
        action={
          <Link
            href="/admin/clinics"
            className="rounded-sm text-body-sm underline-offset-4 outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('queue.all')}
          </Link>
        }
      >
        {queue.length === 0 ? (
          <EmptyState
            icon="check"
            layout="row"
            title={t('queue.empty')}
            description={t('queue.emptyHint')}
          />
        ) : (
          <TableRoot>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('queue.columns.clinic')}</TableHead>
                  <TableHead>{t('queue.columns.health')}</TableHead>
                  <TableHead numeric>{t('queue.columns.lastActive')}</TableHead>
                  <TableHead numeric>{t('queue.columns.clients')}</TableHead>
                  <TableHead numeric>{t('queue.columns.plans')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((clinic) => (
                  <TableRow key={clinic.id}>
                    <TableCell>
                      <Link
                        href={`/admin/clinics/${clinic.id}`}
                        className="rounded-sm font-medium underline-offset-4 outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {clinic.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <ClinicHealthCell health={clinic.health} locale={locale} />
                    </TableCell>
                    <TableCell numeric className="text-muted-foreground whitespace-nowrap">
                      {clinic.health.lastActiveAt
                        ? formatDateLtr(locale, clinic.health.lastActiveAt)
                        : t('queue.never')}
                    </TableCell>
                    <TableCell numeric>{formatNumber(locale, clinic.clients)}</TableCell>
                    <TableCell numeric>{formatNumber(locale, clinic.plans)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableRoot>
        )}
      </Panel>

      {/*
        One chart, not two.

        The pair that was here included signups by month, which on this
        deployment is a single bar and five empty months of axis — a monthly
        bucket needs more than a handful of rows before its shape means
        anything, and drawing it anyway is the "wrong chart for the data" that
        every dashboard post-mortem lists. Plans per day is the platform's
        actual pulse and survives being read at this size, so it gets the width
        the two of them were sharing.
      */}
      <Panel heading={t('charts.plans')} description={t('charts.plansSeries')}>
        <TrendArea data={planPoints} direction={direction} seriesLabel={t('charts.plansSeries')} />
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel heading={t('clinics.heading')}>
          <dl>
            <Standing label={t('clinics.active')} value={overview.clinics.active} locale={locale} />
            <Standing
              label={t('clinics.onboarding')}
              value={overview.clinics.onboarding}
              locale={locale}
            />
            <Standing
              label={t('clinics.suspended')}
              value={overview.clinics.suspended}
              locale={locale}
              tone="attention"
            />
            {/*
              Demoted from the headline row rather than deleted: joining is
              worth knowing and is not worth the largest type on the screen.
            */}
            <Standing label={t('cards.signups')} value={overview.clinics.joined.value} locale={locale} />
            {/*
              `overLimits` has been computed for every clinic since the health
              rules were written and has never been shown anywhere. It is the
              upsell list, and it was free.
            */}
            <Standing
              label={t('clinics.overLimit')}
              value={standing.overLimitClinics}
              locale={locale}
              /* `Standing` only tints a non-zero, so this needs no ternary. */
              tone="attention"
            />
          </dl>
        </Panel>

        <Panel heading={t('accounts.heading')}>
          <dl>
            <Standing label={t('accounts.staff')} value={overview.accounts.staff} locale={locale} />
            <Standing label={t('accounts.clients')} value={overview.accounts.clients} locale={locale} />
            <Standing label={t('accounts.admins')} value={overview.accounts.admins} locale={locale} />
            <Standing
              label={t('accounts.disabled')}
              value={overview.accounts.disabled}
              locale={locale}
              tone="attention"
            />
          </dl>
        </Panel>

        <Panel heading={t('health.heading')}>
          <dl>
            <Standing
              label={t('health.whatsappConnected')}
              value={overview.whatsapp.connected}
              locale={locale}
            />
            <Standing
              label={t('health.whatsappConfigured')}
              value={overview.whatsapp.configured}
              locale={locale}
            />
            <Standing
              label={t('health.appointments')}
              value={overview.appointments.booked.value}
              locale={locale}
            />
            <Standing label={t('cards.plans')} value={overview.plans.created.value} locale={locale} />
          </dl>
          {/*
            The gap between configured and connected is the actionable number,
            so it is stated rather than left to be subtracted by eye.
          */}
          {overview.whatsapp.configured > overview.whatsapp.connected ? (
            <p className="text-caption text-status-attention-fg">
              {t('health.whatsappGap', {
                count: formatNumber(
                  locale,
                  overview.whatsapp.configured - overview.whatsapp.connected,
                ),
              })}
            </p>
          ) : null}
        </Panel>
      </div>

      <Panel
        heading={tAudit('recent')}
        action={
          <Link
            href="/admin/audit"
            className="rounded-sm text-body-sm underline-offset-4 outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tAudit('viewAll')}
          </Link>
        }
      >
        {recentAudit.length === 0 ? (
          <EmptyState icon="history" layout="row" title={tAudit('empty')} />
        ) : (
          /*
            Ruled rows rather than a bare list: six entries whose lines are all
            different lengths need something saying where one ends, and the rule
            is quieter than the card-per-entry the alternative would be. The
            first and last shed their padding so the column sits flush inside the
            card rather than floating in it.
          */
          <ul className="divide-y divide-border">
            {recentAudit.map((entry) => (
              <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                <AuditLine entry={entry} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/*
        A closing line rather than a badge on every figure: the whole screen is
        measured over one window, and saying so once is clearer than saying it
        five times.
      */}
      <p className="text-caption text-muted-foreground">
        {period.previousStart
          ? t('footnote', {
              from: formatDate(locale, period.previousStart),
              to: formatDate(locale, period.end),
            })
          : t('footnoteAll')}
      </p>
    </div>
  );
}
