'use client';

import { useEffect, useState, type Key } from 'react';
import { Area, AreaChart, CartesianGrid, Dot, XAxis, YAxis } from 'recharts';

import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';

/**
 * The Progress tab's weekly graph.
 *
 * Recharts, on the same narrow terms `stat-charts.tsx` documents for the
 * dashboard's own two plots: only this file is a client component, and
 * colour comes from `viz-brand` through `ChartConfig`.
 *
 * **This chart does not mirror for RTL, on purpose.** `stat-charts.tsx`
 * reverses its category axis with `XAxis reversed` for the dashboard's own
 * charts, but a client's diary reads the same direction it was lived in
 * regardless of the page's language: the first day of the week is always at
 * the left and the curve always climbs left to right. The caller
 * (`client-progress-panel.tsx`) passes `progress.days` straight through, so
 * this component always just draws its array left to right and every point,
 * dot and label are already in agreement about their pixel.
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

/**
 * ⚠ **The percentage ticks have to be laid out left-to-right, or they land on
 * the plot.**
 *
 * Recharts anchors a left-hand Y axis's tick text with `text-anchor="end"` (see
 * `getTickTextAnchor` in `CartesianAxis`), and `start`/`end` in SVG are
 * *logical*: they resolve against the text's own `direction`. Under Arabic the
 * whole page is `dir="rtl"`, the label inherits it, and "end" becomes the label's
 * left edge — so instead of hanging back into the 36px gutter, "0%" and "100%"
 * ran rightward across the axis line and sat directly under Sunday's dot, which
 * is the leftmost point of the series.
 *
 * The X axis never showed it because a category tick anchors `middle`, and
 * `middle` is the one anchor that does not depend on direction. This is also the
 * only Y axis in the codebase, which is why nothing else drifted.
 *
 * `direction: ltr` on the tick text alone, and not `dir="ltr"` on the chart:
 * these labels are Latin digits with a percent sign in both languages, so
 * nothing here is being un-Arabised, whereas flipping the whole container would
 * take the tooltip's Arabic with it. It also cannot be fixed by widening the
 * axis — the overlap is an anchor resolving to the wrong side, not a label too
 * big for its gutter.
 *
 * ⚠ **Match on `-tick-labels`, not on the axis group.** Recharts 3.4 renders
 * every axis label into a *portal* — a `<g class="recharts-zIndex-layer_2000">`
 * at the root of the SVG, because SVG has no `z-index` — so the tick text is not
 * a descendant of `.recharts-yAxis` at all and a selector going through the axis
 * matches nothing. (`chart.tsx`'s upstream `.recharts-cartesian-axis-tick text`
 * rule is in that same blind spot; it is left alone because that file is kept
 * byte-identical to the registry on purpose.) The second selector is the same
 * rule written for the nested arrangement, so a Recharts version that stops
 * portalling labels does not quietly reopen this.
 */
const Y_TICKS_LTR =
  '[&_.recharts-yAxis-tick-labels_text]:[direction:ltr] [&_.recharts-yAxis_text]:[direction:ltr]';

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
    <ChartContainer config={config} className={cn(PLOT_HEIGHT, Y_TICKS_LTR)}>
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

            if (payload.isToday) {
              // A darker olive, not a bigger version of the same one — size
              // alone reads as "important point" long before it reads as
              // "today", and the two dates either side of it are the same
              // shade at a glance. `viz-band-marker` is the palette's own
              // token for a single called-out point against a run of data
              // (see `ComfortBand`), which is exactly the job here. The soft
              // ring behind it is the halo the plan picker already puts under
              // today's cell, redrawn at chart scale.
              return (
                <g key={key}>
                  <circle cx={cx} cy={cy} r={9} className="fill-viz-band-marker/15" />
                  <Dot cx={cx} cy={cy} r={5} className="fill-viz-band-marker stroke-background" strokeWidth={2} />
                </g>
              );
            }

            return <Dot key={key} cx={cx} cy={cy} r={3.5} className="fill-viz-brand" />;
          }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
