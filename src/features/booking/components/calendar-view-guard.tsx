'use client';

import { useEffect } from 'react';

import { type CalendarView } from '../schema';

/**
 * Keeps the calendar on a view the screen actually offers.
 *
 * The toolbar hides the segments a screen is too narrow for — the whole switch
 * below `md`, the month segment below `lg` — but hiding a control does not close
 * the door behind it. `/app/calendar/month` is a URL: it can be typed,
 * bookmarked, shared, reached with the back button, or arrived at by turning a
 * tablet from landscape into portrait while the month grid is on screen. In
 * every one of those cases the reader ends up looking at a grid their toolbar no
 * longer admits exists, with no segment left to press to leave it.
 *
 * So this watches the breakpoint the switch is gated on and moves a reader down
 * to the view their screen offers: on a phone, anything → day.
 *
 * It used to carry a second rule, month → week on a tablet, and that went when
 * the month segment came back at `md`. A tablet now offers all three, so there
 * is nothing left for it to correct there.
 *
 * **It never moves up.** Widening a window does not drag a reader from the day
 * they are working on into a month they did not ask for — day is a legitimate
 * choice at every size, and only the views a screen *cannot* show are corrected.
 *
 * ## Why this is `matchMedia` and not CSS
 *
 * The rest of the responsive work in this app is CSS, deliberately. This cannot
 * be: the thing that has to change is *which route is mounted*, and CSS cannot
 * navigate. What it does share with the CSS is the breakpoints — 48rem and 64rem
 * are `md` and `lg` — written here in the same units so that changing one is an
 * obviously-required change to the other.
 *
 * `matchMedia` rather than a resize listener: the browser evaluates the query
 * itself and fires only when the answer flips, so dragging a window edge costs
 * two callbacks rather than sixty. The range syntax (`width < 48rem`) is the
 * same form `globals.css` already uses.
 *
 * ## Why `replace` and not `push`
 *
 * A view the screen cannot show must not become a history entry. With `push`, a
 * phone opening a shared month link would land on the day view with the month
 * still one Back press behind it — and pressing Back would bounce straight
 * forward again, which is a trap rather than a history.
 */
export function CalendarViewGuard({
  view,
  onFallback,
}: {
  /** The view currently mounted. */
  view: CalendarView;
  /**
   * Navigate to a view this screen supports. Must `replace` rather than push —
   * see the note above.
   */
  onFallback: (view: CalendarView) => void;
}) {
  useEffect(() => {
    // Day is offered at every width, so nothing here can ever apply to it and
    // the listeners are not worth attaching.
    if (view === 'day') return;

    const phone = window.matchMedia('(width < 48rem)');

    function check() {
      if (phone.matches) onFallback('day');
    }

    check();

    phone.addEventListener('change', check);
    return () => phone.removeEventListener('change', check);
  }, [view, onFallback]);

  return null;
}
