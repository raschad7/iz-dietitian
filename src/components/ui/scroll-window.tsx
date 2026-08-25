'use client';

import { type ComponentProps, useLayoutEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * A scrolling box bounded to the first N rows inside it.
 *
 * **Why this measures rather than declares a height.** CSS cannot size a box to
 * its first five descendants, and the five differ: a request with no message,
 * one with a two-line message, and an Arabic one that wraps further all measure
 * differently. A hand-tuned `rem` is "five deep" at one width, in one language,
 * for one combination of rows — and quietly wrong everywhere else, showing four
 * and a half or five and a bit. So the window is the block-end edge of the Nth
 * row, read from the layout that actually rendered.
 *
 * **Rows are marked, not counted by position.** Anything with `data-window-row`
 * is a row, at any depth: the requests inbox nests its rows two lists and two
 * cards deep, and the answered history below them must not count against the
 * window. `RequestsWindow` measures direct children of one `<ul>` and stays as
 * it is — this is the same idea for content the component does not own.
 *
 * Rectangles rather than `offsetTop`, because a row's offset parent is whatever
 * card it happens to sit in rather than this box. The delta between two rects is
 * the same number either way and does not care what is positioned in between.
 *
 * `useLayoutEffect` so the height lands before paint — applied a frame late it
 * is a visible jump every time the surface opens. A `ResizeObserver` keeps it
 * honest afterwards: rows reflow when a font loads or the locale flips, and
 * answering one takes it out of the list.
 *
 * With N rows or fewer it sets no height at all, so whatever bounds the surface
 * — a dialog's `max-h`, a card's grid track — is the only ceiling, and there is
 * nothing to scroll to.
 *
 * ## Why it owns its flex sizing instead of leaving it to the call site
 *
 * Both call sites are the scrolling middle of a `<dialog>`, and both used to
 * write `min-h-0 flex-1` themselves. `flex-1` is `flex: 1 1 0%`, and a zero
 * basis beside an explicit `min-block-size: 0` tells the flex algorithm this box
 * contributes *nothing* to its parent's height. That is harmless while the
 * parent's height is definite — and a modal `<dialog>` is `height: fit-content`
 * from the UA stylesheet, which is the opposite. Blink resolves that fit from
 * the item's content anyway; **WebKit takes the declaration at its word**, so on
 * iPad Safari the notifications and requests dialogs opened as their header bar
 * and nothing else: full width, one line tall, the list and its rows sized to
 * zero.
 *
 * `grow shrink basis-auto` is `flex: 1 1 auto` — the same growth, but with a
 * content-derived basis, so the box contributes its rows to the dialog's height
 * in both engines. It is spelled as three utilities rather than one shorthand so
 * a call site's `basis-*` cannot end up racing the `flex` shorthand in the
 * cascade; `min-h-0` stays because the scroll still needs a floor of zero once
 * the height *is* resolved.
 */
export function ScrollWindow({
  visible,
  className,
  children,
  ...props
}: ComponentProps<'div'> & {
  /** How many rows fit before the box starts scrolling. */
  visible: number;
}) {
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = box.current;
    if (!container) return;

    function measure() {
      if (!container) return;

      const rows = container.querySelectorAll<HTMLElement>('[data-window-row]');

      if (rows.length <= visible) {
        container.style.maxHeight = '';
        return;
      }

      const last = rows[visible - 1];
      if (!last) return;

      /*
       * Nothing to read from a box that has not been laid out yet.
       *
       * This runs in a layout effect, and layout effects run child-first — so
       * inside a dialog it fires *before* the parent's own effect calls
       * `showModal()`, while the `<dialog>` is still `display: none` and every
       * rectangle in it is zero. Left to compute, the window came out as the
       * box's bottom padding — a 16px scrollport holding five rows — and stayed
       * that way until the `ResizeObserver` below happened to correct it.
       *
       * Bailing hands the surface back to whatever else bounds it (the dialog
       * frame's own ceiling) until there is a real layout to measure, which the
       * frame scheduled below then delivers. A window that is briefly too tall
       * is a list; a window that is briefly 16px tall is a bug.
       */
      const rect = last.getBoundingClientRect();
      if (rect.height === 0 && rect.width === 0) return;

      /*
       * Measured from the box's own top and against its unscrolled position:
       * `scrollTop` is 0 on a surface that has just opened, but a re-measure
       * after the reader has scrolled is not, and the rect would then be short
       * by however far they had moved.
       */
      const top = container.getBoundingClientRect().top - container.scrollTop;

      // Plus the box's own block-end padding, so the window ends *after* the
      // Nth row rather than flush against it — a row cut at its own edge reads
      // as a rendering fault instead of as "there is more below".
      const padding = parseFloat(getComputedStyle(container).paddingBottom) || 0;

      container.style.maxHeight = `${rect.bottom - top + padding}px`;
    }

    measure();

    /*
     * And once more on the next frame, for the pass that had nothing to read.
     *
     * The observer below would eventually deliver the same number, and relying
     * on it to is what left the window unset for as long as it took: a
     * `ResizeObserver` only speaks when a box *changes* size, so a surface that
     * opens at its final size — or one whose frames are not being produced at
     * all — never gets a second look. This is the deterministic one. It is a
     * frame late by construction, which is why it is a fallback and not the
     * primary reading: everything already laid out is measured above, before
     * paint, and settles with no movement at all.
     */
    const frame = window.requestAnimationFrame(measure);

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const row of container.querySelectorAll('[data-window-row]')) observer.observe(row);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [visible, children]);

  return (
    <div
      ref={box}
      className={cn(
        'min-h-0 grow shrink basis-auto overflow-y-auto overscroll-contain',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
