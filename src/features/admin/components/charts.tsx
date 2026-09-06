'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { type Direction } from '@/i18n/routing';

/**
 * The platform area's charts.
 *
 * ## Why these are Recharts and the first version was a `<div>` with a height
 *
 * The overview drew its signup chart as bare elements with an inline pixel
 * height. That was defensible for six bars of one series and stopped being
 * defensible the moment the screen needed a daily line over ninety points, two
 * series on one axis, and a value under the pointer. The codebase already has
 * the wrapper — `src/components/ui/chart.tsx`, shadcn's Recharts container,
 * kept byte-identical to upstream on purpose — and `docs/design-system.md`
 * documents the `viz-*` ramp these point at. Hand-rolling a second charting
 * approach beside it was the mistake, not the library.
 *
 * ## Three things Recharts will not do on its own
 *
 * **1. It does not mirror.** There is no RTL mode: a chart under `dir="rtl"`
 * still runs its category axis left to right, so in Arabic the oldest day would
 * sit where the reader expects the newest. `reversed` on the `XAxis` is what
 * fixes it, and every chart in this file takes `direction` and passes it down.
 * ⚠ **Any chart added here must do the same** — this is the one failure that is
 * silent, and it produces a plot that is not wrong-looking, merely backwards.
 *
 * **2. Its colours are not the product's.** Every series points at a `viz-*`
 * token through `ChartConfig`. Nothing here reaches for green: that is the
 * action colour, and a bar the reader might try to click is worse than a grey
 * one they read.
 *
 * **3. It sizes from its container.** Each chart takes an explicit height rather
 * than the default `aspect-video`, which on a dense operations screen would push
 * everything below it off the fold.
 *
 * ## SVG anchors do not mirror either, and that one is worse
 *
 * `text-anchor: start | end` is resolved against the **inline base direction**,
 * so inside `dir="rtl"` they swap meaning. Recharts computes every tick and
 * label position assuming they do not — it places an Arabic axis tick at the
 * correct x and anchors it `start`, and the browser then paints the text
 * *backwards from* that point, into the plot area, underneath the bars. Nothing
 * errors; the chart simply has its labels printed on top of its own marks.
 *
 * `RankedBars` pins the SVG to `direction: ltr` for that reason and mirrors the
 * layout itself through `reversed` and the axis orientation. The tooltip is an
 * HTML element outside the SVG and keeps the document's direction.
 *
 * ## Everything is formatted before it arrives
 *
 * These components know nothing about locales. Axis ticks come in as strings the
 * server already ran through `Intl`, and the tooltip's series name is already
 * translated. That keeps `DISPLAY_TIME_ZONE`, Arabic-Indic digit suppression and
 * the message catalogue on the server where they are correct once, instead of in
 * a client bundle where they would be correct twice or not at all.
 */

export type Point = {
  /** An axis tick, already formatted for the locale. */
  label: string;
  value: number;
  /**
   * What the tooltip should print instead of the raw number — "$1.42", "12.4K".
   *
   * ⚠ A **string on the datum**, not a formatter function passed as a prop. The
   * first version took `formatValue: (value: number) => string` and every one of
   * these charts is rendered from a server component, so React refused it:
   * *"Functions cannot be passed directly to Client Components."* Neither `tsc`
   * nor eslint catches that — the page renders its error boundary at runtime.
   *
   * Formatting on the server is also where it belongs: `formatCost` and
   * `formatCurrency` need the locale and the app's `Intl` defaults, and this
   * file deliberately knows nothing about either.
   */
  display?: string;
};

/** A second series on the same axis — failures against runs, say. */
export type PairedPoint = Point & { second: number };

/**
 * The axis geometry every time-series chart in this file shares.
 *
 * Pulled out because three charts were repeating eleven identical props and the
 * one that mattered — `reversed` — is the one that is invisible when it is
 * missing. See note 1 above.
 */
const AXIS = {
  tickLine: false,
  axisLine: false,
} as const;

/**
 * Movement over time, as a filled area.
 *
 * `type="monotone"`, not `"natural"`: a natural spline overshoots between
 * points, and on counts that cannot go below zero it draws a curve dipping under
 * the axis between two quiet days — a chart inventing negative plans.
 */
