'use client';

import dynamic from 'next/dynamic';

import { cn } from '@/lib/utils';

/**
 * The dashboard's two plots, held behind a dynamic import.
 *
 * ## Why this module exists at all
 *
 * The plots themselves are in `stat-plots.tsx` and are unchanged — this file
 * adds nothing to the dashboard and takes nothing away from it. What it changes
 * is *when* Recharts is fetched, parsed and evaluated.
 *
 * Recharts is by a wide margin the largest thing this product asks a browser to
 * run: 8.2MB installed, and the built bundle is the biggest single dependency
 * in the client graph. Imported statically, it sat in the dashboard's own
 * first-load JavaScript — so every visit paid to download it, parse it and
 * evaluate it before the page could respond to a tap, whether or not the reader
 * ever looked at either card. That cost lands on Total Blocking Time almost
 * exactly: it is main-thread work, it is unavoidable once the module is in the
 * graph, and it happens during the window Lighthouse measures.
 *
 * There was no code splitting anywhere in this codebase before this — not one
 * `next/dynamic` and not one `React.lazy` — so this is also the first instance
 * of a pattern the two other Recharts call sites now follow (see
 * `client-progress-chart.tsx`, which is the same three lines).
 *
 * ## Why the call sites did not have to change
 *
 * `stat-cards.tsx` imports `AppointmentsChart`, `ClientIntakeChart` and
 * `ChartPoint` from this path and still does. Keeping the module specifier and
 * the export names is the whole point: a dynamic boundary that required every
 * caller to know about it would be a refactor rather than an enhancement, and
 * this is meant to be invisible above the fold of the diff.
 *
 * `ChartPoint` is re-exported as a type, which costs nothing at runtime —
 * `export type` is erased, so naming it here does not drag `stat-plots.tsx`
 * back into the static graph.
 *
 * ## `ssr: false`, and what fills the gap
 *
 * Both plots are already client-only in every sense that matters: Recharts
 * measures its container to lay itself out, so its server render is a wrapper
 * with no chart in it, replaced on hydration. Rendering it on the server was
 * therefore buying a flash rather than content, and `ssr: false` drops the
 * duplicate work without changing what anybody sees.
 *
 * ⚠ **The placeholder must be exactly the plot's height or this trades TBT for
 * CLS.** `PLOT_HEIGHT` is 132px in `stat-plots.tsx` and is restated here rather
 * *restated* here rather than imported: importing any value — not just a
 * component — from that module would put it back in the static graph and undo
 * the split entirely. That makes these two constants a pair with nothing but
 * this note holding them together, so **whoever changes the plot height has to
 * change it in both files**.
 */
const PLOT_HEIGHT = 'h-[132px] w-full';

/**
 * What stands in while Recharts arrives.
 *
 * Deliberately empty rather than a skeleton with a shimmer: the plots sit
 * *inside* stat cards that are fully server-rendered — heading, headline figure
 * and footer are all painted already — so the card reads as complete and only
 * its illustration is late. A pulsing block there would announce a wait the
 * reader has no reason to care about, and would draw the eye away from the
 * number the card exists to show.
 */
function PlotPlaceholder() {
  return <div aria-hidden="true" className={cn(PLOT_HEIGHT, 'shrink-0')} />;
}

export type { ChartPoint } from './stat-plots';

export const ClientIntakeChart = dynamic(
  () => import('./stat-plots').then((m) => m.ClientIntakeChart),
  { ssr: false, loading: PlotPlaceholder },
);

export const AppointmentsChart = dynamic(
  () => import('./stat-plots').then((m) => m.AppointmentsChart),
  { ssr: false, loading: PlotPlaceholder },
);
