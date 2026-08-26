'use client';

import { useEffect } from 'react';

/**
 * Holds the page at scale 1 on phones and tablets, for as long as the staff app
 * or the client portal is mounted.
 *
 * ## Why this is not just a meta tag
 *
 * `maximumScale: 1` / `userScalable: false` in the two `generateViewport()`
 * exports is the first half, and on Android it is the whole of it. **iOS Safari
 * has ignored `user-scalable=no` since iOS 10** — deliberately, so that a page
 * cannot lock a reader out of magnifying it — so on an iPhone or an iPad the
 * meta tag alone changes nothing about pinch. WebKit's own gesture events are
 * the only seam: `gesturestart` / `gesturechange` / `gestureend` fire for a
 * two-finger pinch, and a `preventDefault()` on them is what actually holds the
 * scale. `touchmove` with more than one finger down is the braces to that belt,
 * for the WebKit versions that begin scaling before the gesture is recognised.
 *
 * Double-tap-to-zoom is the third way in and is handled in CSS instead — see
 * `html.q-zoom-locked` in `globals.css`, which narrows `touch-action` for the
 * whole document to panning alone. Doing it there rather than with a `touchend`
 * timer matters: a timer that calls `preventDefault()` on the second tap also
 * swallows the second *click*, so a quantity stepper tapped twice quickly would
 * count once.
 *
 * ## ⚠ Every listener is on the capture phase, and that is load-bearing
 *
 * These were bubble-phase listeners at first, and the result was a lock that
 * held over most of the product and quietly failed over the rest: a pinch that
 * started on the calendar, a meal card or anything else whose own handlers stop
 * touch events from propagating never reached `document` at all. Zooming *out*
 * uses the same gesture, so it was blocked everywhere the lock did work — which
 * is how a stray pinch left someone magnified with no way back. Capture runs
 * from the document down, before any of those handlers, so nothing in the tree
 * can hold an event back from it.
 *
 * ## The scale watchdog is the floor under all of it
 *
 * Blocking gestures is necessarily a list of the ways a page can be zoomed, and
 * a list can be incomplete: a pinch landing before this component hydrates,
 * accessibility zoom, an orientation change, a WebKit release that scales on an
 * event nobody here names. `visualViewport` reports the scale whatever caused
 * it, so if the page ever finds itself magnified the watchdog puts it back —
 * see `snapBackToScaleOne`.
 *
 * It waits ~150ms rather than firing on the first report, so it acts once the
 * fingers are off the glass instead of fighting them mid-gesture, and it stands
 * down entirely while a field is focused: iOS magnifies to meet a focused input
 * and un-magnifies on blur, and snapping that back would leave someone typing
 * into a box they cannot read.
 *
 * ## Why it is gated on the pointer, and why nothing here touches desktop
 *
 * Desktop Safari fires the same `gesture*` events for a trackpad pinch, and
 * there that gesture is the browser's own zoom — a reader's, not a stray tap.
 * `(pointer: coarse)` is the line: true on iOS, iPadOS and Android, false on a
 * mouse-driven machine including a Windows laptop that happens to have a touch
 * screen. Nothing here listens for `ctrl`+wheel or the zoom shortcuts, so every
 * desktop route into zoom is left exactly as it was.
 *
 * The query is watched rather than read once, because the answer can change
 * under a running document — an iPad that gains a pointing device, a browser
 * whose emulation is toggled in DevTools.
 *
 * ## Scope
 *
 * Mounted from `app/layout.tsx` and `portal/layout.tsx`, so it covers every
 * page of the dashboard and of the portal and nothing else: the marketing page,
 * the sign-in screens and onboarding keep normal browser zoom. The cleanup is
 * what makes that true — the listeners and the class come off on the way out,
 * the same way `DesktopScrollbars` releases `<html>` when a staff user follows
 * a link into the portal.
 *
 * ⚠ **This is invisible in DevTools device emulation.** Blink has no `gesture*`
 * events at all, so an iPhone preset in the device toolbar can neither
 * demonstrate the bug nor the fix; only a real iOS device can.
 */
