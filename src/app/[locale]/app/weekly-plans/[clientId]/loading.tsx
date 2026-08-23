import { PageHeaderSkeleton } from '@/components/layout/page-header-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { PLANNER_THEME } from '@/features/weekly-plans/theme';

/**
 * A client's plan board, drawn empty.
 *
 * **The longest wait in the product, and the one most worth a boundary of its
 * own.** The page reads in three rounds that cannot be collapsed into one — the
 * client's context, then the board and its plan list, then the whole dish
 * catalog costed against that client's allergens — so the second round cannot
 * start until the first has landed. Three round trips is three times whatever
 * one costs, and until this file existed all of it was spent standing on the
 * screen the dietitian had just left.
 *
 * It is a closer boundary than `weekly-plans/loading.tsx`, and deliberately:
 * arriving here from the picker is the planner's main path, and the picker's
 * centred column is nothing like the board. There is no layout between the two,
 * so this boundary is reached directly and the wrong-shaped one never shows.
 *
 * The board is a summary strip, then the week — a column of meal names and
 * seven days beside them, which is the grid `PlanBoard` draws from `xl`. Below
 * that the days stack, which is why the day columns are hidden until then here
 * too.
 */
export default function PlanBoardLoading() {
  return (
    <div
      className={`${PLANNER_THEME} flex min-h-full min-w-0 flex-col text-start md:h-full md:min-h-0`}
      aria-busy
    >
      <PageHeaderSkeleton className="mb-4" />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
        {/* The board's own header: the week, its totals and the plan controls. */}
        <Skeleton className="h-24 shrink-0 rounded-lg" />

        {/* The week. Meal names down the reading edge, seven days across. */}
        <div className="grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-4 overflow-hidden xl:grid-cols-[auto_repeat(7,minmax(0,1fr))] xl:gap-x-4">
          {['breakfast', 'lunch', 'dinner', 'snack'].map((meal) => (
            <div key={meal} className="contents">
              <Skeleton className="h-24 w-20 xl:w-24" />
              <Skeleton className="h-24 min-w-0 rounded-lg" />
              {/* The six remaining days, from `xl` — below it the week stacks
                  and one column is the whole row. */}
              {[1, 2, 3, 4, 5, 6].map((day) => (
                <Skeleton key={day} className="h-24 min-w-0 rounded-lg max-xl:hidden" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
