'use client';

import { useState, type ReactNode } from 'react';

import { CALENDAR_VIEWS, type CalendarView } from '../schema';
import { Calendar } from './calendar';
import { takeCalendarFrame } from './calendar-snapshot-store';

/**
 * Which view is arriving, read off the address being navigated to.
 *
 * The boundary is not handed props by the page it stands in for, and the three
 * views are one route told apart by `?view=` — so the URL is the only thing
 * here that knows which grid is coming. Anything unrecognised is the week,
 * matching `resolveView` on the page itself; the two have to agree, or the
 * redraw is of a view the page will not render.
 *
 * `window` rather than `useSearchParams`, which would put a prerender
 * constraint on a component whose whole job is to be a Suspense fallback. It
 * costs nothing to do without: the snapshot store is a module-level value in
 * one tab, so on the server there is never a frame to find and the answer here
 * would not be used.
 */
function arrivingView(): CalendarView {
  if (typeof window === 'undefined') return 'week';

  const asked = new URLSearchParams(window.location.search).get('view');

  return CALENDAR_VIEWS.find((view) => view === asked) ?? 'week';
}

/**
 * The calendar the reader last looked at, drawn again while the real one loads.
 *
 * ## Why the skeleton was not enough
 *
 * `loading.tsx` commits the navigation on the click and fills the page in
 * underneath — see the note on `CalendarLoading` — but what it filled in was a
 * grey grid, every single time. The calendar is a screen a dietitian steps away
 * from and back to all day: open a client's record, come back; take a booking,
 * come back. Each of those returns re-ran the page and redrew the placeholder,
 * so the most-visited screen in the app was the one that never looked loaded.
 *
 * The router's own cache covers part of that (`staleTimes` in `next.config.ts`)
 * and cannot cover the rest: every write in the app ends in `revalidatePath`,
 * and a `router.refresh()` anywhere drops the client cache entirely, which is
 * exactly what a working morning is full of.
 *
 * So the last frame is kept in the tab — see `calendar-snapshot-store` — and
 * this redraws it. First visit of a session: the skeleton, because there is
 * nothing to redraw. Every visit after it: the calendar, immediately, replaced
 * by the server's answer the moment it lands.
 *
 * ## Frozen, and why
 *
 * `inert` and `frozen`, so what is on screen cannot be mistaken for a live
 * calendar: nothing here takes a click, a drag or focus, and `Calendar` skips
 * its `CalendarViewGuard` — a guard that fires `router.replace` when the screen
 * is too narrow for the view it is holding, which from inside a loading
 * boundary would be a redraw navigating on the reader's behalf. `aria-busy` on
 * the wrapper in `loading.tsx` already says the page is still arriving.
 *
 * The frame is read once, on mount, and held in state. Read during every render
 * instead, a snapshot could change under a reader mid-wait.
 */
export function CalendarSnapshot({ fallback }: { fallback: ReactNode }) {
  const [frame] = useState(() => takeCalendarFrame(arrivingView()));

  if (!frame) return fallback;

  return (
    /* The page's own body wrapper — see `CalendarPage`. The redraw has to sit
       in the same box the real calendar will, or the grid moves as it lands. */
    <div className="min-h-0 flex-1" inert>
      <Calendar
        locale={frame.locale}
        view={frame.view}
        anchorDate={frame.anchorDate}
        hours={frame.hours}
        appointments={frame.appointments}
        clients={frame.clients}
        frozen
      />
    </div>
  );
}
