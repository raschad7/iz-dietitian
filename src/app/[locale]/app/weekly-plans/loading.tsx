import { PageHeaderSkeleton } from '@/components/layout/page-header-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { PLANNER_THEME } from '@/features/weekly-plans/theme';

/**
 * The planner, drawn empty.
 *
 * `PLANNER_THEME` is on the wrapper for the same reason the page puts it there:
 * the planner recolours everything inside it, and a placeholder in the app's
 * greys would flip palette the moment the board arrived — the one screen in the
 * product where a skeleton can change *colour* under the reader rather than
 * just shape.
 *
 * The centred column is the entry screen — pick a client, or take one of the
 * suggestions — and it is what the section opens on. Landing straight on a
 * board belongs to `/weekly-plans/[clientId]`, which passes through this
 * boundary on its way; the column is the honest guess when the route has not
 * said which of the two it is yet.
 */
export default function WeeklyPlansLoading() {
  return (
    <div
      className={`${PLANNER_THEME} flex min-h-full min-w-0 flex-col text-start md:h-full md:min-h-0`}
      aria-busy
    >
      <PageHeaderSkeleton className="mb-4" />

      <div className="flex min-h-0 min-w-0 flex-1 justify-center overflow-hidden px-4 py-12 sm:px-6 lg:py-20">
        <div className="w-full max-w-xl space-y-6">
          {/* Heading, the line under it, then the client picker. */}
          <div className="mx-auto flex max-w-md flex-col items-center gap-2">
            <Skeleton className="h-7 w-64 max-w-full" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>

          <Skeleton className="h-11 w-full" />

          {/* And the suggested clients under it, two across from `sm`. */}
          <div className="grid gap-3 pt-6 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, card) => (
              <Skeleton key={card} className="h-20 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
