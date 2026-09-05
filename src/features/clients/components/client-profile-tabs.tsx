'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { Icon, type IconName } from '@/components/ui/icon';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/utils';

/*
 * `PROFILE_TABS` and `ProfileTab` live in `./profile-tab` — a plain module, not
 * this Client Component — because a Server Component reading the runtime array
 * needs the array itself, not the client-reference stub the bundler substitutes
 * for a value exported from a `'use client'` file. Import from `./profile-tab`
 * directly rather than re-importing them through here.
 */
import { type ProfileTab, PROFILE_TABS } from './profile-tab';

/**
 * The views of a client's record, and the one bar that switches between
 * them: **Nutrition, Progress, Visits, The Gate, Plans**.
 *
 * ## It is the Settings control, in the record
 *
 * This is `SettingsWorkspace`'s bar and panel, and deliberately so: the two
 * screens were asking the same question — "which view of this one page am I
 * in?" — with two different controls and two different answers to what a switch
 * should feel like. Settings slid a thumb between segments and cross-faded its
 * panel; the record snapped a raised card into place under a panel that
 * appeared instantly, which reads as a page swap even though it never was one.
 * Both are one page now, animated the same way. Read
 * `features/settings/components/settings-workspace.tsx` for the reasoning
 * behind each half; what follows is only what is different here.
 *
 * ## One bar, not two, and no routes behind it
 *
 * Nutrition, Visit history, Meal Plans and Portal Access were routes with a
 * strip of link tabs a row above this one, which meant a record answered
 * "which section am I in?" twice, in two different visual languages. Every one
 * of those routes redirects into `?tab=` now, so the record has exactly one
 * control for the question and switching a view never re-runs the server.
 *
 * The trade is worth naming: those sections are no longer *addresses*, so they
 * cannot be middle-clicked into a new tab and Back does not step between them.
 * `?tab=` buys most of it back — see `goTo`.
 *
 * ## The panels are server-rendered
 *
 * Every view arrives as a `ReactNode` already built on the server; this
 * component owns the selection and nothing else. No client record crosses the
 * boundary as data, no formatter or locale runs twice, and the client bundle
 * gains a tablist rather than a screen.
 *
 * Only the selected view is mounted. The nutrition record and the Visits view's
 * history are the two largest subtrees on the screen, and neither has any
 * business rendering while the other is being read.
 */

/**
 * ms to hold the panel faded-out before swapping what is inside it. **Mirrors
 * `--duration-reverse`** in globals.css, the speed the fade runs *out* at — the
 * CSS takes the panel down and this decides when it is safe to replace, so the
 * two must agree or the incoming view appears over the outgoing one.
 *
 * The same value Settings uses, and a constant rather than a `transitionend`
 * listener for the same reason: the panel that has to finish fading is the one
 * being replaced, so waiting on its own event means waiting on a subtree that
 * is about to stop existing.
 */
const CROSSFADE_MS = 140;

/**
 * One mark per view, so the bar still says which is which once the labels are
 * off — below `sm` these five segments carry the icon alone, exactly as the
 * Settings bar does.
 *
 * The record's bar had no icons at all while it was `PanelTabs`, which could
 * afford it: that track scrolled sideways on a phone. A pill divides its row
 * into equal segments instead, so five Arabic labels on a 360px screen would be
 * five ellipses. The icons are the price of the shared control, not decoration.
 */
