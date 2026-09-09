'use client';

import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';

import { MeasurementTrend, type TrendMetricSeries } from './measurement-trend';

/**
 * The trend card: a heading, the metric picker beside it, and the plot beneath.
 *
 * ## Why the picker moved up here
 *
 * It used to sit inside the chart, in its own row between the card's heading
 * and the plot — so the card spent three stacked rows before drawing anything,
 * and the heading's line had a wide empty half beside it while the chips had a
 * full-width row of their own. They are one control and one label for the same
 * thing; putting them on one line is what the record's other cards already do
 * with their title and their actions.
 *
 * Two things fall out of the move, and both are improvements rather than
 * side-effects:
 *
 * - **The chips arrive with the heading.** The plot is behind a dynamic import
 *   (see `measurement-trend.tsx`), and while Recharts loads the card used to
 *   show a title over an empty box. The picker is plain markup and renders
 *   immediately, so a reader can choose a metric before the chart exists.
 * - **The selection survives the plot.** Holding `metric` here rather than
 *   inside the lazily-mounted chart means it is not tied to that module's
 *   lifetime.
 *
 * A client component, and the only one this card needs: the panel around it is
 * a server component and cannot hold the selection.
 */
export function MeasurementTrendCard({
  series,
  title,
  subtitle,
  pickLabel,
}: {
  /** Pre-filtered to metrics with at least two points — see the plot's note. */
  series: TrendMetricSeries[];
  title: string;
  subtitle: string;
  pickLabel: string;
}) {
  const [metric, setMetric] = useState(series[0]?.metric ?? '');

  if (series.length === 0) return null;

  const active = series.some((entry) => entry.metric === metric) ? metric : (series[0]?.metric ?? '');

  return (
    <Card>
      {/*
        One row on a desktop, wrapping on a phone.

        `items-center` and not `items-baseline`: the heading is text and the
        picker is a 40px track, and aligning their baselines hangs the track low
        against the line. `me-auto` on the subtitle is what pushes the picker to
        the far end — the same construction the history card below uses to put
        its buttons there.
      */}
      <CardHeader className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <CardTitle>{title}</CardTitle>
        <p className="me-auto text-caption text-muted-foreground">{subtitle}</p>

        {/*
          The picker scrolls sideways; it does not wrap.

          `flex-wrap` on a `size="sm"` track is a contradiction: the height is
          set on the track (40px, to match a `Button size="sm"` beside it) and a
          second row of chips has nowhere to go inside it. On a 375px phone the
          last two Arabic labels — نسبة الدهون and مؤشر كتلة الجسم — fell
          straight out of the rounded box and landed on top of the chart.

          Scrolling is what the design system asks for here: "horizontal tab
          sets scroll on narrow screens instead of wrapping into two ambiguous
          rows". The bar's own scrollbar is hidden globally, and the cue is the
          chip cut off at the edge.

          `min-w-0` on the scroller: it is a flex child, and without it the
          `min-w-max` track below sets its min-content width and the row refuses
          to shrink — pushing the chips off the card instead of scrolling them.
        */}
        <div className="-mx-0.5 min-w-0 max-w-full overflow-x-auto px-0.5">
          <Segmented
            role="radiogroup"
            /*
              `contained` — the recessed track with a raised white thumb that the
              record's tab bar and the comparison switch above both wear. It was
              the `default` shape, which fills the selected chip with solid brand
              green: three segmented controls on one screen, one of them
              shouting. Elevation carries the selection here, so the green is
              left to the things that are actually actions.
            */
            shape="contained"
            label={pickLabel}
            value={active}
            onChange={setMetric}
            options={series.map((entry) => ({ value: entry.metric, label: entry.label }))}
            /*
              `min-w-max`, and it is what makes the scroll work. `contained` is
              an `inline-grid` of `minmax(0, 1fr)` columns, so inside a narrower
              box the columns shrink and the labels clip instead of the track
              overflowing. Sized to its content, the track keeps its equal
              columns — which the travelling thumb depends on — and the wrapper
              scrolls.

              A width, not a `display` utility: see the warning on `Segmented`
              about what happens to the thumb when a call site changes the
              layout mode.
            */
            className="min-w-max"
          />
        </div>
      </CardHeader>

      <CardContent>
        <MeasurementTrend series={series} metric={active} />
      </CardContent>
    </Card>
  );
}
