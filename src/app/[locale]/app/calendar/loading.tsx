import { PageHeaderSkeleton } from '@/components/layout/page-header-skeleton';
import { CalendarGridSkeleton } from '@/features/booking/components/calendar-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The calendar, drawn empty.
 *
 * The grid goes full-bleed to the shell's inline edges while the toolbar keeps
 * the page gutter, so this has to do the same or the whole screen slides
 * sideways as the real thing lands — the negative margins here are `FULL_BLEED`
 * in `calendar.tsx` and the padding is its `TOOLBAR_INSET`.
 *
 * **It opens on the week.** A `loading.tsx` is handed no params, so it cannot
 * read `?view=` and cannot know which of the three is coming. The week is the
 * calendar's own default — `resolveView` falls back to it, and it is what the
 * rail links to — so it is both the likeliest answer and the one whose shape
 * sits between the other two: a day is this with one column, a month replaces
 * the timeline. Landing on either of those redraws the panel once, which is a
 * far smaller correction than a spinner would have been.
 *
 * The grid itself is `CalendarGridSkeleton`, shared with the view switch inside
 * `Calendar` — the wait for a view to arrive should look the same whether you
 * came from another screen or from the tab beside it.
 */
export default function CalendarLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy>
      <PageHeaderSkeleton />

      <div className="flex min-h-0 flex-1 flex-col">
        {/* The toolbar: day/week/month on one side, the date navigator, search
            and "New appointment" on the other. */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 pt-4 md:px-5 md:pt-6">
          <Skeleton className="h-10 w-56" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-32 max-sm:hidden" />
          </div>
        </div>

        {/* Full-bleed from here down, exactly as the grid is. */}
        <div className="-mx-3 mt-4 flex min-h-0 flex-1 flex-col md:-mx-5">
          <CalendarGridSkeleton view="week" />
        </div>
      </div>
    </div>
  );
}
