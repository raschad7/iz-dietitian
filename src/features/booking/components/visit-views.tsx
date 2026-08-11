'use client';

import { useState, type ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';

/**
 * The three ways to read one visit record, and the switch between them.
 *
 * **A `Segmented`, not a second row of link tabs.** The record already carries a
 * tab bar — Info, Nutrition, Visits, Plans, Portal — and those are *addresses*;
 * these three are views of the page you are already on, which is the exact split
 * docs/design-system.md draws between the two controls. Drawing them as another
 * underlined strip would stack two identical-looking bars and leave the reader
 * working out which one moved them off the record.
 *
 * ## One card, and the switch is in its header
 *
 * The switch used to sit *above* the card, which pushed the card's top edge a
 * control's height below the summary rail beside it — two panels on one row
 * starting at two different heights, which reads as a layout that failed rather
 * than as a deliberate offset. In the header it is on the rail's own first line,
 * both columns start together, and the header earns its width: the view's name
 * and its count on the inline-start edge, the way to change it on the other.
 *
 * ## The panels are server-rendered
 *
 * Every view arrives as `ReactNode` already built on the server; this component
 * owns one piece of state and decides which of them is on screen. Nothing about
 * a visit crosses the boundary as data, no formatter or locale runs twice, and
 * the client bundle gains a `useState` rather than the whole record — the same
 * arrangement `PaginatedVisits` uses inside the past view.
 *
 * Only the active panel is mounted. The alternative — rendering all three and
 * hiding two — keeps three copies of the history in the DOM, and the past view
 * has its own pagination state that would go on living inside a hidden panel.
 *
 * ## Height
 *
 * The card fills the column and the *content* scrolls, never the card: the
 * header carries the count and the switch, and a header that scrolls away takes
 * both with it. `min-h-0` at every level is what lets the flex child actually
 * shrink instead of growing the page — without it the scroll port silently
 * becomes as tall as its content and the whole record scrolls instead.
 */
export type VisitView = 'timeline' | 'upcoming' | 'past';

export type VisitViewOption = {
  value: VisitView;
  label: string;
  /** Shown beside the heading as a bare numeral. */
  count: number;
};

export function VisitViews({
  label,
  options,
  timeline,
  upcoming,
  past,
}: {
  /** Names the switch for a screen reader — "Visit record views". */
  label: string;
  /** Ordered, and the order is the tab order. Labels are already translated. */
  options: readonly VisitViewOption[];
  timeline: ReactNode;
  upcoming: ReactNode;
  past: ReactNode;
}) {
  const [view, setView] = useState<VisitView>('timeline');

  const panels: Record<VisitView, ReactNode> = { timeline, upcoming, past };
  const active = options.find((option) => option.value === view);

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader className="grid-cols-[1fr_auto] items-center gap-3">
        <CardTitle as="h2" className="flex items-baseline gap-2">
          {active?.label ?? label}
          {/* A bare numeral, never a pill. See "A badge is a state" in
              docs/design-system.md — this is a quantity. */}
          <span className="text-body-md font-semibold tabular-nums text-muted-foreground">
            {active?.count ?? 0}
          </span>
        </CardTitle>

        <Segmented
          label={label}
          size="sm"
          options={options}
          value={view}
          onChange={setView}
          /*
            **The selected segment is the sunken neutral, not the brand olive.**

            Olive is this app's action colour, and on this tab it is already
            spent on the four things that are *about the appointments* — the
            next-visit row in the rail, today's date mark, the current dot on the
            timeline, and the one button that books. A fifth olive fill on the
            control that merely says which list you are looking at competed with
            all four, and it was the largest of them.

            Grey states the same fact without claiming to be one of those: the
            thumb is `--muted` — the c-100 cream the sunken surfaces use — with
            full-strength foreground on it, which measures well past the 4.5:1
            floor and reads as "you are here" rather than as "do this".

            `inactiveClassName` has to be passed with it. Its default hover is
            `bg-secondary`, the olive tint, and an unselected segment lighting up
            olive while the selected one sits in grey inverts the whole meaning
            of the control. Both halves now live on the same neutral ramp.
          */
          activeClassName="bg-muted text-foreground"
          inactiveClassName="text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        />
      </CardHeader>

      {/*
        `role="tabpanel"` with the active view's own name. `aria-controls` is
        deliberately absent rather than guessed: `Segmented` does not put ids on
        its buttons, and a dangling `aria-controls` pointing at nothing is worse
        for a screen reader than an honestly labelled panel.

        `overscroll-contain` so reaching the end of the history does not hand the
        wheel to the record shell behind it and jump the whole page.
      */}
      <CardContent
        role="tabpanel"
        aria-label={active?.label ?? label}
        className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {panels[view]}
      </CardContent>
    </Card>
  );
}
