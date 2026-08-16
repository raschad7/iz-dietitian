'use client';

import { useEffect, useState, type Key } from 'react';
import { Area, AreaChart, CartesianGrid, Dot, XAxis, YAxis } from 'recharts';

import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';

/**
 * The Progress tab's weekly graph.
 *
 * Recharts, on the same narrow terms `stat-charts.tsx` documents for the
 * dashboard's own two plots: only this file is a client component, and
 * colour comes from `viz-brand` through `ChartConfig`.
 *
 * **RTL is handled by the caller, not by an axis prop.** `stat-charts.tsx`
 * reverses its category axis with `XAxis reversed`, which works for the
 * dashboard's two charts; here, with a band-scale category axis, `reversed`
 * flipped which end the tick *labels* rendered at without reliably moving
 * the plotted geometry to match, so the curve and its labels disagreed. The
 * caller (`client-progress-panel.tsx`) instead reverses `data` itself for
 * Arabic, so this component always just draws its array left to right and
 * every point, dot and label are already in agreement about their pixel.
 *
 * A day with nothing recorded — future, or simply empty — plots as a gap
 * rather than a false zero, the same "absence, not a number" rule
 * `adherence.ts` applies everywhere else a fraction is drawn.
 */

export type ProgressChartPoint = {
  /** Already translated weekday label — an axis tick, not a date. */
  label: string;
  /** 0–100, or null when the day has nothing recorded. */
  value: number | null;
  /** Already translated "3 of 4 meals" — computed server-side, since a
   * translator function cannot cross into this client component. */
  mealsLabel: string;
  isToday: boolean;
};

const CONFIG = {
  value: { color: 'var(--color-viz-brand)' },
} satisfies ChartConfig;

const PLOT_HEIGHT = 'h-56 w-full';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  return reduced;
}

function ProgressTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ProgressChartPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="grid min-w-32 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <span className="font-medium text-foreground">{point.label}</span>
      <span className="text-muted-foreground tabular-nums">
        {point.value === null ? '—' : `${Math.round(point.value)}%`}
      </span>
      <span className="text-muted-foreground">{point.mealsLabel}</span>
    </div>
  );
}

export function ClientProgressChart({
  data,
  seriesLabel,
}: {
  data: ProgressChartPoint[];
  seriesLabel: string;
}) {
  const config = { value: { ...CONFIG.value, label: seriesLabel } } satisfies ChartConfig;
  const reducedMotion = useReducedMotion();

  return (
    <ChartContainer config={config} className={PLOT_HEIGHT}>
      <AreaChart accessibilityLayer data={data} margin={{ top: 8, left: 4, right: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="client-progress-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-viz-brand-soft)" stopOpacity={0.7} />
            <stop offset="100%" stopColor="var(--color-viz-brand-soft)" stopOpacity={0.05} />
          </linearGradient>
        </defs>

        <CartesianGrid vertical={false} />

        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />

        <YAxis
          domain={[0, 100]}
          ticks={[0, 50, 100]}
          tickLine={false}
          axisLine={false}
          tickFormatter={(tick: number) => `${tick}%`}
          width={36}
        />

        <ChartTooltip cursor={{ strokeDasharray: '3 3' }} content={<ProgressTooltip />} />

        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill="url(#client-progress-fill)"
          connectNulls={false}
          isAnimationActive={!reducedMotion}
          animationDuration={700}
          dot={(props: { cx?: number; cy?: number; payload?: ProgressChartPoint; key?: Key | null }) => {
            const { cx, cy, payload, key } = props;
            if (cx === undefined || cy === undefined || !payload || payload.value === null) {
              return <Dot key={key} cx={cx} cy={cy} r={0} />;
            }

            return (
              <Dot
                key={key}
                cx={cx}
                cy={cy}
                r={payload.isToday ? 5 : 3.5}
                className={payload.isToday ? 'fill-viz-brand stroke-background' : 'fill-viz-brand'}
                strokeWidth={payload.isToday ? 2 : 0}
              />
            );
          }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
