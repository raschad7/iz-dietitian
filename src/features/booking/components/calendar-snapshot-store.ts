import type { CalendarProps } from './calendar';

/**
 * Everything the clinic calendar needs to be drawn again, held for the length
 * of a browser session.
 *
 * The view and the anchor date travel with the appointments deliberately: what
 * is redrawn on the way back in has to be the calendar the reader *left*, not
 * the week the loading file would otherwise have guessed at.
 */
export type CalendarFrame = Pick<
  CalendarProps,
  'locale' | 'view' | 'anchorDate' | 'hours' | 'appointments' | 'clients'
>;

/**
 * The last calendar this tab drew, or null before it has drawn one.
 *
 * A module-level `let` rather than a context or a store: there is exactly one
 * clinic calendar, the value is written by a component that is unmounting and
 * read by one that is mounting in its place, and no React tree spans both of
 * them. A provider high enough to span them would have to sit in the app
 * layout, where it would re-render every screen in the app for a value only
 * this route reads.
 *
 * It is deliberately not `sessionStorage`. This is a redraw of something the
 * reader was just looking at, so it should live exactly as long as the page
 * does — surviving a reload would mean drawing a calendar from before the
 * reload as though it were current.
 */
let frame: CalendarFrame | null = null;

/** Records what the calendar just drew. Called by `Calendar` after it commits. */
export function rememberCalendar(next: CalendarFrame): void {
  frame = next;
}

/** The last frame, for the loading boundary to redraw. */
export function takeCalendarFrame(): CalendarFrame | null {
  return frame;
}
