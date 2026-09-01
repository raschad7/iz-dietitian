import { PageLoading } from '@/components/layout/page-loading';
import { PLANNER_THEME } from '@/features/weekly-plans/theme';

/**
 * The wait for the planner's entry screen.
 *
 * `PLANNER_THEME` is on the wrapper for the same reason the page puts it there:
 * the planner recolours everything inside it, so a spinner drawn in the app's
 * greys would change colour under the reader the moment the board arrived. It
 * is the one screen in the product where that is possible.
 */
export default function WeeklyPlansLoading() {
  return (
    <div className={`${PLANNER_THEME} flex min-h-full min-w-0 flex-col text-start md:h-full md:min-h-0`}>
      <PageLoading />
    </div>
  );
}
