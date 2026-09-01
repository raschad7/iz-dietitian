import { PageLoading } from '@/components/layout/page-loading';
import { PLANNER_THEME } from '@/features/weekly-plans/theme';

/**
 * A client's plan board, still loading.
 *
 * **The longest wait in the product, and the one most worth a boundary of its
 * own.** The page reads in three rounds that cannot be collapsed into one — the
 * client's context, then the board and its plan list, then the whole dish
 * catalog costed against that client's allergens — so the second round cannot
 * start until the first has landed. Three round trips is three times whatever
 * one costs, and until this file existed all of it was spent standing on the
 * screen the dietitian had just left.
 *
 * A closer boundary than `weekly-plans/loading.tsx`, and deliberately: arriving
 * here from the picker is the planner's main path, and there is no layout
 * between the two, so this one is reached directly.
 *
 * Carries `PLANNER_THEME` for the reason given next door — the board recolours
 * its subtree, and the spinner has to already be in that palette.
 */
export default function PlanBoardLoading() {
  return (
    <div className={`${PLANNER_THEME} flex min-h-full min-w-0 flex-col text-start md:h-full md:min-h-0`}>
      <PageLoading />
    </div>
  );
}
