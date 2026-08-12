/**
 * Which page numbers a pager draws, and where it draws a gap.
 *
 * Pure, and in its own module, because the interesting part of a numbered pager
 * is not the markup — it is the arithmetic at the two ends, which is where every
 * hand-rolled one goes wrong. See `pagination.test.ts`.
 */

/** A page to link to, or the `…` standing in for a run of pages that are not drawn. */
export type PageToken = number | 'gap';

/**
 * How many pages are drawn between the first and the last. Three, so the
 * current page always has a neighbour on each side to step to.
 */
const WINDOW = 3;

/**
 * The most tokens the pager can produce: first, gap, three, gap, last.
 * Below this, every page fits and nothing is elided.
 */
const MAX_TOKENS = WINDOW + 4;

/**
 * The pages to draw for `page` of `pageCount`.
 *
 * **The window slides rather than shrinks.** The naive version centres three
 * pages on the current one and clamps each end, which quietly drops the window
 * to two entries on page 1 and to two again on the last page — so the number of
 * pages you can reach in one click depends on where you already are. Clamping
 * the window's *start* instead keeps all three everywhere, and the count of
 * page links stays at five: the first, three around you, and the last.
 *
 * The row can still differ by one slot between the middle and the two ends,
 * because an end draws one gap where the middle draws two. That is the gap
 * telling the truth about what it stands for, and a `…` is narrower than a
 * page button — squaring it away would mean drawing a gap over nothing.
 *
 * A gap is only drawn where pages are actually being skipped: with the window
 * sitting against the first page there is nothing between them to elide, and an
 * `…` there would claim there was.
 */
export function pageWindow(page: number, pageCount: number): PageToken[] {
  if (pageCount <= MAX_TOKENS) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  // The window lives strictly between the first and last pages, which are
  // always drawn — hence the floor of 2 and the ceiling of `pageCount - WINDOW`.
  const start = Math.min(Math.max(page - 1, 2), pageCount - WINDOW);
  const end = start + WINDOW - 1;

  return [
    1,
    // `start - 1 > 1` rather than `start > 2`: the same test, written as the
    // question being asked — is there at least one page between them?
    ...(start - 1 > 1 ? (['gap'] as const) : []),
    ...Array.from({ length: WINDOW }, (_, index) => start + index),
    ...(pageCount - end > 1 ? (['gap'] as const) : []),
    pageCount,
  ];
}
