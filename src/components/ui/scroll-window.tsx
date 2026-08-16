'use client';

import { type ReactNode, useLayoutEffect, useRef } from 'react';

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
 */
export function ScrollWindow({
  visible,
  className,
  children,
}: {
  /** How many rows fit before the box starts scrolling. */
  visible: number;
  className?: string;
  children: ReactNode;
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

      container.style.maxHeight = `${last.getBoundingClientRect().bottom - top + padding}px`;
    }

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const row of container.querySelectorAll('[data-window-row]')) observer.observe(row);

    return () => observer.disconnect();
  }, [visible, children]);

  return (
    <div ref={box} className={cn('overflow-y-auto overscroll-contain', className)}>
      {children}
    </div>
  );
}
