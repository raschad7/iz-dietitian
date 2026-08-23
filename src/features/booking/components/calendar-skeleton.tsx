import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { type CalendarView } from '../schema';

/**
 * The grid, drawn empty — one shape per view.
 *
 * One caller: `app/calendar/loading.tsx`, for arriving at the calendar from
 * elsewhere, which is the only wait this screen has left.
 *
 * `Calendar` used to draw this too, for the moment between pressing a view tab
 * and that view landing. It does not any more, and nothing does — the loader
 * reads one span that holds all three views (see `loadedRangeFor`), so pressing
 * a tab re-arranges appointments the browser is already holding and the new
 * grid is there in the same frame. There is no moment left to fill.
 *
 * The measurements are the grid's own, imported in spirit from `calendar.tsx`:
 * `GUTTER_WIDTH` is `w-16`, a column's floor is `min-w-28`, and the month lays
 * out as `grid-cols-7` over six rows. They are written out here rather than
 * imported because that module is a 1700-line client component and this is
 * rendered by a server-side `loading.tsx`; the ⚠ on `GUTTER_WIDTH` is the note
 * to keep in mind if either moves.
 */
export function CalendarGridSkeleton({ view, className }: { view: CalendarView; className?: string }) {
  const columns = view === 'day' ? 1 : 7;

  if (view === 'month') {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col border-t border-border', className)} aria-busy>
        {/* The weekday names, on the grid's own muted band. */}
        <div className="grid min-w-[42rem] grid-cols-7 border-b border-border bg-muted">
          {Array.from({ length: 7 }, (_, day) => (
            <div key={day} className="flex justify-center px-2 py-2">
              <Skeleton className="h-3.5 w-8" />
            </div>
          ))}
        </div>

        {/*
          Six rows, which is what the month grid always draws — see the note on
          `grid-rows-6` in `MonthView`. A five-row placeholder under a six-row
          grid would resize the whole panel as the real thing landed.
        */}
        <div className="grid min-h-0 min-w-[42rem] flex-1 grid-cols-7 grid-rows-[repeat(6,minmax(7rem,1fr))] overflow-hidden">
          {Array.from({ length: 42 }, (_, cell) => (
            <div key={cell} className="border-b border-e border-border p-2">
              <Skeleton className="size-6 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col border-t border-border', className)} aria-busy>
      {/*
        The day headers, and the corner cell that holds the hour gutter's width.
        That cell is empty in the real grid too, so it is a spacer here rather
        than a bar — a grey block in the corner would be inventing furniture.
      */}
      <div className="flex border-b border-border">
        <div className="w-16 shrink-0" />
        {Array.from({ length: columns }, (_, day) => (
          <div key={day} className="flex min-w-28 flex-1 flex-col items-center gap-1 py-2">
            <Skeleton className="h-3 w-7" />
            <Skeleton className="h-5 w-6" />
          </div>
        ))}
      </div>

      {/*
        The clinic day. Ten rows at the grid's own `PX_PER_SLOT` × 2 — an hour
        each — which is about the span a window shows before it scrolls, and the
        same rhythm the real hour lines land on. `overflow-hidden` because a
        skeleton has nothing below the fold worth reaching.
      */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="w-16 shrink-0">
          {Array.from({ length: 10 }, (_, hour) => (
            <div key={hour} className="flex h-16 justify-end pe-2">
              {/* Nudged up onto the line it labels, as the real hour marks are. */}
              <Skeleton className="mt-[-0.4rem] h-3 w-8" />
            </div>
          ))}
        </div>

        {Array.from({ length: columns }, (_, day) => (
          <div key={day} className="min-w-28 flex-1 border-s border-border">
            {Array.from({ length: 10 }, (_, hour) => (
              <div key={hour} className="h-16 border-b border-border/60" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
