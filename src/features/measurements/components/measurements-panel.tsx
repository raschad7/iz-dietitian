import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
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
import { formatMediumDate } from '@/features/booking/format';
import { type Locale } from '@/i18n/routing';
import { formatNumber } from '@/lib/format';
import { type IsoDate } from '@/lib/iso-date';
import { cn } from '@/lib/utils';

import {
  changeFor,
  compareMeasurements,
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

/**
 * Which columns of the history table carry a change badge.
 *
 * **Two, and not five.** Every cell used to trail a small grey delta, which
 * turned a table of readings into a table of readings and deltas — twice the
 * ink for a column a reader scans vertically anyway, and no signal about which
 * of the five changes was the one worth noticing.
 *
 * Weight is the figure everyone reads first and the one the client asks about.
 * Fat mass is the figure that says what *kind* of weight moved, which is the
 * whole reason the clinic bought the analyser. Between them they answer "is
 * this working?" — the other three columns are context for that answer and are
 * read as values, not as movements.
 *
 * Muscle mass is deliberately not here despite being half the thesis: it moves
 * in hundredths between visits, and a coloured chip on a 0.1 kg step claims a
 * change the measurement cannot really support. It is a headline tile and a
 * chart line instead, where the shape over months is the honest reading.
 */
const BADGED_METRICS = ['weightKg', 'fatMassKg'] as const satisfies readonly MeasurementMetric[];

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
        {/*
          `items-center`, not `items-baseline`: the range switch is a 52px
          control and a baseline row would hang it off the title's text
          baseline. The title and its subline keep their own baseline inside the
          group they share.
        */}
        <CardHeader className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="me-auto flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <CardTitle>{t('headline.title')}</CardTitle>
            <p className="text-caption text-muted-foreground">
              {t('headline.lastMeasured', { date: formatMediumDate(locale, latest.measuredOn) })}
              {daysSinceLatest > 0
                ? ` · ${t('headline.daysSince', { days: daysSinceLatest })}`
                : null}
            </p>
          </div>
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
                  note={change ? <DeltaBadge change={change} format={number} /> : undefined}
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
                      {/*
                        The date, and not the clock beside it. A visit is the
                        unit this table is read in; the minute a client stood on
                        the machine is the machine's own footnote and was
                        putting a second grey number in the first column of
                        every row.
                      */}
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatMediumDate(locale, row.measuredOn)}
                      </TableCell>

                      {TABLE_METRICS.map((metric) => {
                        const value = measurementValue(row, metric, subject);
                        /*
                          The change against the visit *below* this row, judged
                          by `compareMeasurements` rather than by the sign of
                          the subtraction — so a falling weight reads as
                          progress for a client losing weight, as a problem for
                          one gaining, and as neither for one maintaining.
                          Computed only for the badged columns; the rest are
                          values, not movements.
                        */
                        const change =
                          older && (BADGED_METRICS as readonly string[]).includes(metric)
                            ? changeFor(compareMeasurements(older, row, subject), metric)
                            : null;

                        return (
                          <TableCell key={metric}>
                            {value === null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className="flex items-center gap-2">
                                <span className="tabular-nums">
                                  {number(value, metricDecimals(metric))}
                                </span>
                                {change ? (
                                  <DeltaBadge change={change} format={number} />
                                ) : null}
                              </span>
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
 * A change, as a chip: which way it moved, how far, and whether that is good.
 *
 * ## The colour comes from the verdict, never from the sign
 *
 * An `unjudged` change is drawn in neutral ink however far it moved, which is
 * the visible half of the rule `metricIntent` enforces: a weight that falls is
 * progress for a client losing weight, a problem for one gaining, and *neither*
 * for one maintaining. A chip that went green on every downward arrow would be
 * the app having an opinion the dietitian did not give it.
 *
 * ## Amber for the wrong direction, not clay
 *
 * `Badge`'s own note: "don't reach for `destructive` on a badge to mean 'bad',
 * reach for the status that actually describes it." Clay is this system's only
 * true alarm colour and the design system reserves it for a real allergy,
 * condition or contraindication. A client whose fat mass rose 0.4 kg between
 * two visits has not had a medical event — they have had a fortnight worth
 * following up, which is exactly what amber means here and everywhere else in
 * the app.
 *
 * ## Nothing at all when nothing moved
 *
 * `unchanged` renders `null` rather than a grey chip reading "0.0". A badge is
 * a claim that something happened; the flat case is the one state on this
 * screen where nothing did. The dashboard's `Trendline` makes the same call
 * about its arrow, for the same reason.
 *
 * Direction is carried by the arrow as well as by the colour, so the chip still
 * reads with no colour vision at all — the accessibility floor's "colour is
 * never the only carrier".
 */
function DeltaBadge({
  change,
  format,
}: {
  change: MeasurementChange;
  format: (value: number, decimals: number) => string;
}) {
  if (change.delta === null || change.verdict === 'unchanged') return null;

  const variant: Record<Exclude<ChangeVerdict, 'unchanged'>, 'onTrack' | 'attention' | 'muted'> = {
    improved: 'onTrack',
    declined: 'attention',
    unjudged: 'muted',
  };

  const rose = change.delta > 0;

  return (
    <Badge variant={variant[change.verdict]} size="sm" className="gap-0.5">
      <Icon name={rose ? 'driftUp' : 'driftDown'} className="shrink-0" />
      <span className="tabular-nums">
        {format(Math.abs(change.delta), metricDecimals(change.metric))}
      </span>
    </Badge>
  );
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
