'use client';

import { useEffect, useRef } from 'react';

/**
 * A smooth open/close for the meal card's `<details>`, on every browser.
 *
 * This used to skip itself in browsers supporting `interpolate-size`
 * (`.q-disclosure`/`::details-content` in `globals.css`), leaving Chrome to
 * animate the reveal natively. That CSS path interpolates `block-size: auto`
 * by *approximation* rather than by measuring a real pixel height, which for
 * this card's variable, wrapping content did not read as a smooth, gradual
 * open — it visibly eased unevenly rather than growing at a constant,
 * legible rate. Measuring the two real heights and driving a WAAPI
 * animation between them, as this does, is what makes the open read the same
 * gradual way the close already did — on every engine, not only the ones
 * lacking the CSS feature. `client-progress-panel.tsx`'s own `<details>`
 * still uses the CSS-only path unmodified; only this card's markup dropped
 * the `q-disclosure` class, so the two do not fight over the same element.
 *
 * Rather than turning `PortalMealCard` itself into a client component to own
 * the open state — the whole point of building it on `<details>` was keeping
 * the week's dishes off the wire, see that file's own doc comment — this
 * mounts as one inert child inside the content panel and finds its own
 * `<details>`/`<summary>` through the DOM, exactly the scope a progressive
 * enhancement needs and no more.
 */
export function AnimatedDisclosure() {
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const marker = markerRef.current;
    const content = marker?.parentElement;
    const details = content?.closest('details');
    const summary = details?.querySelector<HTMLElement>(':scope > summary');
    if (!marker || !content || !details || !summary) return;

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
      // `overflow: hidden` has to land *before* `open = true`, not only once
      // `run()` starts it a frame later — otherwise the details box spends
      // that one frame at its pinned closed height with overflow still at
      // its default `visible`, so the full panel is already on screen,
      // unclipped, before the height animation gets anything left to reveal.
      // That is what an "open" with no visible animation looks like: the
      // content already showed itself the instant `open` flipped.
      details!.style.overflow = 'hidden';
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
      /*
       * `event.preventDefault()` below always fires, unconditionally, to
       * cancel the browser's own native `<details>` toggle for every click
       * that reaches `summary` — that part is unaffected by where the click
       * came from. What must NOT always fire is our own `expand()`/`shrink()`:
       * the tick (`meal-check.tsx`) sits inside `summary` as a real
       * `role="checkbox"` descendant — `<details>`'s `::details-content` box
       * hides everything except the first `summary` while closed, so lifting
       * the tick out to dodge this would make it disappear whenever the card
       * is shut. It has to stay a descendant, which means its clicks bubble
       * here, and this listener is what tells the two apart.
       *
       * The tick's own `onClick` (in `meal-check.tsx`) already calls
       * `stopPropagation()`, but that cannot be relied on to arrive before
       * this listener runs. This `addEventListener` sits directly on the
       * real `summary` DOM node, so it fires during the browser's own native
       * bubble phase, at the moment the click physically passes through
       * `summary` — whereas React 17+ delegates its own `onClick` handlers
       * to a single listener at the app's root container, which only runs
       * once that same native bubble reaches the root, further up the tree
       * and later in time. By then this listener has already run and
       * already committed to opening or closing the card; a
       * `stopPropagation()` that arrives afterwards cannot undo that. So
       * this checks `event.target`'s ancestry directly, in the one listener
       * that is guaranteed to see the click first, rather than depending on
       * a later handler to have stopped it in time.
       */
      event.preventDefault();

      const target = event.target;
      if (target instanceof Element && target.closest('[role="checkbox"]')) return;

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
