'use client';

import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/utils';

/**
 * One figure plotted across a client's visits, with a picker for which figure.
 *
 * Recharts, on the narrow terms `client-progress-plot.tsx` documents: only this
 * file is a client component, colour comes from `viz-brand` through
 * `ChartConfig`, and everything it draws was computed on the server. No
 * measurement row and no translator crosses the boundary — the panel hands over
 * points and labels that are already formatted.
 *
 * **Series are pre-filtered to those with at least two points.** A metric
 * recorded once is a dot, not a trend, and `trendSeries` already drops the
 * visits that did not record the figure rather than plotting them as zero.
 *
 * **This chart does not mirror for RTL**, the same call the progress plot makes
 * and for the same reason: time reads earliest-to-latest regardless of the
 * page's language, so the array is drawn left to right in both.
 */

export type TrendPoint = {
  /** Already-formatted date — an axis tick, not a date object. */
  label: string;
  value: number;
};

export type TrendMetricSeries = {
  metric: string;
  label: string;
  /** Already translated: "kg", "٪". Empty string for a figure with no unit. */
  unit: string;
  decimals: number;
  points: TrendPoint[];
};

const CONFIG = {
  value: { color: 'var(--color-viz-brand)' },
} satisfies ChartConfig;

/**
 * ⚠ Restated in `measurement-trend.tsx`, not imported from it — importing any
 * value from this module would put it back in the static graph and undo the
 * dynamic split. Whoever changes the height changes it in both files.
 */
const PLOT_HEIGHT = 'h-56 w-full';

/**
 * See the long note on `Y_TICKS_LTR` in `client-progress-plot.tsx`.
 *
 * The same fix, needed for the same reason: Recharts anchors a left-hand Y
 * axis's ticks with `text-anchor="end"`, `end` is logical, and under `dir="rtl"`
 * it resolves to the label's left edge — so the numbers run across the plot
 * instead of hanging back into the gutter. Both selectors are kept because
 * Recharts portals its axis labels out of the axis group.
 */
const Y_TICKS_LTR =
  '[&_.recharts-yAxis-tick-labels_text]:[direction:ltr] [&_.recharts-yAxis_text]:[direction:ltr]';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  return reduced;
}

export function MeasurementTrendChart({
  series,
  pickLabel,
}: {
  series: TrendMetricSeries[];
  pickLabel: string;
}) {
  const [metric, setMetric] = useState(series[0]?.metric ?? '');
  const reducedMotion = useReducedMotion();

  const active = series.find((entry) => entry.metric === metric) ?? series[0];
  if (!active) return null;

  const config = { value: { ...CONFIG.value, label: active.label } } satisfies ChartConfig;

  /*
    A padded domain rather than Recharts' default.

    Body composition moves by a few percent of its own value across months —
    78.6 kg against 86.4 — so a domain running from zero draws four visits as a
    flat line near the top of the plot and hides the entire story. Anchoring to
    the data and padding by a quarter of the spread makes the change legible
    without exaggerating it into a cliff, which is the failure in the other
    direction.
  */
  const values = active.points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = high - low || Math.max(1, high * 0.02);
  const domain: [number, number] = [low - spread * 0.25, high + spread * 0.25];

  const format = (value: number) =>
    value.toLocaleString('en-US', {
      minimumFractionDigits: active.decimals,
      maximumFractionDigits: active.decimals,
    });

  return (
    <div className="space-y-3">
      <Segmented
        role="radiogroup"
        size="sm"
        label={pickLabel}
        value={active.metric}
        onChange={setMetric}
        options={series.map((entry) => ({ value: entry.metric, label: entry.label }))}
        className="flex-wrap"
      />

      <ChartContainer config={config} className={cn(PLOT_HEIGHT, Y_TICKS_LTR)}>
        <AreaChart
          accessibilityLayer
          data={active.points}
          margin={{ top: 8, left: 4, right: 4, bottom: 0 }}
        >
          <defs>
            <linearGradient id="measurement-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-viz-brand-soft)" stopOpacity={0.7} />
              <stop offset="100%" stopColor="var(--color-viz-brand-soft)" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid vertical={false} />

          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />

          <YAxis
            domain={domain}
            tickLine={false}
            axisLine={false}
            tickFormatter={format}
            width={48}
          />

          <ChartTooltip
            cursor={{ strokeDasharray: '3 3' }}
            content={({ active: hovered, payload }) => {
              if (!hovered || !payload?.length) return null;
              const point = payload[0]?.payload as TrendPoint | undefined;
              if (!point) return null;

              return (
                <div className="grid min-w-32 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                  <span className="font-medium text-foreground">{point.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    <bdi>
                      {format(point.value)}
                      {active.unit ? ` ${active.unit}` : ''}
                    </bdi>
                  </span>
                </div>
              );
            }}
          />

          <Area
            dataKey="value"
            type="monotone"
            stroke="var(--color-value)"
            strokeWidth={2}
            fill="url(#measurement-trend-fill)"
            /*
              `connectNulls` is irrelevant here and deliberately left off:
              `trendSeries` removes the visits that did not record this figure
              rather than passing nulls through, so a gap in the data is a
              missing *point*, not a null in the array. See its own note on why
              plotting an unrecorded figure as zero would draw a collapse that
              never happened.
            */
            isAnimationActive={!reducedMotion}
            animationDuration={700}
            dot={{ r: 3, fill: 'var(--color-value)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