const TAB_ICONS: Record<ProfileTab, IconName> = {
  nutrition: 'leaf',
  // "Measurements" — the scale, the same mark the intake's weight field wears.
  measurements: 'weightOutline',
  progress: 'progress',
  // "Visits" — the view leads with the next appointment and holds the whole
  // visit record under it.
  account: 'calendar',
  // "The Gate" — the client's portal sign-in, not the app's own security.
  security: 'portalHome',
  billing: 'mealPlans',
  // "Expenses" — what this subscriber has been billed and has paid.
  expenses: 'bills',
};

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
  /** Which view to open on, from `?tab=`. Read once, at mount. */
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
  /*
   * Two copies of the same key. `active` is where the bar is heading and moves
   * the thumb immediately; `shown` is what the panel renders and lags by one
   * fade. While they disagree the panel is faded out, so the swap happens on an
   * empty panel rather than under the reader's eye.
   *
   * Seeded from `defaultTab` and controlled from here afterwards. That matters
   * more in this screen than in Settings: the Progress view's week picker does
   * a real `router.replace`, so the server re-renders and `defaultTab` arrives
   * again — under the uncontrolled `PanelTabs` this replaced, that was a new
   * `defaultValue` on a mounted tree, the exact case Base UI warns about. State
   * seeded once cannot be reset by a prop, so the re-render lands with the
   * reader still on the view they were reading.
   */
  const [active, setActive] = useState<ProfileTab>(defaultTab);
  const [shown, setShown] = useState<ProfileTab>(defaultTab);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
   * `goTo` needs the current tab without reading it out of a `setActive`
   * updater — scheduling the swap timer in there would make the updater impure,
   * and React runs updaters twice in development to catch exactly that. The ref
   * is written from the event handler, never during a render.
   */
  const activeRef = useRef<ProfileTab>(defaultTab);

  useEffect(
    () => () => {
      if (swapTimer.current) clearTimeout(swapTimer.current);
    },
    [],
  );

  const goTo = useCallback((tab: ProfileTab) => {
    if (tab === activeRef.current) return;
    activeRef.current = tab;
    setActive(tab);

    /*
     * Point `?tab=` at the new view without navigating. `replaceState` is
     * shallow — nothing remounts, nothing typed into an open intake dialog is
     * lost — and Next reads `usePathname`/`useSearchParams` from it, so a
     * refresh reopens here and the Progress week picker carries the live tab
     * forward when it navigates for `?week=`.
     *
     * `replaceState`, not `pushState`: turning to another view of the same
     * record is not a place, and stacking every switch onto history would turn
     * Back into a walk through them rather than the way out to the roster.
     *
     * The rest of the query survives because this edits the current URL rather
     * than building a new one — `?week=` in particular, which belongs to the
     * Progress view and would otherwise reset every time it was opened.
     */
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState(null, '', url);

    const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (swapTimer.current) clearTimeout(swapTimer.current);
    swapTimer.current = setTimeout(() => setShown(tab), instant ? 0 : CROSSFADE_MS);
  }, []);

  const visible = active === shown;

  /*
   * The panel's fade — out fast, in a shade slower, so a view always arrives
   * the same way. The 4px of travel is vertical on purpose: a horizontal slide
   * would have to pick a direction, and the reading direction inverts between
   * Arabic and English. Vertical reads the same in both scripts.
   */
  const fade = cn(
    'transition-[opacity,translate] ease-(--ease-sweep) motion-reduce:transition-none motion-reduce:translate-y-0',
    visible
      ? 'translate-y-0 opacity-100 duration-(--duration-label)'
      : 'translate-y-1 opacity-0 duration-(--duration-reverse)',
  );

  return (
    /*
      `@container/record-tabs`: the bar's labels have to answer to *its* width,
      not the window's.

      The viewport is a poor proxy here — this column sits beside a 23rem
      identity panel that only exists from `lg` up, so the same 1280px window
      gives the bar ~780px on a record and the full width elsewhere. A `sm:`
      breakpoint therefore turned labels on at a width where seven of them did
      not fit.
    */
    <div className="@container/record-tabs flex min-h-0 flex-col gap-3 lg:h-full">
      {/*
        `shrink-0`, and nothing here that touches `display`: the pill's thumb is
        sized `100% / count` of the track and only lands on a segment because the
        segments are equal by construction — see the warning in `Segmented`.
      */}
      <Segmented
        role="tablist"
        shape="pill"
        label={label}
        value={active}
        onChange={goTo}
        className="shrink-0"
        options={PROFILE_TABS.map((tab) => ({
          value: tab,
          label: (
            /*
              ⚠ `w-full overflow-hidden` is what makes the `truncate` below
              actually truncate.

              The class was always here, and it did nothing: the segment button
              is `overflow: visible`, so this flex row sized itself to its
              content and the label spilled *past* its segment instead of being
              clipped inside it. At six tabs nothing was wide enough to notice.
              At seven the segments lost 16px each and three labels — Nutrition,
              Measurements and Expenses — began overrunning their neighbours,
              which is what a pill cannot do: its segments are equal by
              construction, so a label that will not fit has to ellipsis rather
              than borrow room from the tab beside it.
            */
            <span className="inline-flex w-full min-w-0 items-center justify-center gap-1.5 overflow-hidden">
              {/* A touch larger while it is carrying the tab on its own, back
                  to the row's 17px once the label is beside it. */}
              <Icon
                name={TAB_ICONS[tab]}
                className="size-5 shrink-0 @3xl/record-tabs:size-[17px]"
              />
              {/*
                ⚠ `sm:overflow-hidden sm:text-ellipsis sm:whitespace-nowrap`
                restates what `truncate` already says, and it is not redundant.

                `not-sr-only` sets `overflow: visible` and `white-space: normal`
                as part of undoing `sr-only`. Both land in the same layer as
                `truncate` and later in source order, so from `sm` up — which is
                every width that shows a label at all — they silently cancelled
                it. The label therefore wrapped inside its segment and overran
                the tabs beside it, which a pill cannot absorb: its segments are
                equal by construction. Restating the three properties under the
                same `sm:` variant puts them back after the reset.
              */}
              <span className="sr-only truncate @3xl/record-tabs:not-sr-only @3xl/record-tabs:overflow-hidden @3xl/record-tabs:text-ellipsis @3xl/record-tabs:whitespace-nowrap">
                {labels[tab]}
              </span>
              {tab === 'nutrition' && nutritionGaps > 0 ? (
                /* A bare numeral, never a pill — see "A badge is a state" in
                   docs/design-system.md. This is a quantity. It stays visible
                   below `sm` where the label beside it does not: a count of what
                   is still blank is the one thing on this bar worth keeping when
                   there is only room for a mark. */
                <span className="shrink-0 text-label font-semibold tabular-nums opacity-70">
                  {nutritionGaps}
                </span>
              ) : null}
            </span>
          ),
        }))}
      />

      {/*
        The panel. The wrapper persists so its opacity can transition; only its
        children swap, and they swap while it is invisible. `role="tabpanel"`
        names it for a screen reader as the region the tab controls.

        The view scrolls, not the page. From `lg` up this column is a bounded box
        inside the record shell, so the bar stays put and the content under it
        moves.

        **Visits is the exception, and it scrolls nothing at all.** Its subject
        is the visit record, which is built to fill a bounded box and scroll its
        own history inside a card whose header stays put. Letting the panel
        scroll as well put a second bar beside that one, half a finger apart,
        each moving a different thing — so the view fills instead and hands the
        scrolling to the one place that owns it.

        ⚠ **The inline padding is what stops the cards looking sliced.** Setting
        `overflow` to anything but `visible` — `hidden` included — makes this box
        clip on all four edges, and a `Card` draws its ring and green-tinted
        shadow *outside* its border box. Flush against the clip, the ring
        vanished on whichever edge a card touched. The negative margin gives that
        padding back to the column so the panel still spans it.
      */}
      <div
        role="tabpanel"
        aria-label={labels[shown]}
        className={cn(
          'min-h-0 flex-1 outline-none',
          'lg:-mx-1 lg:px-1 lg:pt-1',
          /*
            Expenses joins the account view in filling rather than scrolling.
            Its list is paged, and the page is now sized to the card it is drawn
            in — see `ExpensesBillList` — so the card has a bounded height and
            can stand the same height as the identity panel beside it. A panel
            that scrolled as a matter of course would make the two columns end in
            different places and put a second scrollbar next to the record's own.

            `overflow-y: auto` rather than `hidden`, and the difference is the
            bug this pair of branches used to have. Sized to the frame, the card
            fits and no bar appears — `auto` paints nothing when there is nothing
            to scroll. But a window shorter than `EXPENSES_ROWS.min` bills is
            still possible, and under `hidden` what fell outside the card was the
            pager: the one control that moves through the ledger, clipped away
            with no way to reach it. `auto` is the floor under the measurement
            rather than a second scrollbar in the ordinary case.

            It keeps `pb-1` and not the scrolling branch's `pb-6`: that padding
            is breathing room under a list a reader scrolls to the end of, and
            here it would only take height away from a card that is trying to
            fit.
          */
          shown === 'account'
            ? 'lg:overflow-hidden lg:pb-1'
            : shown === 'expenses'
              ? 'lg:overflow-y-auto lg:overscroll-contain lg:pb-1'
              : 'lg:overflow-y-auto lg:overscroll-contain lg:pb-6',
          fade,
        )}
      >
        {panels[shown]}
      </div>
    </div>
  );
}
