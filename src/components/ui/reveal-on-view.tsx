'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Plays a child's entrance animation the first time it scrolls into view,
 * instead of when the page loads.
 *
 * **It renders no styles of its own.** All it does is publish a `data-reveal`
 * attribute that CSS keys off — `armed` for "held at its start state", `seen`
 * for "go". The animation lives in the stylesheet beside everything else that
 * moves, so this component never has to know what it is revealing.
 *
 * **Its children stay server components.** They arrive as `children` and are
 * never touched, so a chart wrapped in this keeps rendering on the server with
 * no data crossing into the browser bundle — the same arrangement
 * `PlanDayCompletionProvider` uses to stay out of the meal list's way. This is
 * the narrowest client boundary the requirement allows: §Charts says no chart
 * is a client component, and none of them becomes one — a wrapper around it
 * does, carrying nothing but an observer.
 *
 * ## Why not `animation-timeline: view()`
 *
 * CSS can do this natively now and it would need no JavaScript at all. It is
 * also unsupported in Safari, which on a client portal means unsupported on
 * every iPhone — the animation would simply never run there. Revisit when that
 * changes; the CSS side of this is already shaped to drop straight in.
 */

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * Arming has to happen *before* the browser paints. React hydrates after the
 * server's HTML is already on screen, so a plain effect would let one frame of
 * finished bars through before collapsing them to animate — a flash of the
 * ending, then the beginning. `useLayoutEffect` runs in the same commit as the
 * paint and closes it. It cannot run during SSR, hence the swap.
 */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

type RevealState = 'idle' | 'armed' | 'seen';

export function RevealOnView({
  children,
  className,
  /** How much of the element must be showing before it counts as seen. */
  threshold = 0.25,
}: {
  children: ReactNode;
  className?: string;
  threshold?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  /*
    Starts `idle`, which publishes no attribute — so the server's HTML, and a
    browser where none of this ever runs, both show the finished thing. That
    ordering is deliberate: the failure mode of "JavaScript did not arrive" has
    to be a visible chart, not an empty one. A stylesheet that hid the bars by
    default would trade a flash for silently losing the data.
  */
  const [state, setState] = useState<RevealState>('idle');

  useBeforePaint(() => {
    const element = ref.current;
    if (!element) return;

    // Old browsers, and any environment without the API: show the end state.
    if (typeof IntersectionObserver === 'undefined') {
      setState('seen');
      return;
    }

    setState('armed');

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;

        // Once only. This is an entrance, not a scroll-linked effect — replaying
        // it every time the card passes the fold would turn a page someone is
        // scrolling through into a page that keeps redrawing itself.
        setState('seen');
        observer.disconnect();
      },
      { threshold },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div ref={ref} className={className} data-reveal={state === 'idle' ? undefined : state}>
      {children}
    </div>
  );
}
