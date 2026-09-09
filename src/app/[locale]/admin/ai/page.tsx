import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DismissibleCallout } from '@/components/ui/dismissible-callout';
import { EmptyState } from '@/components/ui/empty-state';
import {
  byClinic,
  byModel,
  byScope,
  medianDurationByDay,
  summarise,
  unpricedModels,
} from '@/features/admin/ai-usage';
import { PairedLines, RankedBars, TrendArea } from '@/features/admin/components/charts';
import { MetricCard } from '@/features/admin/components/metric-card';
import { UsageBreakdown } from '@/features/admin/components/usage-breakdown';
import { ClinicUsageTable, FailuresTable, KeyedUsageTable } from '@/features/admin/components/usage-tables';
import { UsageRangeTabs } from '@/features/admin/components/usage-range-tabs';
import { formatCost, formatDuration, formatTokens } from '@/features/admin/format';
import { bucketBy, dayKey, dayKeys, parseUsageRange, periodOf } from '@/features/admin/period';
import { countClinics, listGenerations, listRecentFailures } from '@/features/admin/queries';
import { resolveLocale } from '@/i18n/params';
import { getLocaleDirection } from '@/i18n/routing';
import { formatNumber, toIntlLocale } from '@/lib/format';

type AiUsagePageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string }>;
};

export async function generateMetadata({ params }: AiUsagePageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'admin.ai' });
  return { title: t('title') };
}

/** The dash every unavailable figure prints, so there is one of them on the screen. */
const NO_VALUE = '—';

/**
 * What the plan generator costs, per clinic.
 *
 * ## It reads a table that was already there
 *
 * `weekly_plan_generations` has recorded one row per model call since the
 * feature was written — clinic, scope, model, both token counts, duration,
 * status and the provider's error text, for failures as well as successes. Plan
 * review writes to the same table under `scope: 'review'` instead of keeping a
 * ledger of its own. So this screen adds no column and no write path: it is a
 * read, an aggregation, and a page.
 *
 * ## Every figure is honest about what it does not know
 *
 * Two gaps are real and neither is papered over. A model with no rate in
 * `MODEL_RATES` contributes tokens and no cost, and the callout names it. A run
 * that succeeded without reporting tokens is counted separately from one that
 * failed. Both are stated on the page rather than silently folded into a total,
 * because a cost report that looks complete and is not is worse than one that
 * admits its edges.
 *
 * ## How the screen is arranged, and what it stopped doing
 *
 * The first version stacked **nine summary cards in two separate rows** — four
 * `MetricCard`s and then, below the charts, five `UsageTiles` — and three of the
 * nine were the same measure twice. Runs, cost and failures were each printed
 * once with a comparison against the previous window and once again without one,
 * in a different size, three hundred pixels apart. A reader who noticed would
 * have to work out which of the two was authoritative; a reader who did not
 * would take the second as new information.
 *
 * There is one row of six now, all comparable, all the same size: runs, cost,
 * failures, tokens, typical duration, clinics. `UsageTiles` is deleted rather
 * than reduced — every figure it carried is here, with a baseline it never had.
 *
 * The four tables underneath became one tab set. See `UsageBreakdown`.
 */
