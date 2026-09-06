'use client';

import { useState, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  PanelTabs,
  PanelTabsList,
  PanelTabsPanel,
  PanelTabsTrigger,
} from '@/components/ui/panel-tabs';

/**
 * The three usage breakdowns and the failure list, as one switched panel.
 *
 * ## Why they stopped being four stacked sections
 *
 * The screen printed them one under another: by clinic, then a two-column row
 * holding by-model and by-kind, then the failures. Four tables of the same five
 * numeric columns, differing only in what the first column names — so a screen
 * that answers one question ("who is spending, on what") was three scrolls of
 * near-identical grids, and the two in the split row were half-width for no
 * reason except that they fitted.
 *
 * They are the same table asked three ways, which is exactly the case a tab set
 * is for: one region of the page, one width, one heading, and the reader picks
 * the cut. `PanelTabs` is the app's own tablist — the ARIA pattern, arrow keys
 * and roving focus from Base UI, reading direction from the provider the layout
 * already mounts — rather than four `<h2>`s.
 *
 * ## The failure count is on its tab
 *
 * A tab set hides what you are not looking at, and "recent failures" is the one
 * cut that must not be missable when it has something in it. The count rides on
 * the tab as an attention badge, so the panel says there are three failures
 * without being opened; with none, the tab is not offered at all.
 *
 * ## Server tables, client switch
 *
 * Each panel is a server-rendered subtree handed in as a child, so no table
 * crosses into the browser bundle — the switch is the only client code here, and
 * `PanelTabsPanel` unmounts the views you are not on rather than keeping four
 * tables in the DOM at once.
 */
export function UsageBreakdown({
  clinicLabel,
  modelLabel,
  scopeLabel,
  failuresLabel,
  ariaLabel,
  failureCount,
  clinic,
  model,
  scope,
  failures,
}: {
  clinicLabel: string;
  modelLabel: string;
  scopeLabel: string;
  failuresLabel: string;
  /** Names the tablist for a screen reader. */
  ariaLabel: string;
  failureCount: number;
  clinic: ReactNode;
  model: ReactNode;
  scope: ReactNode;
  failures: ReactNode;
}) {
  /*
    Uncontrolled would do, except that the failures tab can disappear between
    renders — a range change that drops the last failure — and Base UI would be
    left pointing at a value with no tab. Holding the value here lets the guard
    below fall back to the first cut instead.
  */
  const [tab, setTab] = useState('clinic');
  const value = tab === 'failures' && failureCount === 0 ? 'clinic' : tab;

  return (
    <Card>
      <CardContent className="p-4">
        <PanelTabs
          value={value}
          onValueChange={(next) => {
            // Base UI can report `null` when the selected tab is removed — the
            // failures tab, on a range with nothing failing. The guard above
            // has already answered that case; this only takes real choices.
            if (typeof next === 'string') setTab(next);
          }}
        >
          <PanelTabsList label={ariaLabel}>
            <PanelTabsTrigger value="clinic">{clinicLabel}</PanelTabsTrigger>
            <PanelTabsTrigger value="model">{modelLabel}</PanelTabsTrigger>
            <PanelTabsTrigger value="scope">{scopeLabel}</PanelTabsTrigger>
            {failureCount > 0 ? (
              <PanelTabsTrigger value="failures">
                {failuresLabel}
                <Badge variant="attention">{failureCount}</Badge>
              </PanelTabsTrigger>
            ) : null}
          </PanelTabsList>

          <PanelTabsPanel value="clinic">{clinic}</PanelTabsPanel>
          <PanelTabsPanel value="model">{model}</PanelTabsPanel>
          <PanelTabsPanel value="scope">{scope}</PanelTabsPanel>
          {failureCount > 0 ? <PanelTabsPanel value="failures">{failures}</PanelTabsPanel> : null}
        </PanelTabs>
      </CardContent>
    </Card>
  );
}
