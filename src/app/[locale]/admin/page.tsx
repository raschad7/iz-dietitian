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
import { CountBars, TrendArea } from '@/features/admin/components/charts';
import { ClinicHealthCell } from '@/features/admin/components/clinic-status';
import { MetricCard, Standing } from '@/features/admin/components/metric-card';
import { UsageRangeTabs } from '@/features/admin/components/usage-range-tabs';
import { needsAttention } from '@/features/admin/health';
import { parseUsageRange, periodOf } from '@/features/admin/period';
import { getPlatformOverview, listClinics } from '@/features/admin/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { getLocaleDirection } from '@/i18n/routing';
import { formatDate, formatDateLtr, formatNumber, toIntlLocale } from '@/lib/format';

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
 * **The attention queue is first.** It is the only part of this screen that
 * names a specific clinic and a specific reason, so it goes above the figures
 * rather than under them. It is deliberately narrower than "everything not
 * healthy": a queue that lists every new signup is a queue the operator learns
 * to scroll past.
 *
 * **The charts are real charts.** Signups per month and plans per day, drawn
 * through the app's own Recharts wrapper in the `viz-*` ramp, RTL-aware. The
 * hand-rolled `<div>` with an inline pixel height was defensible for six bars
 * and stopped being so the moment the screen wanted ninety points.
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

  const [t, overview, clinics, recentAudit] = await Promise.all([
    getTranslations('admin.overview'),
    getPlatformOverview(period),
    listClinics(now),
    listAuditEntries({ limit: 6 }),
  ]);

  const tAudit = await getTranslations('admin.audit');
  const direction = getLocaleDirection(locale);

  const queue = clinics
    .filter((clinic) => needsAttention(clinic, clinic.health))
    .sort((a, b) => (b.health.quietDays ?? Infinity) - (a.health.quietDays ?? Infinity))
    .slice(0, 8);

  /* Axis ticks are formatted here, on the server, so the chart components never
     need to know what a locale is. See the header of `charts.tsx`. */
  const monthLabel = new Intl.DateTimeFormat(toIntlLocale(locale), {
    month: 'short',
    /* UTC, because the bucket keys are UTC month starts — see `monthKeys`.
       Formatting them in `DISPLAY_TIME_ZONE` would shift a key like `2026-03`
       back into February for anyone west of it and mislabel the whole axis. */
    timeZone: 'UTC',
  });
  const dayLabel = new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  const signupPoints = overview.signups.map((row) => ({
    label: monthLabel.format(new Date(`${row.key}-01T00:00:00Z`)),
    value: row.value,
  }));

  const planPoints = overview.planSeries.map((row) => ({
    label: dayLabel.format(new Date(`${row.key}T00:00:00Z`)),
    value: row.value,
  }));

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
        The queue is above the figures on purpose. It is the only block on this
        screen that names a clinic and a reason — everything below it is context
        for a decision this list has already identified.
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t('cards.signups')}
          value={overview.clinics.joined.value}
          previous={overview.clinics.joined.previous}
          locale={locale}
          hint={t('cards.signupsHint', { total: formatNumber(locale, overview.clinics.total) })}
          href="/admin/clinics"
          icon="clinicOutline"
        />
        <MetricCard
          label={t('cards.plans')}
          value={overview.plans.created.value}
          previous={overview.plans.created.previous}
          locale={locale}
          hint={t('cards.plansHint', { total: formatNumber(locale, overview.plans.total) })}
          icon="weeklyPlans"
        />
        <MetricCard
          label={t('cards.ai')}
          value={overview.generations.runs.value}
          previous={overview.generations.runs.previous}
          locale={locale}
          /*
            Neutral, not "up is good". More model calls is more work getting
            done and more money going out at the same time, and a card that
            tinted it green would be picking one of the two for the reader.
          */
          polarity="neutral"
          href="/admin/ai"
          icon="ai"
        />
        <MetricCard
          label={t('cards.failures')}
          value={overview.generations.failed.value}
          previous={overview.generations.failed.previous}
          locale={locale}
          polarity="up-is-bad"
          href="/admin/ai"
          icon="attention"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel heading={t('charts.signups')} description={t('charts.signupsSeries')}>
          <CountBars
            data={signupPoints}
            direction={direction}
            seriesLabel={t('charts.signupsSeries')}
            /* The last month is still being filled. Drawn one step down the
               sequential ramp so a partial bar does not read as a collapse. */
            highlightLast
          />
        </Panel>

        <Panel heading={t('charts.plans')} description={t('charts.plansSeries')}>
          <TrendArea data={planPoints} direction={direction} seriesLabel={t('charts.plansSeries')} />
        </Panel>
      </div>

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
