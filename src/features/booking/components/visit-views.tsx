'use client';

import { useState, type ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/utils';

/**
 * The two halves of a visit record — what is booked and what has happened — and
 * the switch between them.
 *
 * **It used to be three.** The third was a timeline of the whole run, past and
 * upcoming threaded on one rail, and it was the view this card opened on. A
 * dietitian opening a patient's record is asking one of two questions — "when
 * are they next in?" or "when did I last see them?" — and the merged run
 * answered both by making the reader find today in the middle of it. The split
 * that remains *is* those two questions, and the card opens on the first.
 *
 * **A `Segmented`, not a row of tabs.** The record carries a tab bar of its own
 * — Nutrition, Progress, Visits, The Gate, Plans — and those switch the
 * subject of the page; these two switch which half of one card's list you are
 * reading.
 *
 * It is the *same* control as that bar — `contained`, so the selection is a
 * white card sliding through a grey well — because both answer "which view am I
 * in?" and answering one question two ways is how a screen stops feeling built
 * by one hand. What keeps them from reading as two competing strips is scale and
 * place, not species: the bar spans the panel above and carries a mark per view,
 * while this one is content-width, unmarked, and lives *inside* a card header
 * beside the count of what it is switching.
 *
 * ## One card, and the switch is in its header
 *
 * The header states what the card *is* — the patient's visits — with the count
 * of whichever half is showing beside it, and the way to change halves on the
 * other edge. The title deliberately does not follow the switch: see `title`.
 *
 * ## The panels are server-rendered
 *
 * Every view arrives as `ReactNode` already built on the server; this component
 * owns one piece of state and decides which of them is on screen. Nothing about
 * a visit crosses the boundary as data, no formatter or locale runs twice, and
 * the client bundle gains a `useState` rather than the whole record.
 *
 * Only the active panel is mounted. Rendering both and hiding one keeps two
 * copies of the history in the DOM for the benefit of nobody.
 *
 * ## Height
 *
 * The card fills the column and the *content* scrolls, never the card: the
 * header carries the count and the switch, and a header that scrolls away takes
 * both with it. `min-h-0` at every level is what lets the flex child actually
 * shrink instead of growing the page — without it the scroll port silently
 * becomes as tall as its content and the whole record scrolls instead. It is
 * also why the Account view around it scrolls nothing of its own: two scrollbars
 * a finger apart, each moving a different thing, is worse than either.
 *
 * A tablet is inside that arrangement, not an exception to it: the height is
 * keyed on width alone, so at `lg` the card reaches the bottom of the screen on
 * glass exactly as it does on a laptop, and the history scrolls inside it.
 *
 * ⚠ There was a revision that let it grow instead on a coarse pointer, on the
 * grounds that a landscape tablet matches `lg` with only 768px of height and the
 * port left over is small. That is a real constraint and this is not the answer
 * to it: what pays for the port is the space above it, which is why the doubled
 * gap below was removed. If the port is still too short, take height from the
 * facts strip or the plans card — do not let the card stop filling, or it ends
 * partway down the screen with the panel around it not scrolling either.
 */
export type VisitView = 'upcoming' | 'past';

export type VisitViewOption = {
  value: VisitView;
  label: string;
  /** Shown beside the heading as a bare numeral. */
  count: number;
};

export function VisitViews({
  title,
  label,
  options,
  upcoming,
  past,
}: {
  /**
   * The card's own heading, and it does not change with the switch.
   *
   * It used to be the active view's name — which read "Timeline 24" beside a
   * control whose selected segment already said Timeline, so the header stated
   * the switch back to the reader and never once said what the card was about.
   * The card is the patient's visits; the switch says which of them.
   */
  title: string;
  /** Names the switch for a screen reader — "Visit record views". */
  label: string;
  /** Ordered, and the order is the tab order. Labels are already translated. */
  options: readonly VisitViewOption[];
  upcoming: ReactNode;
  past: ReactNode;
}) {
  const [view, setView] = useState<VisitView>('upcoming');

  const panels: Record<VisitView, ReactNode> = { upcoming, past };
  const active = options.find((option) => option.value === view);

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader className="grid-cols-[1fr_auto] items-center gap-3">
        <CardTitle as="h2" className="flex items-baseline gap-2">
          {title}
          {/* A bare numeral, never a pill. See "A badge is a state" in
              docs/design-system.md — this is a quantity. */}
          <span className="text-body-md font-semibold tabular-nums text-muted-foreground">
            {active?.count ?? 0}
          </span>
        </CardTitle>

        {/*
          `contained` — the same control the record's own tab bar above it uses,
          and the calendar's day/week/month switch: a sunken neutral well with a
          white card lifted out of it, and the card *slides* between the halves
          rather than blinking on in place. Two switches on one screen that
          answer the same kind of question should also move the same way; this
          one used to re-tint a bordered segment, which read as a different
          species of control sitting a few pixels under the profile tabs.

          No icons on the segments. The profile bar carries them because it has
          five views and drops its labels below `sm`; two labelled halves have
          nothing a mark would clarify.

          **No `activeClassName`/`inactiveClassName`.** They used to force the
          thumb to `bg-muted` and unpick the olive hover, which was the right
          call against the old olive default — olive is already spent on this
          view's date marks and its calendar button, and a fifth olive fill on
          the control that merely says *which half* would have been the loudest
          thing here. `contained` resolves to the white raised card on a grey
          track on its own, and its unselected halves only darken their label, so
          both overrides are now saying what the shape already says.
        */}
        <Segmented
          label={label}
          size="sm"
          shape="contained"
          options={options}
          value={view}
          onChange={setView}
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
        className={cn(
          'min-h-0 flex-1 overflow-y-auto overscroll-contain',
          /*
            ⚠ No `mt-*` here, and it is worth knowing why the obvious one is
            wrong. `Card` already sets `gap-(--card-spacing)` between its header
            and its content — 16px, 20px from `sm` up — so a margin on top of
            that is not "some breathing room", it is a second full gap. The two
            together put 32–36px between the heading and the first visit, which
            on a tablet is most of the reason a reader had to scroll to see one
            card at all.
          */
        )}
      >
        {panels[view]}
      </CardContent>
    </Card>
  );
}
