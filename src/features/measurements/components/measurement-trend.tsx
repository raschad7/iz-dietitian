'use client';

import dynamic from 'next/dynamic';

import { cn } from '@/lib/utils';

/**
 * The measurement trend, held behind a dynamic import.
 *
 * The same three lines, and the same reasoning, as `ClientProgressChart` — read
 * the long note there and in `dashboard/components/stat-charts.tsx` for why
 * Recharts is worth splitting out and why the call site did not have to change.
 * The plot itself is untouched in `measurement-trend-plot.tsx`.
 *
 * It earns the split for the same reason the progress chart does, and a little
 * harder: this sits inside one panel of a client's record, and a reader who
 * opened the record to check a phone number would otherwise fetch, parse and
 * evaluate the whole of Recharts on the way to a screen that never draws a
 * chart. The Measurements tab is also not the default view — Nutrition is — so
 * the common case is that this never renders at all.
 *
 * ⚠ `PLOT_HEIGHT` mirrors `h-56` in `measurement-trend-plot.tsx` and is restated
 * rather than imported, because importing any value from that module would put
 * it back in the static graph. The placeholder has to keep matching the plot or
 * this trades blocking time for layout shift, so **whoever changes the height
 * has to change it in both files**.
 */
const PLOT_HEIGHT = 'h-56 w-full';

function PlotPlaceholder() {
  return <div aria-hidden="true" className={cn(PLOT_HEIGHT, 'shrink-0')} />;
}

export type { TrendMetricSeries, TrendPoint } from './measurement-trend-plot';

export const MeasurementTrend = dynamic(
  () => import('./measurement-trend-plot').then((m) => m.MeasurementTrendChart),
  { ssr: false, loading: PlotPlaceholder },
);
