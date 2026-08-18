'use client';

import dynamic from 'next/dynamic';

import { cn } from '@/lib/utils';

/**
 * The client's weight plot, held behind a dynamic import.
 *
 * The same three lines, and the same reasoning, as
 * `features/dashboard/components/stat-charts.tsx` — read the long note there
 * for why Recharts is worth splitting out and why the call site did not have to
 * change. The plot itself is untouched in `client-progress-plot.tsx`.
 *
 * This one is arguably the more valuable of the two. The dashboard at least
 * *shows* both its plots the moment it opens; this chart lives inside
 * `ClientProgressPanel`, one panel among several on a client's record, and a
 * reader who came to check a phone number or a visit history never looks at it
 * — yet the whole of Recharts was fetched, parsed and evaluated on the way to
 * every client page regardless.
 *
 * ⚠ `PLOT_HEIGHT` is `h-56` in `client-progress-plot.tsx` and is restated here
 * rather than imported, because importing any value from that module would put
 * it back in the static graph and undo the split. The placeholder has to keep
 * matching the plot or this trades blocking time for layout shift, so
 * **whoever changes the height has to change it in both files**.
 */
const PLOT_HEIGHT = 'h-56 w-full';

function PlotPlaceholder() {
  return <div aria-hidden="true" className={cn(PLOT_HEIGHT, 'shrink-0')} />;
}

export type { ProgressChartPoint } from './client-progress-plot';

export const ClientProgressChart = dynamic(
  () => import('./client-progress-plot').then((m) => m.ClientProgressChart),
  { ssr: false, loading: PlotPlaceholder },
);
