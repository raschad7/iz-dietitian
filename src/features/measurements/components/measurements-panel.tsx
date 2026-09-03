import { getTranslations } from 'next-intl/server';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatGrid, StatTile } from '@/components/ui/stat-tile';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { formatMediumDate, formatMinute } from '@/features/booking/format';
import { type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';
import { type IsoDate } from '@/lib/iso-date';
import { cn } from '@/lib/utils';

import {
  changeFor,
  daysBetween,
  measurementValue,
  metricDecimals,
  summariseProgress,
  trendSeries,
  type ChangeVerdict,
  type MeasurementChange,
  type MeasurementMetric,
  type MeasurementSubject,
} from '../compare';
import { type MeasurementRow } from '../queries';

import { MeasurementFormTrigger } from './measurement-form-trigger';
import { MeasurementSharingSwitch } from './measurement-sharing-switch';
import { MeasurementRowActions } from './measurement-row-actions';
import { MeasurementRangeSwitch } from './measurement-range-switch';
import { MeasurementTrend, type TrendMetricSeries } from './measurement-trend';

/**
 * The client record's Measurements tab.
 *
 * Every figure on this panel comes from `../compare.ts` — the pure module — and
 * nothing here computes a delta, a BMI or a verdict of its own. That split is
 * what lets the clinical arithmetic be tested without rendering a page, and it
 * is the same arrangement `ClientProgressPanel` has with `clients/progress.ts`.
 *
 * ## The four tiles are not "the four most important numbers"
 *
 * They are weight, fat mass, muscle mass and body fat — the set that makes the
 * one sentence underneath sayable. A dietitian can read weight off a scale; what
 * they bought the analyser for is knowing whether the weight that left was fat
 * or muscle, and those two tiles beside each other are that answer.
 *
 * BMI is deliberately **not** among them. It is in the table and on the trend
 * picker, because it is what a referral letter asks for — but it cannot
 * distinguish the two outcomes this tab exists to distinguish, so putting it in
 * the headline would be leading with the weakest figure on the page.
 */

/** Which figures get a headline tile, in reading order. */
const HEADLINE_METRICS = ['weightKg', 'fatMassKg', 'muscleMassKg', 'bodyFatPercent'] as const;

/** Which figures the history table shows as columns. */
const TABLE_METRICS = [
  'weightKg',
  'bmi',
  'bodyFatPercent',
  'fatMassKg',
  'muscleMassKg',
] as const satisfies readonly MeasurementMetric[];

/** Which figures the trend chart offers to plot. */
const TREND_METRICS = [
  'weightKg',
  'fatMassKg',
  'muscleMassKg',
  'bodyFatPercent',
  'bmi',
] as const satisfies readonly MeasurementMetric[];

const METRIC_UNITS = {
  weightKg: 'kg',
  bmi: null,
  bodyFatPercent: 'percent',
  fatMassKg: 'kg',
  fatFreeMassKg: 'kg',
  muscleMassKg: 'kg',
  visceralFatRating: 'rating',
  waistCm: 'cm',
  hipCm: 'cm',
  basalMetabolicRateKcal: 'kcal',
} as const satisfies Record<MeasurementMetric, 'kg' | 'cm' | 'percent' | 'kcal' | 'rating' | null>;

type MeasurementsPanelProps = {
  clientId: string;
  locale: Locale;
  today: IsoDate;
  /** Newest first — the order `listMeasurements` returns and `summariseProgress` expects. */
  measurements: MeasurementRow[];
  subject: MeasurementSubject;
  /** `client_nutrition_profiles.weight_kg`, for the form's "current weight" hint. */
  currentWeightKg: number | null;
  /** `?range=` — which comparison the headline is showing. */
  range: 'last' | 'start';
  /** Whether this client can see their measurements in the portal, and can be given them. */
  sharing: { shared: boolean; hasProfile: boolean };
  /**
   * Which measurements have a stored report behind them.
   *
   * A set rather than a column on the row, because `listMeasurements`
   * deliberately never joins `client_measurement_files` — see its note. This is
   * one extra id-only query for the whole table.
   */
  reportIds: Set<string>;
};

export async function MeasurementsPanel({
  clientId,
  locale,
  today,
  measurements,
  subject,
  currentWeightKg,
  range,
  reportIds,
  sharing,
}: MeasurementsPanelProps) {
  const t = await getTranslations('measurements');

  const number = (value: number, decimals: number) =>
    formatNumber(locale, value, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  const unitLabel = (metric: MeasurementMetric) => {
    const unit = METRIC_UNITS[metric];
    return unit ? t(`units.${unit}`) : undefined;
  };

  /*
    Upload leads, and by hand sits beside it as the quieter option. That is the
    order of the day rather than a judgement about which is better: a clinic with
    an analyser runs the machine at the visit and uploads the sheet, and types a
    figure by hand on the day the machine is out of order or the client was
    weighed elsewhere. Both are one press from here, and neither is hidden behind
    the other.
  */
  const addButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <MeasurementFormTrigger
        clientId={clientId}
        locale={locale}
        today={today}
        currentWeightKg={currentWeightKg}
        mode="upload"
        icon="bills"
        label={t('upload.trigger')}
      />
      <MeasurementFormTrigger
        clientId={clientId}
        locale={locale}
        today={today}
        currentWeightKg={currentWeightKg}
        variant="outline"
        label={t('add')}
      />
    </div>
  );

  if (measurements.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState icon="clients" title={t('empty.title')} description={t('empty.body')} />
        <div className="flex justify-center">{addButtons}</div>
      </div>
    );
  }

  const progress = summariseProgress(measurements, subject);
  const changes = range === 'start' ? progress.sinceStart : progress.sinceLast;
  const narrative = range === 'start' ? progress.narrativeSinceStart : progress.narrativeSinceLast;
  const latest = progress.latest!;

  /*
    The trend is computed here, on the server, and handed to the chart as plain
    arrays. `MeasurementTrend` is a client component behind a dynamic import —
    the same arrangement `ClientProgressChart` documents — so no measurement row
    and no translator crosses the boundary, only the points and their labels.
  */
  const series: TrendMetricSeries[] = TREND_METRICS.map((metric) => {
    const points = trendSeries(measurements, metric, subject);
    return {
      metric,
      label: t(`metrics.${metric}`),
      unit: unitLabel(metric) ?? '',
      decimals: metricDecimals(metric),
      points: points.map((point) => ({
        label: formatMediumDate(locale, point.measuredOn),
        value: point.value,
      })),
    };
  }).filter((entry) => entry.points.length >= 2);

  const daysSinceLatest = daysBetween(latest.measuredOn, today);

  return (
    <div className="space-y-4">
      {/* ── The headline ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <CardTitle>{t('headline.title')}</CardTitle>
          <p className="me-auto text-caption text-muted-foreground">
            {t('headline.lastMeasured', { date: formatMediumDate(locale, latest.measuredOn) })}
            {daysSinceLatest > 0 ? ` · ${t('headline.daysSince', { days: daysSinceLatest })}` : null}
          </p>
          {progress.previous ? (
            <MeasurementRangeSwitch
              range={range}
              lastLabel={t('range.last')}
              startLabel={t('range.start')}
              ariaLabel={t('range.label')}
            />
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4">
          {/*
            Four tiles, so `columns={4}` — the default of three would leave the
            fourth alone on a second row beside an empty cell, and `StatGrid`
            draws its gaps as a hairline background, so the empty cell is
            visible rather than blank. It falls to 2x2 below `md`, which is the
            shape these four want on a phone anyway.
          */}
          <StatGrid columns={4}>
            {HEADLINE_METRICS.map((metric) => {
              const value = measurementValue(latest, metric, subject);
              const change = changeFor(changes, metric);

              return (
                <StatTile
                  key={metric}
                  label={t(`metrics.${metric}`)}
                  value={value === null ? null : number(value, metricDecimals(metric))}
                  unit={unitLabel(metric)}
                  note={
                    change && change.delta !== null ? (
                      <DeltaNote
                        change={change}
                        text={`${change.delta > 0 ? '+' : '−'}${number(Math.abs(change.delta), metricDecimals(metric))}`}
                      />
                    ) : undefined
                  }
                />
              );
            })}
          </StatGrid>

          {/*
            The sentence. `progressNarrative` chose which fact to lead with;
            this only fills in the numbers, because the wording is Arabic and
            English and the choice is clinical.
          */}
          <p
            className={cn(
              'rounded-lg border border-primary-subtle bg-secondary px-4 py-3',
              'text-body text-foreground',
            )}
          >
            {t(`narrative.${narrative}`, narrativeValues(changes, number))}
            {narrative === 'fatDownMuscleUp' ? (
              <span className="mt-1.5 block text-caption text-muted-foreground">
                {t('narrative.why')}
              </span>
            ) : null}
          </p>
        </CardContent>
      </Card>

      {/* ── The trend ────────────────────────────────────────────────── */}
      {series.length > 0 ? (
        <Card>
          <CardHeader className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <CardTitle>{t('trend.title')}</CardTitle>
            <p className="text-caption text-muted-foreground">
              {t('trend.subtitle', { count: measurements.length })}
            </p>
          </CardHeader>
          <CardContent>
            <MeasurementTrend series={series} pickLabel={t('trend.pick')} />
          </CardContent>
        </Card>
      ) : null}

      {/* ── Every visit ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <CardTitle>{t('history.title')}</CardTitle>
          <p className="me-auto text-caption text-muted-foreground">{t('history.subtitle')}</p>
          {addButtons}
        </CardHeader>
        <CardContent>
          <TableRoot>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('form.measuredOn')}</TableHead>
                  {TABLE_METRICS.map((metric) => (
                    <TableHead key={metric}>{t(`metrics.${metric}`)}</TableHead>
                  ))}
                  <TableHead>{t('source.label')}</TableHead>
                  <TableHead className="text-end">
                    <span className="sr-only">{t('edit')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {measurements.map((row, index) => {
                  // The visit below this one in the table — chronologically the
                  // one before it, because the list is newest first.
                  const older = measurements[index + 1];

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="tabular-nums">
                          {formatMediumDate(locale, row.measuredOn)}
                        </span>
                        {row.measuredAtMinute > 0 ? (
                          <span className="ms-2 text-caption text-muted-foreground tabular-nums">
                            {formatMinute(locale, row.measuredOn, row.measuredAtMinute)}
                          </span>
                        ) : null}
                      </TableCell>

                      {TABLE_METRICS.map((metric) => {
                        const value = measurementValue(row, metric, subject);
                        const previous = older ? measurementValue(older, metric, subject) : null;
                        const delta =
                          value === null || previous === null ? null : value - previous;

                        return (
                          <TableCell key={metric} className="tabular-nums">
                            {value === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <>
                                {number(value, metricDecimals(metric))}
                                {delta !== null && Math.abs(delta) >= 0.05 ? (
                                  <span className="ms-2 text-caption text-muted-foreground">
                                    {delta > 0 ? '+' : '−'}
                                    {number(Math.abs(delta), metricDecimals(metric))}
                                  </span>
                                ) : null}
                              </>
                            )}
                          </TableCell>
                        );
                      })}

                      <TableCell className="text-caption text-muted-foreground">
                        {/*
                          The machine's own name where there is one, because
                          "Tanita MC-780" tells a dietitian more than "from a
                          report" — and a clinic with two machines can see which
                          one a reading came off.
                        */}
                        {reportIds.has(row.id) ? (
                          <a
                            href={`/${locale}/app/clients/${clientId}/measurements/${row.id}/report`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                          >
                            {row.deviceLabel ?? t('source.device')}
                          </a>
                        ) : (
                          (row.deviceLabel ?? t(`source.${row.source === 'device' ? 'device' : 'manual'}`))
                        )}
                      </TableCell>

                      <TableCell>
                        <MeasurementRowActions
                          clientId={clientId}
                          locale={locale}
                          today={today}
                          currentWeightKg={currentWeightKg}
                          dateLabel={formatMediumDate(locale, row.measuredOn)}
                          /*
                            The stored row, flattened to the strings and numbers
                            the form seeds from. Passed rather than re-read when
                            the card opens: the panel already holds every
                            measurement, so fetching one back would be a round
                            trip for data three feet up the tree.
                          */
                          measurement={{
                            id: row.id,
                            measuredOn: row.measuredOn,
                            measuredAtMinute: row.measuredAtMinute,
                            weightKg: row.weightKg,
                            heightCm: row.heightCm,
                            bodyFatPercent: row.bodyFatPercent,
                            fatMassKg: row.fatMassKg,
                            fatFreeMassKg: row.fatFreeMassKg,
                            muscleMassKg: row.muscleMassKg,
                            boneMassKg: row.boneMassKg,
                            totalBodyWaterKg: row.totalBodyWaterKg,
                            totalBodyWaterPercent: row.totalBodyWaterPercent,
                            visceralFatRating: row.visceralFatRating,
                            basalMetabolicRateKcal: row.basalMetabolicRateKcal,
                            metabolicAge: row.metabolicAge,
                            waistCm: row.waistCm,
                            hipCm: row.hipCm,
                            note: row.note,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableRoot>
        </CardContent>
      </Card>

      {/*
        The disclosure switch, last and quiet.

        It belongs on this tab rather than in Settings because it is a decision
        about *this client* — §11's "hidden per client at the account level" —
        and the moment a dietitian has an opinion about whether someone should
        see these numbers is the moment they are looking at them.
      */}
      <Card>
        <CardContent className="pt-5">
          <MeasurementSharingSwitch
            clientId={clientId}
            locale={locale}
            shared={sharing.shared}
            hasProfile={sharing.hasProfile}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The coloured change under a headline figure.
 *
 * Colour comes from the verdict, never from the sign — an `unjudged` change is
 * drawn in muted ink however far it moved, which is the visible half of the rule
 * `metricIntent` enforces. Status is also carried by the arrow's direction and
 * by the sign in the text, so colour is never the only carrier (design system,
 * accessibility floor).
 */
function DeltaNote({ change, text }: { change: MeasurementChange; text: string }) {
  const tone: Record<ChangeVerdict, string> = {
    improved: 'text-status-on-track-fg',
    declined: 'text-destructive',
    unchanged: 'text-muted-foreground',
    unjudged: 'text-muted-foreground',
  };

  return <span className={cn('font-medium tabular-nums', tone[change.verdict])}>{text}</span>;
}

/**
 * The numbers the narrative sentence interpolates, as already-formatted strings.
 *
 * Absolute values: the direction is in the wording ("Down 2.6 kg"), so a message
 * carrying a minus sign as well would read "Down −2.6 kg". Every key is supplied
 * whether or not the chosen message uses it, because next-intl throws on a
 * missing placeholder and the narrative is picked by `compare.ts` rather than
 * here.
 */
function narrativeValues(
  changes: readonly MeasurementChange[],
  number: (value: number, decimals: number) => string,
): Record<string, string> {
  const at = (metric: MeasurementMetric) => {
    const change = changeFor(changes, metric);
    return change?.delta === null || change === null
      ? '—'
      : number(Math.abs(change.delta), metricDecimals(metric));
  };

  return {
    weight: at('weightKg'),
    fat: at('fatMassKg'),
    muscle: at('muscleMassKg'),
  };
}