export function ZoomLock() {
  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const root = document.documentElement;

    const blockGesture = (event: Event) => event.preventDefault();
    const blockPinch = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };

    /*
      Capture, and `passive: false`.

      Capture is argued above. `passive: false` is not optional either: touch
      and gesture listeners default to passive on the document, and a passive
      listener's `preventDefault()` is ignored with a console warning — the lock
      would silently do nothing at all.

      The same object goes to `removeEventListener`, which matches on the
      capture flag: removing with the default `false` would leave every one of
      these attached for the life of the document.
    */
    const options = { capture: true, passive: false } as const;

    /**
     * Whether something with a keyboard has focus, in which case the scale is
     * iOS's business and not ours. `isContentEditable` covers the rich-text
     * cases that are not one of the three tags.
     */
    const isEditing = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      return (
        active.isContentEditable ||
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT'
      );
    };

    /**
     * Puts a magnified page back to scale 1.
     *
     * There is no API for this — `visualViewport.scale` is read-only and CSS
     * cannot reach the page scale — so the lever is the viewport meta tag: iOS
     * re-applies `initial-scale` whenever that descriptor *changes*, and
     * re-applying it at 1 is what collapses the zoom. Writing the identical
     * string back is a no-op, hence the nudge to `1.0` and the restore on the
     * next frame: two different strings, the same numbers, one re-evaluation.
     *
     * ⚠ **The rest of the descriptor is preserved verbatim.** `viewport-fit` and
     * `interactive-widget` are in there — the safe-area insets along every
     * block-end surface and the keyboard-aware dialog heights both depend on
     * them (see the `viewport` export in `[locale]/layout.tsx`). Rewriting the
     * tag from a literal here would drop both, so only the one token is touched.
     */
    const snapBackToScaleOne = () => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      if (!meta) return;

      const content = meta.getAttribute('content');
      if (!content) return;

      // Swapped rather than set, so the new string always differs from the one
      // already on the tag, whichever of the two it happens to be holding.
      const current = /initial-scale=([\d.]+)/.exec(content)?.[1];
      const nudged =
        current === undefined
          ? `${content}, initial-scale=1.0`
          : content.replace(
              /initial-scale=[\d.]+/,
              current === '1.0' ? 'initial-scale=1' : 'initial-scale=1.0',
            );

      meta.setAttribute('content', nudged);
      requestAnimationFrame(() => meta.setAttribute('content', content));
    };

    let pending: number | undefined;

    /*
      A scale of exactly 1 is the resting state and 1.01 is the slack: iOS
      reports fractional scales either side of 1 during a keyboard transition
      and while rubber-banding, and neither is somebody zooming in.
    */
    const watchScale = () => {
      const viewport = window.visualViewport;
      if (!viewport || viewport.scale <= 1.01 || isEditing()) return;

      window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        if ((window.visualViewport?.scale ?? 1) > 1.01 && !isEditing()) snapBackToScaleOne();
      }, 150);
    };

    let engaged = false;

    const engage = () => {
      if (engaged) return;
      engaged = true;
      root.classList.add('q-zoom-locked');
      document.addEventListener('gesturestart', blockGesture, options);
      document.addEventListener('gesturechange', blockGesture, options);
      document.addEventListener('gestureend', blockGesture, options);
      document.addEventListener('touchmove', blockPinch, options);
      window.visualViewport?.addEventListener('resize', watchScale);
      // A page that arrived here already magnified — pinched before this
      // hydrated, or carried in from the last screen — is put right on mount
      // rather than waiting for the next scale change to report one.
      watchScale();
    };

    const release = () => {
      if (!engaged) return;
      engaged = false;
      window.clearTimeout(pending);
      root.classList.remove('q-zoom-locked');
      document.removeEventListener('gesturestart', blockGesture, options);
      document.removeEventListener('gesturechange', blockGesture, options);
      document.removeEventListener('gestureend', blockGesture, options);
      document.removeEventListener('touchmove', blockPinch, options);
      window.visualViewport?.removeEventListener('resize', watchScale);
    };

    const sync = () => (query.matches ? engage() : release());

    sync();
    query.addEventListener('change', sync);

    return () => {
      query.removeEventListener('change', sync);
      release();
    };
  }, []);

  return null;
}
