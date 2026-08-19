'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, XAxis } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { type Direction } from '@/i18n/routing';

/**
 * The two plots on the dashboard's stat cards — and the only client-side
 * charts in the codebase.
 *
 * Everything else that draws data here is server-rendered SVG in the `viz-*`
 * ramp with a CSS-only hover (`docs/design-system.md`, "Charts"). These two are
 * Recharts, on the dashboard's own request, and the boundary is drawn as
 * tightly as it will go: **only the plot is a client component.** The card
 * around it, its heading, its headline figure, its footer and every translated
 * or `Intl`-formatted string stay on the server and arrive here as plain
 * `{ label, value }` pairs. Nothing in this file knows what a locale is.
 *
 * ## Three things Recharts does not do for us
 *
 * **1. It does not mirror.** There is no RTL mode; a chart under `dir="rtl"`
 * still runs its category axis left to right, so in Arabic the oldest month
 * would sit where the reader expects the newest. `reversed` on the `XAxis` is
 * what fixes it, and it is driven by the `direction` prop rather than by a
 * media query or a `document.dir` read, because the locale is already known on
 * the server and guessing it again in the browser is how the two get to
 * disagree. **Any chart added to this file must take `direction` and pass it
 * to its axis** — this is the one thing that will not fail loudly.
 *
 * **2. It has no colours of its own worth using.** The `ChartConfig` below
 * points `--color-*` at `viz-brand`, the clinic's own green — the documented
 * exception to the rule that charts are drawn in neutrals, and the reasoning
 * for it lives beside the token in `globals.css`. The short version: these two
 * plots are the whole content of their cards, nothing inside them is
 * clickable, and each card's one target is a glyph in the corner that no bar
 * could be mistaken for.
 *
 * **3. It sizes itself from its container.** `ChartContainer` defaults to
 * `aspect-video`, which on the dashboard's one-screen layout would push the
 * register off the bottom of the page. Both plots take an explicit height
 * instead, and the cards above them are what decides it.
 */

export type ChartPoint = {
  /** Already formatted for the locale — an axis tick, not a date. */
  label: string;
  value: number;
};

type ChartProps = {
  data: ChartPoint[];
  direction: Direction;
  /** What the tooltip calls the measure, e.g. "New clients". Already translated. */
  seriesLabel: string;
};

/**
 * The plot height, in pixels.
 *
 * Fixed rather than proportional: the dashboard does not scroll at `xl`, so a
 * plot that grew with its container would take the space out of the register
 * below it. 132px is enough for six area points to have a readable shape and
 * for eight bars to keep a pointer-sized width.
 */
const PLOT_HEIGHT = 'h-[132px] w-full';

const CONFIG = {
  value: { color: 'var(--color-viz-brand)' },
} satisfies ChartConfig;

/**
 * Six months of intake.
 *
 * An area rather than a line because the shape of a small clinic's intake is
 * the point — three, then one, then five is a jagged line and a legible mass.
 * `type="monotone"`, not shadcn's `"natural"`: a natural spline overshoots
 * between points, and on counts that cannot go below zero it draws a curve
 * dipping under the axis between two quiet months. Monotone never invents a
 * value the data does not have.
 */
export function ClientIntakeChart({ data, direction, seriesLabel }: ChartProps) {
  const config = { value: { ...CONFIG.value, label: seriesLabel } } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className={PLOT_HEIGHT}>
      <AreaChart accessibilityLayer data={data} margin={{ top: 4, left: 4, right: 4, bottom: 0 }}>
        <defs>
          {/*
            The fill fades out downward so the area reads as a mass under the
            line rather than as a filled block competing with the card. A flat
            `fillOpacity` gets muddy against the card's own tint at this size.
          */}
          <linearGradient id="dashboard-intake-fill" x1="0" y1="0" x2="0" y2="1">
            {/* The soft green, not the line's own colour: a wash of the mark
                colour at low opacity goes grey-green against the card, where
                green-300 stays recognisably the light green the brand uses. */}
            <stop offset="0%" stopColor="var(--color-viz-brand-soft)" stopOpacity={0.7} />
            <stop offset="100%" stopColor="var(--color-viz-brand-soft)" stopOpacity={0.05} />
          </linearGradient>
        </defs>

        {/* Horizontal rules only. Vertical ones would fence six points into six
            boxes and say nothing the axis labels do not. */}
        <CartesianGrid vertical={false} />

        <XAxis
          dataKey="label"
          reversed={direction === 'rtl'}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
        />

        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />

        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill="url(#dashboard-intake-fill)"
        />
      </AreaChart>
    </ChartContainer>
  );
}

/**
 * Eight weeks of the diary.
 *
 * **The last bar is the full green; the rest are the soft one.** That is the
 * week the card's headline number counts, and without the distinction the
 * reader has to work out which end of the axis is "now" — twice, since the
 * axis flips between Arabic and English. Two steps of one hue, marking *which
 * bar the headline is about*: a fact about the card, not about the data.
 */
export function AppointmentsChart({ data, direction, seriesLabel }: ChartProps) {
  const config = { value: { ...CONFIG.value, label: seriesLabel } } satisfies ChartConfig;

  /*
   * The current week is the last point, in Arabic and in English alike.
   * `reversed` on the axis changes where a point is *painted*, not the order of
   * the array, so this index needs no mirroring — and a `Cell` still indexes by
   * data position.
   */
  const currentIndex = data.length - 1;

  return (
    <ChartContainer config={config} className={PLOT_HEIGHT}>
      <BarChart accessibilityLayer data={data} margin={{ top: 4, left: 4, right: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />

        <XAxis
          dataKey="label"
          reversed={direction === 'rtl'}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="preserveStartEnd"
        />

        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />

        <Bar dataKey="value" radius={4}>
          {data.map((point, index) => (
            <Cell
              key={point.label}
              fill={index === currentIndex ? 'var(--color-viz-brand)' : 'var(--color-viz-brand-soft)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
