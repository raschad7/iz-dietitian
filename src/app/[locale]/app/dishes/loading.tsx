import { PageHeaderSkeleton } from '@/components/layout/page-header-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The dish catalog, drawn empty.
 *
 * The page pins itself to the shell from `md` up and scrolls the list inside
 * itself, so this does too: heading and toolbar at their own heights, then a
 * clipped panel taking the rest. Get that wrong and the toolbar arrives a
 * hundred pixels from where the placeholder put it.
 *
 * Ten rows, not the twenty a page holds. The list is height-bounded above `md`,
 * so the count changes nothing there and only decides how far down a phone the
 * grey runs — and ten fills the fold without a placeholder that scrolls.
 */
export default function DishesLoading() {
  return (
    <div className="flex flex-col gap-4 text-start md:h-full md:min-h-0" aria-busy>
      <div className="flex shrink-0 flex-col gap-4">
        <PageHeaderSkeleton />

        {/* Search, the filter chips and "New dish", all one row — see
            `DishFilters`, which sets this row's 40px height. */}
        <div className="flex h-10 shrink-0 items-center gap-2">
          <Skeleton className="h-10 min-w-0 flex-1" />
          <Skeleton className="h-10 w-24 max-sm:hidden" />
          <Skeleton className="h-10 w-24 max-sm:hidden" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-px overflow-hidden">
        <Skeleton className="h-10 rounded-b-none" />
        {Array.from({ length: 10 }, (_, row) => (
          <Skeleton key={row} className="h-22 rounded-none md:h-18" />
        ))}
      </div>
    </div>
  );
}
