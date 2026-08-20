'use client';

import * as React from 'react';

/**
 * How far a reported gap has to open before it is believed to be a keyboard.
 *
 * The layout viewport and the visual viewport disagree by a pixel or two during
 * a chrome transition and by a rounded fraction at some device scale factors,
 * and neither is a keyboard. Every software keyboard on a phone is at least
 * ~200px; the smallest thing that should ever move a surface is an iPad's
 * hardware-keyboard accessory bar at ~55px. 40px sits below that and well above
 * the noise.
 */
const KEYBOARD_MIN_INSET_PX = 40;

/**
 * Above this the visual viewport is small because the reader pinched, not
 * because a keyboard opened, and its height says nothing about either.
 */
const MAX_TRUSTED_SCALE = 1.01;

/** Elements whose focus means text entry, and so a keyboard on a touch device. */
function isTextEntry(node: Element | null): boolean {
  if (!node) return false;
  if (node instanceof HTMLElement && node.isContentEditable) return true;

  const tag = node.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;

  /*
   * A checkbox, a radio or a button-shaped input takes focus without opening
   * anything. Only the typing kinds count — and `type` is read off the DOM
   * property rather than the attribute so an unspecified one reads as `text`.
   */
  const type = (node as HTMLInputElement).type;
  return type !== 'checkbox' && type !== 'radio' && type !== 'button' && type !== 'submit' && type !== 'reset';
}

/**
 * Publishes `--q-keyboard-inset` — how much of the layout viewport the software
 * keyboard is covering — onto `<html>`, for the stylesheet to subtract.
 *
 * Renders nothing and belongs in the root locale layout, once. Everything that
 * consumes it does so through `--q-viewport-block` in `globals.css`; nothing
 * should read `window.visualViewport` a second time.
 *
 * ## Why this exists when `interactiveWidget: 'resizes-content'` is declared
 *
 * That viewport hint (see `[locale]/layout.tsx`) is the right fix and it is
 * honoured by Chrome on Android: the keyboard shrinks the layout viewport, so
 * `dvh` shrinks with it and CSS needs no help. **iOS Safari ignores it.** There
 * the layout viewport keeps its full height and the keyboard is drawn over the
 * bottom of it, so `100dvh` describes a screen that is a third obscured and
 * every `position: fixed` surface pinned to the block-end edge — which is every
 * bottom sheet in this app — sits underneath the keys. No CSS unit reports
 * that. `window.visualViewport` is the only thing that does.
 *
 * The measurement is written so both paths give the right answer from one
 * expression: on Android the layout viewport has already shrunk to match the
 * visual one, so the gap is zero and this publishes nothing; on iOS the gap is
 * the keyboard and this publishes all of it.
 *
 * ## What it deliberately does not do
 *
 * It does not scroll anything, focus anything, or measure any element. A
 * focused field is brought into view by the browser, inside the scrollport the
 * dialog frame already established — the only thing missing was a frame that
 * knew how tall it was allowed to be. Nothing here runs on a desktop: without
 * a keyboard the gap never opens and the property is never set.
 */
export function KeyboardInset() {
  React.useEffect(() => {
    const viewport = window.visualViewport;
    // Every desktop browser has this; the guard is for the ones that do not.
    if (!viewport) return;

    const root = document.documentElement;
    let frame = 0;
    let published = 0;

    function apply() {
      frame = 0;
      const vv = window.visualViewport;
      if (!vv) return;

      /*
       * `window.innerHeight` is the layout viewport — the box a `fixed` element
       * is positioned against, and the one iOS refuses to shrink. `offsetTop`
       * is included because iOS also *offsets* the visual viewport upward when
       * it scrolls a focused field clear of the keyboard, and without it that
       * offset would be double-counted as extra keyboard.
       */
      const gap = window.innerHeight - (vv.height + vv.offsetTop);

      const trusted =
        vv.scale <= MAX_TRUSTED_SCALE &&
        gap >= KEYBOARD_MIN_INSET_PX &&
        isTextEntry(document.activeElement);

      const inset = trusted ? Math.round(gap) : 0;
      if (inset === published) return;
      published = inset;

      if (inset === 0) {
        // Removed rather than set to `0px`, so the token's own declaration in
        // `globals.css` is what answers again and there is one source of truth.
        root.style.removeProperty('--q-keyboard-inset');
      } else {
        root.style.setProperty('--q-keyboard-inset', `${inset}px`);
      }
    }

    function schedule() {
      if (frame) return;
      frame = window.requestAnimationFrame(apply);
    }

    /*
     * `resize` is the keyboard arriving and leaving. `scroll` is iOS moving the
     * visual viewport to keep a focused field above it, which changes
     * `offsetTop` without changing `height`. `focusout`/`focusin` cover the
     * case where focus moves between two fields, or leaves for a button, faster
     * than the viewport settles — the gap can still be open there while nothing
     * is being typed into.
     */
    viewport.addEventListener('resize', schedule, { passive: true });
    viewport.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('focusin', schedule, { passive: true });
    window.addEventListener('focusout', schedule, { passive: true });
    window.addEventListener('orientationchange', schedule, { passive: true });

    schedule();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
      window.removeEventListener('focusin', schedule);
      window.removeEventListener('focusout', schedule);
      window.removeEventListener('orientationchange', schedule);
      root.style.removeProperty('--q-keyboard-inset');
    };
  }, []);

  return null;
}
