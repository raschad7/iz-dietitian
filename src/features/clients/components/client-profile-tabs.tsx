'use client';

import { type ReactNode } from 'react';

import {
  PanelTabs,
  PanelTabsList,
  PanelTabsPanel,
  PanelTabsTrigger,
} from '@/components/ui/panel-tabs';
import { cn } from '@/lib/utils';

/**
 * The four views of a client's record, and the one bar that switches between
 * them: **Nutrition, Account, Security, Billing &amp; Plans**.
 *
 * The `users/view` template's bar, cut to the views this product has something
 * to put in. Its Notifications and Connections tabs are gone — see
 * `client-profile.tsx` for what each of the survivors holds and what the two
 * that went were carrying.
 *
 * ## One bar, not two
 *
 * Nutrition was a route with a strip of link tabs of its own a row above this
 * one, which meant a record answered "which section am I in?" twice, in two
 * different visual languages, and a reader had to learn which of the two bars
 * would move them off the page. Every old route redirects into this bar now, so
 * the record has exactly one control for the question.
 *
 * The trade is honest and worth naming: those sections are no longer
 * *addresses*, so they cannot be middle-clicked into a new tab, and the
 * browser's Back button does not step between them. `?tab=` is what buys most of
 * it back — every view has a URL that opens on it, which is what the redirects
 * use and what a colleague can be sent.
 *
 * ## The panels are server-rendered
 *
 * Every view arrives as a `ReactNode` already built on the server; this
 * component owns the selection and nothing else. No client record crosses the
 * boundary as data, no formatter or locale runs twice, and the client bundle
 * gains a tablist rather than a screen — the same arrangement `VisitViews` uses
 * inside the Visit history view.
 *
 * Only the selected panel is mounted, which is the primitive's default and the
 * right call here: the nutrition record and the Account view's visit history are
 * the two largest subtrees on the screen, and neither has any business rendering
 * while the other is being read.
 *
 * ## `defaultTab`
 *
 * Uncontrolled, seeded by the page from `?tab=`. Choosing a tab afterwards does
 * not rewrite the URL: a view switch is not a navigation, and pushing a history
 * entry for one would make Back undo a glance.
 */
export const PROFILE_TABS = ['nutrition', 'account', 'security', 'billing'] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number];

export function ClientProfileTabs({
  label,
  labels,
  defaultTab = 'nutrition',
  nutritionGaps = 0,
  panels,
}: {
  /** Names the tablist for a screen reader — "Record views". */
  label: string;
  /** Already translated, in the order the tabs are drawn. */
  labels: Record<ProfileTab, string>;
  defaultTab?: ProfileTab;
  /**
   * How many nutrition fields are still blank, drawn on that tab as a bare
   * numeral — so the record says what needs attention before anyone has opened
   * it. Omitted at zero, because a count reading "0" is a count with nothing to
   * say.
   */
  nutritionGaps?: number;
  /** One server-rendered subtree per view. */
  panels: Record<ProfileTab, ReactNode>;
}) {
  return (
    <PanelTabs defaultValue={defaultTab} className="lg:h-full">
      <PanelTabsList label={label}>
        {PROFILE_TABS.map((tab) => (
          <PanelTabsTrigger key={tab} value={tab}>
            {labels[tab]}
            {tab === 'nutrition' && nutritionGaps > 0 ? (
              /* A bare numeral, never a pill — see "A badge is a state" in
                 docs/design-system.md. This is a quantity. It inherits nothing
                 from the tab's state beyond its opacity, so it never looks like
                 it belongs to a different tab than its label. */
              <span className="shrink-0 text-label font-semibold tabular-nums opacity-70">
                {nutritionGaps}
              </span>
            ) : null}
          </PanelTabsTrigger>
        ))}
      </PanelTabsList>

      {PROFILE_TABS.map((tab) => (
        /*
          The view scrolls, not the page. From `lg` up this column is a bounded
          box inside the record shell, so the tab bar stays put and the content
          under it moves.

          **Account is the exception, and it scrolls nothing at all.** Its
          subject is the visit record, which is built to fill a bounded box and
          scroll its own history inside a card whose header stays put. Letting
          the panel scroll as well put a second bar beside that one, half a
          finger apart, each moving a different thing — so the view fills instead
          and hands the scrolling to the one place that owns it.

          ⚠ **The inline padding is what stops the cards looking sliced.**
          Setting `overflow` to anything but `visible` — `hidden` included —
          makes this box clip on all four edges, and a `Card` draws its ring and
          olive-tinted shadow *outside* its border box. Flush against the clip,
          the ring vanished on whichever edge a card touched. The negative margin
          gives that padding back to the column so the panel still spans it.
        */
        <PanelTabsPanel
          key={tab}
          value={tab}
          className={cn(
            'lg:-mx-1 lg:px-1 lg:pt-1',
            tab === 'account'
              ? 'lg:overflow-hidden lg:pb-1'
              : 'lg:overflow-y-auto lg:overscroll-contain lg:pb-6',
          )}
        >
          {panels[tab]}
        </PanelTabsPanel>
      ))}
    </PanelTabs>
  );
}