export default async function AiUsagePage({ params, searchParams }: AiUsagePageProps) {
  const locale = await resolveLocale(params);
  const range = parseUsageRange((await searchParams).range);

  /*
    One clock for the whole render. Reading `new Date()` in each of the queries
    would let a slow first read put the second one's window a millisecond later,
    which is invisible until it is a row appearing in one total and not another.
  */
  const period = periodOf(range, new Date());

  const [t, tAdmin, rows, previousRows, failures, clinics] = await Promise.all([
    getTranslations('admin.ai'),
    getTranslations('admin'),
    listGenerations(period.start),
    /* The window before this one. `all` has none, so this resolves to an empty
       list and every card renders "no earlier period" rather than a delta
       against nothing. */
    period.previousStart
      ? listGenerations(period.previousStart, period.previousEnd)
      : Promise.resolve([]),
    listRecentFailures(period.start),
    countClinics(),
  ]);

  const totals = summarise(rows);
  const previous = summarise(previousRows);
  const clinicRows = byClinic(rows);
  const unpriced = unpricedModels(rows);
  const direction = getLocaleDirection(locale);

  /* `null` on the `all` range, which has no earlier window — every card then
     says so rather than comparing against an empty set and reporting a collapse. */
  const was = <T,>(value: T): T | null => (period.previousStart ? value : null);

  /*
    Clinics that called no model at all. The usage read cannot see them — they
    have no rows — so the difference has to be counted against the clinic table,
    and it is worth saying: a clinic that signed up and has never generated a
    plan is the most actionable thing on this screen.
  */
  const idle = clinics - clinicRows.length;

  const dayLabel = new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  /*
    A point per day including the days nothing ran. A series built only from the
    rows that exist draws a line straight through a quiet week, which makes an
    outage look like ordinary traffic. `all` has no start, so the chart falls
    back to the last 30 days rather than trying to plot the whole history at one
    point per day.
  */
  const chartStart = period.start ?? new Date(period.end.getTime() - 29 * 86_400_000);
  const keys = dayKeys(chartStart, period.end);

  const runsByDay = bucketBy(rows, keys, (row) => dayKey(row.createdAt));
  const failedByDay = bucketBy(
    rows.filter((row) => row.status !== 'ok'),
    keys,
    (row) => dayKey(row.createdAt),
  );

  const dailyPoints = keys.map((key, index) => ({
    label: dayLabel.format(new Date(`${key}T00:00:00Z`)),
    value: runsByDay[index]?.value ?? 0,
    second: failedByDay[index]?.value ?? 0,
  }));

  /*
    The duration trend. Days without runs are dropped by `medianDurationByDay`
    rather than zeroed — see the note there — so this is built from its own
    output instead of from `keys`, and the labels come off the keys it returns.
  */
  const durationPoints = medianDurationByDay(rows, (row) => dayKey(row.createdAt)).map((point) => ({
    label: dayLabel.format(new Date(`${point.key}T00:00:00Z`)),
    /*
      SECONDS on the axis, not the milliseconds the column stores.

      `YAxis` is 32px wide and `allowDecimals={false}`, which is right for the
      counts every other series here plots and impossible for a duration: a tick
      reading 45000 does not fit and renders as a clipped "5000", so the chart
      grew an axis of numbers that were not the numbers. Seconds are two digits
      for anything this generator will plausibly do, and they are also the unit
      the reader thinks in — the card above says "39s", not "39,000".

      The tooltip keeps the precision, off `display` below.
    */
    value: Math.round(point.value / 1000),
    // `display` formatted here rather than passed as a formatter — see `Point`.
    display: formatDuration(locale, point.value) ?? NO_VALUE,
  }));

  /* Spend ranked by clinic, top eight. A ranked bar chart stops being readable
     somewhere around ten rows, and the full list is the table below it. */
  const spend = [...clinicRows]
    .filter((row) => row.costMicroUsd > 0)
    .sort((a, b) => b.costMicroUsd - a.costMicroUsd)
    .slice(0, 8)
    // `display` formatted here rather than passed as a formatter — see `Point`.
    .map((row) => ({
      label: row.clinicName,
      value: row.costMicroUsd,
      display: formatCost(locale, row.costMicroUsd) ?? NO_VALUE,
    }));

  return (
    <div className="space-y-5 text-start">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('title')}</h1>
          <p className="max-w-2xl text-body-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <UsageRangeTabs current={range} locale={locale} />
      </header>

      {unpriced.length > 0 ? (
        /*
          Dismissible, and the id carries the model names. This is a standing
          configuration note — a model the deployment has not priced — so it is
          on the screen every time the range is changed until somebody edits
          `MODEL_RATES`, which is a file, not a button on this page. An operator
          who has read it and filed the work should be able to put it away; an
          operator who has not seen *these* models before still gets told, because
          a different set of names is a different notice. See
          `DismissibleCallout` on why the id must encode what the callout says
          rather than where it appears.
        */
        <DismissibleCallout
          tone="attention"
          noticeId={`admin.ai.unpriced:${[...unpriced].sort().join(',')}`}
          dismissLabel={tAdmin('dismissNotice')}
        >
          {t('unpriced', { models: unpriced.join('، '), count: unpriced.length })}
        </DismissibleCallout>
      ) : null}

      {/*
        One row, six comparable figures. See the note above for the nine-card
        version this replaced.
      */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label={t('cards.runs')}
          value={totals.runs}
          previous={was(previous.runs)}
          locale={locale}
          polarity="neutral"
          icon="ai"
        />
        <MetricCard
          label={t('cards.cost')}
          value={totals.costMicroUsd}
          previous={was(previous.costMicroUsd)}
          locale={locale}
          polarity="up-is-bad"
          icon="bills"
          /*
            Three states, because "what did this cost" has three honest answers
            and only one of them is a plain number.

            Nothing priced at all → a dash. This is the case that sent someone
            looking for a bug: a window whose every run was on an unrated model
            totalled $0.0000, and a zero in a cost column does not read as "not
            known", it reads as "free". The footnote underneath said 13 runs
            could not be priced and was believed less than the big number above
            it, which is what big numbers do.

            Some priced, some not → the figure behind a `≥`. It is a floor, the
            comment below has always said so, and the place to say it is where
            the eye actually lands.

            Everything priced → the figure alone, which is the only time it is
            the whole answer.
          */
          format={(value) => {
            const money = formatCost(locale, value) ?? NO_VALUE;
            if (totals.unpricedRuns === 0) return money;

            return value === 0 ? NO_VALUE : `≥ ${money}`;
          }}
          hint={
            totals.unpricedRuns > 0 ? t('tiles.costFloor', { count: totals.unpricedRuns }) : undefined
          }
        />
        <MetricCard
          label={t('cards.failed')}
          value={totals.failed}
          previous={was(previous.failed)}
          locale={locale}
          polarity="up-is-bad"
          icon="attention"
        />
        <MetricCard
          label={t('tiles.tokens')}
          value={totals.promptTokens + totals.completionTokens}
          previous={was(previous.promptTokens + previous.completionTokens)}
          locale={locale}
          polarity="neutral"
          icon="notes"
          format={(value) => formatTokens(locale, value)}
          hint={t('tiles.tokenSplit', {
            prompt: formatTokens(locale, totals.promptTokens),
            completion: formatTokens(locale, totals.completionTokens),
          })}
        />
        <MetricCard
          label={t('tiles.median')}
          /*
            Null means nothing in the window reported a duration. Zero is the
            only number a card can hold, and it would read as "instant" — the
            hint under it is what says otherwise, and the delta is suppressed
            with the same `null` so a missing median cannot be compared against
            a real one.
          */
          value={totals.medianDurationMs ?? 0}
          previous={totals.medianDurationMs === null ? null : was(previous.medianDurationMs)}
          locale={locale}
          polarity="up-is-bad"
          icon="clock"
          format={(value) => (totals.medianDurationMs === null ? NO_VALUE : formatDuration(locale, value) ?? NO_VALUE)}
          hint={t('tiles.medianHint')}
        />
        <MetricCard
          label={t('cards.clinics')}
          value={clinicRows.length}
          previous={was(byClinic(previousRows).length)}
          locale={locale}
          icon="clinicOutline"
          hint={
            idle > 0
              ? t('idleClinics', { count: idle, total: formatNumber(locale, clinics) })
              : undefined
          }
        />
      </section>

      {/* `items-start`: the two panels hold different amounts and a grid row
          would otherwise stretch the shorter one to the taller one's height,
          leaving a ranked chart floating in a field of white. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2" size="sm">
              {t('charts.daily')}
            </CardTitle>
            <CardDescription>{t('charts.dailyHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            <PairedLines
              data={dailyPoints}
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
            {spend.length === 0 ? (
              /*
                The shared empty state rather than a grey sentence where a chart
                was. A panel that simply loses its contents reads as a failed
                load; this one says which question has no answer yet.
              */
              <EmptyState icon="bills" layout="row" title={t('charts.spendEmpty')} />
            ) : (
              <RankedBars data={spend} direction={direction} seriesLabel={t('cards.cost')} />
            )}
          </CardContent>
        </Card>
        {/*
          How long a call takes, over time.

          The `tiles.median` card above answers "how long does this normally
          take" for the window as a whole, and a single median cannot answer the
          question that actually matters about it — whether that number is
          moving. A platform whose typical generation has gone from twenty-six
          seconds to forty-six has a problem its median describes and does not
          reveal, because both readings are just "a number of seconds" until you
          put them next to each other.

          Full width under the pair above, because a slow drift over weeks is
          read off the horizontal and a half-width panel flattens exactly the
          shape this exists to show.
        */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle as="h2" size="sm">
              {t('charts.duration')}
            </CardTitle>
            <CardDescription>{t('charts.durationHint')}</CardDescription>
          </CardHeader>
          <CardContent>
            {durationPoints.length < 2 ? (
              /*
                One point is not a trend, and a chart drawn through it invites a
                reading it cannot support. Two is the minimum that can slope.
              */
              <EmptyState icon="clock" layout="row" title={t('charts.durationEmpty')} />
            ) : (
              <TrendArea
                data={durationPoints}
                direction={direction}
                seriesLabel={t('tiles.median')}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <UsageBreakdown
        ariaLabel={t('tabsLabel')}
        clinicLabel={t('byClinic')}
        modelLabel={t('byModel')}
        scopeLabel={t('byScope')}
        failuresLabel={t('failures.heading')}
        failureCount={failures.length}
        clinic={<ClinicUsageTable rows={clinicRows} locale={locale} />}
        model={<KeyedUsageTable rows={byModel(rows)} locale={locale} heading={t('columns.model')} />}
        scope={
          <KeyedUsageTable
            rows={byScope(rows)}
            locale={locale}
            heading={t('columns.scope')}
            /*
              A scope is a closed set, so it is translated. An unrecognised value
              would be a column the schema grew without this screen hearing
              about it; printing the raw key is the honest answer to that, and
              better than a missing-message error over a whole table.
            */
            labelFor={(key) => (t.has(`scopes.${key}` as 'scopes.week') ? t(`scopes.${key}` as 'scopes.week') : key)}
          />
        }
        failures={<FailuresTable rows={failures} locale={locale} />}
      />
    </div>
  );
}