export function TrendArea({
  data,
  direction,
  seriesLabel,
  height = 'h-[200px]',
}: {
  data: Point[];
  direction: Direction;
  seriesLabel: string;
  height?: string;
}) {
  const config = {
    value: { label: seriesLabel, color: 'var(--color-viz-seq-4)' },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className={`aspect-auto ${height} w-full`}>
      <AreaChart accessibilityLayer data={data} margin={{ top: 8, left: 4, right: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="admin-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-viz-seq-2)" stopOpacity={0.55} />
            <stop offset="100%" stopColor="var(--color-viz-seq-2)" stopOpacity={0.04} />
          </linearGradient>
        </defs>

        {/* Horizontal rules only. Vertical ones fence the points into boxes and
            say nothing the axis labels do not. */}
        <CartesianGrid vertical={false} />

        <XAxis
          {...AXIS}
          dataKey="label"
          reversed={direction === 'rtl'}
          tickMargin={8}
          minTickGap={24}
          interval="preserveStartEnd"
        />
        <YAxis
          {...AXIS}
          orientation={direction === 'rtl' ? 'right' : 'left'}
          width={32}
          allowDecimals={false}
        />

        <ChartTooltip content={<ChartTooltipContent />} />

        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill="url(#admin-trend-fill)"
        />
      </AreaChart>
    </ChartContainer>
  );
}

/**
 * A count per bucket, as bars.
 *
 * `highlightLast` tints the final bar, which is almost always the bucket still
 * being filled — a partial month rendered at full weight reads as a collapse in
 * signups rather than as today.
 */
export function CountBars({
  data,
  direction,
  seriesLabel,
  highlightLast = false,
  height = 'h-[200px]',
}: {
  data: Point[];
  direction: Direction;
  seriesLabel: string;
  highlightLast?: boolean;
  height?: string;
}) {
  const config = {
    value: { label: seriesLabel, color: 'var(--color-viz-seq-4)' },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className={`aspect-auto ${height} w-full`}>
      <BarChart accessibilityLayer data={data} margin={{ top: 8, left: 4, right: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />

        <XAxis {...AXIS} dataKey="label" reversed={direction === 'rtl'} tickMargin={8} />
        <YAxis
          {...AXIS}
          orientation={direction === 'rtl' ? 'right' : 'left'}
          width={32}
          allowDecimals={false}
        />

        <ChartTooltip content={<ChartTooltipContent />} />

        {/*
          ⚠ **The cap matters more than it looks.** Recharts gives a bar the
          whole of its category band, so a chart with two buckets in it draws two
          slabs a third of the panel wide — which reads as a diagram, not as a
          series. See `RankedBars` for the same failure in the other axis, which
          is where it was actually shipped.
        */}
        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
          {data.map((point, index) => (
            <Cell
              key={point.label}
              /* The in-progress bucket, drawn one step down the sequential ramp
                 rather than in a different hue: it is the same measure, less
                 complete — an ordered difference, which is what a sequential
                 scale is for. */
              fill={
                highlightLast && index === data.length - 1
                  ? 'var(--color-viz-seq-2)'
                  : 'var(--color-viz-seq-4)'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/**
 * Two series that belong on one axis — runs against failures.
 *
 * Lines rather than stacked bars. Stacking would put the failure count on top of
 * the run count and make the total read as "runs", which is exactly the number
 * the reader is trying to compare against. Two lines keep both readable and
 * their gap meaningful.
 *
 * The second series is drawn in the attention colour, because it is the one that
 * means something is wrong. That is the single exception in this file to
 * charts-are-neutral, and it is the same exception the status ramp makes
 * everywhere else in the product.
 *
 * **It carries a legend**, unlike the single-series charts: two marks on one
 * axis are two things a reader has to be told apart, and a tooltip they have to
 * find first is not a legend. One series needs none — the panel heading already
 * names it.
 */
export function PairedLines({
  data,
  direction,
  firstLabel,
  secondLabel,
  height = 'h-[220px]',
}: {
  data: PairedPoint[];
  direction: Direction;
  firstLabel: string;
  secondLabel: string;
  height?: string;
}) {
  const config = {
    value: { label: firstLabel, color: 'var(--color-viz-seq-4)' },
    second: { label: secondLabel, color: 'var(--color-status-attention-fg)' },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className={`aspect-auto ${height} w-full`}>
      <LineChart accessibilityLayer data={data} margin={{ top: 8, left: 4, right: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />

        <XAxis
          {...AXIS}
          dataKey="label"
          reversed={direction === 'rtl'}
          tickMargin={8}
          minTickGap={24}
          interval="preserveStartEnd"
        />
        <YAxis
          {...AXIS}
          orientation={direction === 'rtl' ? 'right' : 'left'}
          width={32}
          allowDecimals={false}
        />

        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />

        <Line
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          dataKey="second"
          type="monotone"
          stroke="var(--color-second)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ChartContainer>
  );
}

/** Beyond this a clinic name is cut on the axis; the tooltip still has all of it. */
const AXIS_LABEL_MAX = 15;

/**
 * The category axis's own column.
 *
 * Wide enough that a cut label never *wraps*: Recharts' `Text` breaks a tick on
 * the axis width rather than overflowing it, and a two-line tick inside a 38px
 * row collides with the row above. Cutting the string is the intended failure
 * here — wrapping is the one that looks broken.
 */
const AXIS_WIDTH = 144;

/** How tall one row of the ranking is, bar plus the air around it. */
const ROW_HEIGHT = 38;

/** Gap between the end of a bar and the value printed past it. */
const LABEL_OFFSET = 8;

/** The shortest the panel goes, however few rows there are. */
const MIN_HEIGHT = 120;

/**
 * Room at the open end of a bar for the value printed beside it.
 *
 * Measured from the longest string rather than pinned, because the callers
 * print different kinds of money: `US$ 0.0286` is ten characters and a shekel
 * total in Arabic can be half as long again, and a gutter that fits one clips
 * the other at the edge of the SVG — the longest bar reaches the edge of the
 * plot by definition, so its label is the one that falls off.
 *
 * 7px per character is a deliberate over-estimate for 12px text; the cost of
 * being generous is a slightly shorter longest bar, and the cost of being tight
 * is a number nobody can read.
 */
function valueGutter(data: Point[]): number {
  const longest = data.reduce((most, point) => Math.max(most, point.display?.length ?? 0), 0);

  return Math.min(160, Math.max(48, longest * 7 + LABEL_OFFSET + 4));
}


/**
 * A ranked horizontal bar — spend per clinic, money moved per clinic.
 *
 * Horizontal because the category labels are clinic names and model ids, which
 * are long in both languages and unreadable rotated. `layout="vertical"` is
 * Recharts' name for bars that run along the x-axis.
 *
 * ⚠ RTL here is the *y*-axis's orientation, not the x-axis's `reversed`: the
 * categories run down the side, and which side that is follows the document.
 *
 * ## What was wrong with it, because it shipped
 *
 * **A fixed 220px panel and no cap on the bar.** Recharts divides the plot
 * height by the number of categories and gives each bar its whole band, so with
 * one clinic in the window this drew a *single charcoal rectangle 200 pixels
 * tall and the full width of the card*. Not a chart with one bar in it — a
 * filled box, with the clinic's name printed inside it in the axis colour. It
 * looked exactly like a failed render, which is the worst way for a correct
 * component to be wrong.
 *
 * Two rules now, and they are the same rule twice: **the height follows the
 * rows** (`ROW_HEIGHT` each, so three clinics is a third of the panel eight
 * would need) and **the bar never exceeds `maxBarSize`** whatever height it is
 * given. Either alone leaves the other failure.
 *
 * **And the value was only in the tooltip.** "Every value must be available
 * without hover" — docs/design-system.md, Charts — and on a ranked chart the
 * value *is* the content; the ordering already carries the comparison. It is
 * printed at the open end of each bar now, which is also why the plot reserves
 * a gutter on that side (see `valueGutter`): a label with no room is a label Recharts clips at
 * the edge of the SVG.
 */
export function RankedBars({
  data,
  direction,
  seriesLabel,
}: {
  data: Point[];
  direction: Direction;
  seriesLabel: string;
}) {
  const rtl = direction === 'rtl';
  const gutter = valueGutter(data);

  const config = {
    value: { label: seriesLabel, color: 'var(--color-viz-seq-4)' },
  } satisfies ChartConfig;

  return (
    <ChartContainer
      config={config}
      /*
        ⚠ `direction: ltr` **on the SVG only** — see "SVG anchors do not mirror"
        above. The tooltip is an HTML div outside the SVG, so it keeps the
        document's direction and its own text stays Arabic-first.
      */
      className="aspect-auto w-full [&_svg]:[direction:ltr]"
      /*
        A style rather than a height class: the number is derived from the row
        count, and a `h-[${n}px]` template is a class Tailwind never sees at
        build time and therefore never generates.
      */
      /* A floor as well as a per-row height: one clinic in the window is a
         legitimate answer, and a 54px panel under a heading reads as a chart
         that failed to draw rather than as a ranking with one entry in it. */
      style={{ height: Math.max(MIN_HEIGHT, data.length * ROW_HEIGHT + 16) }}
    >
      <BarChart
        accessibilityLayer
        data={data}
        layout="vertical"
        /* The open end of the bars, where the value is printed. Recharts'
           margins are physical, and which end is open follows `reversed`. */
        margin={{ top: 4, bottom: 4, left: rtl ? gutter : 0, right: rtl ? 0 : gutter }}
        barCategoryGap="22%"
      >
        {/* No grid. The x-axis is hidden, so a vertical rule would be a line
            with nothing to measure against. */}
        <XAxis type="number" hide reversed={rtl} domain={[0, 'dataMax']} />
        <YAxis
          {...AXIS}
          type="category"
          dataKey="label"
          orientation={rtl ? 'right' : 'left'}
          width={AXIS_WIDTH}
          tickMargin={8}
          /* Cut on the axis, whole in the tooltip. An untruncated clinic name
             overflows into the plot and is painted over by its own bar. */
          tickFormatter={(value: string) =>
            value.length > AXIS_LABEL_MAX ? `${value.slice(0, AXIS_LABEL_MAX - 1)}…` : value
          }
        />

        {/*
          The formatter is defined here, inside the client component, and reads
          the preformatted string off the datum. A formatter passed in as a prop
          would be a function crossing the server/client boundary — see `Point`.
        */}
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) =>
                (item?.payload as Point | undefined)?.display ?? String(value)
              }
            />
          }
        />

        <Bar dataKey="value" fill="var(--color-value)" radius={6} maxBarSize={22}>
          <LabelList dataKey="display" content={<ValueAtBarEnd rtl={rtl} />} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/**
 * The value, printed just past the open end of its bar.
 *
 * ## Why this is drawn by hand rather than `position="right"`
 *
 * `LabelList`'s named positions are computed against the bar's rectangle, and
 * they are **not symmetric under `reversed`**. With the axis reversed for Arabic
 * the bars grow leftward, so the open end is the rectangle's `x`; `position`
 * `"left"` should therefore be the mirror of `"right"`. Measured, it is not — it
 * put every label back at the closed end, `x + width + offset`, which is where
 * the *category axis* is. All five labels landed on the same pixel, stacked on
 * top of the axis they were supposed to be opposite.
 *
 * A named position that silently ignores the axis it is measured against is not
 * something to build a bilingual screen on. Twelve lines of arithmetic are.
 *
 * `textAnchor` is the other half: `start` and `end` are resolved against the
 * *inline base direction*, so under `dir="rtl"` they swap, and every position
 * Recharts computes for a tick or a label is then painted on the wrong side of
 * its own coordinate. That is why the container pins the SVG to `ltr` — the
 * anchors below mean what they say, and the axis ticks Recharts places itself
 * land where it intended too.
 */
function ValueAtBarEnd({
  rtl,
  x,
  y,
  width,
  height,
  value,
}: {
  rtl: boolean;
  /* Supplied by Recharts when it clones this element for each bar. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: string | number;
}) {
  if (x === undefined || y === undefined || width === undefined || height === undefined) return null;
  if (value === undefined || value === null || value === '') return null;

  /*
    ⚠ The rectangle Recharts hands over is **not normalised**. With the value
    axis reversed it reports the bar's origin as `x` and a *negative* `width`,
    so `x` is the closed end and `x + width` the open one — the opposite of the
    unreversed case, and the reason the named positions get it wrong. Taking the
    two extremes and picking by direction is correct for either sign.
  */
  const start = Math.min(x, x + width);
  const end = Math.max(x, x + width);

  return (
    <text
      x={rtl ? start - LABEL_OFFSET : end + LABEL_OFFSET}
      y={y + Math.abs(height) / 2}
      /* Optical centring on the cap height, which `dominant-baseline` does not
         do consistently across browsers at this size. */
      dy="0.32em"
      textAnchor={rtl ? 'end' : 'start'}
      className="fill-foreground"
      fontSize={12}
    >
      {value}
    </text>
  );
}
