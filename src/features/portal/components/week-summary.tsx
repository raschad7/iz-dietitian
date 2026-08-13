import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { type CheckInMetric } from '@/db/schema';
import { metricFraction, type MetricStatus, type MetricSummary } from '@/features/portal/check-ins';

/**
 * The five things the client rates, each as its week rather than its latest
 * value: a sparkline of the days they answered, plus where that week sits.
 *
 * **Why a trend and not a bar.** A single marker on a track invites the reader
 * to drag it — on a screen with no form on it, that is a control that does
 * nothing. A line has no affordance to misread, and it says more: appetite
 * climbing all week is the thing worth noticing, and a marker at today's value
 * hides it completely.
 *
 * Gaps in the line are days with no answer, kept in place deliberately (see
 * `MetricSummary.trend`) — three answers spread across a week and three in a
 * row are different weeks, and a line that closed over the gaps would draw
 * them identically.
 */

/**
 * Metric → glyph. The names are roles in `src/lib/icons.ts`, so a picture can
 * be swapped there without touching this map or the rows below.
 */
const ICONS: Record<CheckInMetric, IconName> = {
  energy: 'checkInEnergy',
  sleep: 'checkInSleep',
  appetite: 'checkInAppetite',
  mood: 'checkInMood',
  water: 'checkInWater',
};

/**
 * Status → badge. `good` and `onTrack` deliberately share olive: both are
 * fine, and the word is what separates them. Only `attention` earns amber, and
 * nothing here is ever red (§06).
 */
const BADGE: Record<MetricStatus, 'onTrack' | 'attention' | 'incomplete'> = {
  good: 'onTrack',
  onTrack: 'onTrack',
  attention: 'attention',
  none: 'incomplete',
};

/** Sparkline box. Small enough to sit in a 48px row without crowding the name. */
const WIDTH = 56;
const HEIGHT = 22;
const INSET = 3;

type Point = { x: number; y: number };

/**
 * The trend as runs of points — one run per unbroken stretch of answered days,
 * so a gap breaks the line instead of being interpolated over.
 */
function runs(trend: (number | null)[]): Point[][] {
  const span = Math.max(trend.length - 1, 1);
  const result: Point[][] = [];
  let current: Point[] = [];

  trend.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) result.push(current);
      current = [];
      return;
    }

    current.push({
      x: INSET + (index / span) * (WIDTH - INSET * 2),
      // SVG's y grows downward; a higher rating should sit higher.
      y: HEIGHT - INSET - metricFraction(value) * (HEIGHT - INSET * 2),
    });
  });

  if (current.length > 0) result.push(current);

  return result;
}

function pointsAttribute(run: Point[]): string {
  return run.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
}

function Trend({ metric }: { metric: MetricSummary }) {
  const segments = runs(metric.trend);
  const tone = metric.status === 'attention' ? 'text-status-attention-fg' : 'text-primary';

  if (segments.length === 0) {
    return <span className="w-14 shrink-0 text-center text-xs text-muted-foreground">—</span>;
  }

  // The most recent answer. It also carries the single-answer case: one day
  // makes a run with no line in it, and the dot is what renders it at all.
  const latest = segments.at(-1)?.at(-1);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      className={`shrink-0 ${tone}`}
      aria-hidden="true"
    >
      {segments.map((run) => (
        <polyline
          key={pointsAttribute(run)}
          points={pointsAttribute(run)}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="fill-none stroke-current"
        />
      ))}

      {latest ? <circle cx={latest.x} cy={latest.y} r="2.4" className="fill-current" /> : null}
    </svg>
  );
}

export function WeekSummary({ metrics }: { metrics: MetricSummary[] }) {
  const t = useTranslations('portal.checkIns');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('summary.title')}</CardTitle>
      </CardHeader>

      <CardContent>
        <ul className="divide-y divide-border">
          {metrics.map((metric) => {
            const attention = metric.status === 'attention';

            return (
              <li key={metric.metric} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                    attention
                      ? 'bg-status-attention-bg text-status-attention-fg'
                      : 'bg-icon-chip text-icon-chip-foreground'
                  }`}
                >
                  <Icon name={ICONS[metric.metric]} className="size-4.5" />
                </span>

                <span className="min-w-0 flex-1 truncate font-medium">{t(`metric.${metric.metric}`)}</span>

                <Trend metric={metric} />

                <Badge variant={BADGE[metric.status]}>{t(`status.${metric.status}`)}</Badge>
              </li>
            );
          })}
        </ul>

        <p className="pt-3 text-xs text-muted-foreground">{t('summary.footnote')}</p>
      </CardContent>
    </Card>
  );
}
