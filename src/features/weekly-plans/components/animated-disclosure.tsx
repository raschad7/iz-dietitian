'use client';

import { useEffect, useRef } from 'react';

/**
 * A smooth open/close for the meal card's `<details>`, in browsers the
 * CSS-only trick in `globals.css` (`.q-disclosure`, `::details-content` +
 * `interpolate-size`) does not reach — that pair is Chrome-only for now, and
 * everywhere else a `<details>` still snaps open and shut with no transition
 * at all. This replaces the snap with the same curve/unit the rest of the
 * app's motion uses (`--ease-sweep`/`--duration-arc` in `globals.css`,
 * written literally here the way `plan-day-strip.tsx` already does inline).
 *
 * Rather than turning `PortalMealCard` itself into a client component to own
 * the open state — the whole point of building it on `<details>` was keeping
 * the week's dishes off the wire, see that file's own doc comment — this
 * mounts as one inert child inside the content panel and finds its own
 * `<details>`/`<summary>` through the DOM, exactly the scope a progressive
 * enhancement needs and no more.
 *
 * Skips itself entirely when the browser already animates through CSS, so
 * the two techniques never fight over the same open/close.
 */
export function AnimatedDisclosure() {
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const marker = markerRef.current;
    const content = marker?.parentElement;
    const details = content?.closest('details');
    const summary = details?.querySelector<HTMLElement>(':scope > summary');
    if (!marker || !content || !details || !summary) return;

    if (typeof CSS !== 'undefined' && CSS.supports?.('interpolate-size', 'allow-keywords')) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const durationMs = reduceMotion ? 1 : 220;
    const easeSweep = 'cubic-bezier(.2, .6, .2, 1)';

    let animation: Animation | null = null;
    let closing = false;
    let expanding = false;

    function finish(open: boolean) {
      details!.open = open;
      animation = null;
      closing = false;
      expanding = false;
      details!.style.height = '';
      details!.style.overflow = '';
    }

    function run(startHeight: string, endHeight: string, open: boolean) {
      details!.style.overflow = 'hidden';
      animation?.cancel();
      animation = details!.animate({ height: [startHeight, endHeight] }, { duration: durationMs, easing: easeSweep });
      animation.onfinish = () => finish(open);
      animation.oncancel = () => {
        closing = false;
        expanding = false;
      };
    }

    function shrink() {
      closing = true;
      const startHeight = `${details!.offsetHeight}px`;
      const endHeight = `${summary!.offsetHeight}px`;
      run(startHeight, endHeight, false);
    }

    function expand() {
      expanding = true;
      // Locks the details box at its closed height before the content
      // becomes visible, so the frame right after `open = true` still paints
      // the old, closed size instead of jumping straight to the new one —
      // the animation below is what covers the distance between them.
      details!.style.height = `${details!.offsetHeight}px`;
      details!.open = true;

      window.requestAnimationFrame(() => {
        const startHeight = `${details!.offsetHeight}px`;
        const endHeight = `${summary!.offsetHeight + content!.offsetHeight}px`;
        run(startHeight, endHeight, true);
      });
    }

    function onClick(event: MouseEvent) {
      // Only the row itself opens/closes the card — a click on the tick
      // inside it already stops its own propagation before it gets here
      // (see `meal-check.tsx`), so this never has to tell the two apart.
      event.preventDefault();
      if (closing || !details!.open) {
        expand();
      } else if (expanding || details!.open) {
        shrink();
      }
    }

    summary.addEventListener('click', onClick);
    return () => {
      summary.removeEventListener('click', onClick);
      animation?.cancel();
    };
  }, []);

  return <span ref={markerRef} aria-hidden="true" className="hidden" />;
}
