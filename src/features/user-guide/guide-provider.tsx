'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { CALENDAR_PHONE_QUERY } from '@/features/booking/components/calendar-view-guard';
import { usePathname, useRouter } from '@/i18n/navigation';

import { GuideContext, type GuideValue } from './guide-context';
import { GuideOverlay } from './guide-overlay';
import { GUIDE_STEPS, GUIDE_STEP_COUNT, stepHrefForScreen, stepScreenMatches } from './steps';

/**
 * Owns the tour: which step is showing, which screen that step needs, and the
 * overlay that draws it.
 *
 * ## Why the state lives in the layout
 *
 * The tour crosses five routes, so it cannot be held by any of them. It is held
 * here, in the staff layout — the one component that stays mounted while the
 * reader moves between `/app`, `/app/clients` and the rest — which is also what
 * lets the overlay keep its place through a navigation instead of unmounting and
 * restarting on every step that changes screen.
 *
 * ## Navigation is a consequence of the step, not a thing steps do
 *
 * A step names the screen it belongs to and nothing else. The effect below
 * compares that to where the reader actually is and closes the gap. So the
 * ordering of `GUIDE_STEPS` is the only thing that decides the route the tour
 * takes, several consecutive steps on one screen cost no navigation at all, and
 * a reader who starts the tour from the dish catalog is walked back to the
 * dashboard by the same mechanism that moves them forward later.
 */
export function GuideProvider({
  children,
  routed = true,
}: {
  children: React.ReactNode;
  /**
   * Whether a step is allowed to move the reader to the screen it belongs to.
   *
   * Always `true` in the app; the one caller that turns it off is
   * `/dev/shell`, which lives outside `/app` and would otherwise bounce
   * straight into the authenticated area — and then to the sign-in page — the
   * moment the tour was started. With it off the overlay can be walked end to
   * end against the harness's own rail, which is what makes the tour's *drawing*
   * reviewable without a session.
   *
   * It changes nothing else: the steps, the anchors, the card and the spotlight
   * are the same in both modes.
   */
  routed?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);

  const step = active ? (GUIDE_STEPS[index] ?? null) : null;

  const start = useCallback(() => {
    setIndex(0);
    setActive(true);
  }, []);

  const stop = useCallback(() => {
    setActive(false);
  }, []);

  const next = useCallback(() => {
    setIndex((current) => {
      /*
        The last step's forward control closes the tour rather than being
        disabled — see `GuideCard`, which labels it "Finish" there. Clamping
        here as well means a stray key repeat at the end cannot walk the index
        past the array and blank the card.
      */
      if (current >= GUIDE_STEP_COUNT - 1) return current;
      return current + 1;
    });
  }, []);

  const previous = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  /*
    The reader is put on the screen the step belongs to.

    `push`, not `replace`: each section of the tour becomes a history entry, so
    the browser's own Back button walks back through the screens rather than
    leaping out of the app entirely. It does end the tour — see the `popstate`
    handler below — which is the honest reading of someone reaching past the
    guide for their browser's controls.
  */
  useEffect(() => {
    if (!routed) return;
    if (step === null) return;

    /*
      The step's screen, corrected for this device before anything is pushed.

      A phone cannot draw the week view, so steps 9 and 10 are walked to
      `/app/calendar/day` instead of asking for a week that `CalendarViewGuard`
      would mount, paint and immediately replace. Read here, in the effect,
      rather than subscribed to: the guard never moves a reader *up* to a wider
      view when a window grows, and a tour that did would put back exactly the
      screen-swap this removes. See `stepHrefForScreen`.
    */
    const href = stepHrefForScreen(step.href, window.matchMedia(CALENDAR_PHONE_QUERY).matches);

    /*
      `stepScreenMatches` rather than `pathname === href`, and the difference is
      still load-bearing even though the href above is now the corrected one: a
      screen is allowed to redirect within itself, and the tour has to accept
      where it landed instead of insisting on the path it asked for. Equality
      here is what made the calendar steps push against `CalendarViewGuard`
      forever — the note in `steps.ts` records the loop in full.
    */
    if (stepScreenMatches(href, pathname)) return;
    router.push(href);
  }, [routed, step, pathname, router]);

  /*
    The *next* step's screen, fetched while the reader is still reading this one.

    Four steps in the tour cross a route, and each of them pays for a cold server
    component: the tour navigates programmatically, so — unlike every other
    navigation in the app — there is no `<Link>` in the viewport to have warmed
    the destination first. The reader waits that fetch out with the screen
    already dimmed and the card already advanced, which is the half of the
    remaining lag that centring the anchor instantly does not touch.

    One step of lookahead is the whole trick, and it is nearly free: the tour is
    a straight line, so the screen fetched here is the screen asked for next
    almost every time. The guard below skips the fetch whenever the next step
    stays on the screen already showing, which is most of them.
  */
  useEffect(() => {
    if (!routed) return;
    if (!active) return;

    const upcoming = GUIDE_STEPS[index + 1];
    if (upcoming === undefined) return;

    /* Corrected for this device first, exactly as the push above is — otherwise
       a phone would warm the week view it is never going to be sent to. */
    const href = stepHrefForScreen(upcoming.href, window.matchMedia(CALENDAR_PHONE_QUERY).matches);
    if (stepScreenMatches(href, pathname)) return;

    router.prefetch(href);
  }, [routed, active, index, pathname, router]);

  /*
    Browser Back, or a gesture that produces one, ends the tour.

    Without this the effect above would immediately push the reader back to the
    step's screen, and Back would appear broken for as long as the guide was
    open. A guide that captures the browser's own controls is a guide people
    close by reloading the page.
  */
  useEffect(() => {
    if (!active) return;

    function onPopState() {
      setActive(false);
    }

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [active]);

  const value = useMemo<GuideValue>(
    () => ({ active, index, step, total: GUIDE_STEP_COUNT, start, stop, next, previous }),
    [active, index, step, start, stop, next, previous],
  );

  return (
    <GuideContext.Provider value={value}>
      {children}
      <GuideOverlay />
    </GuideContext.Provider>
  );
}
