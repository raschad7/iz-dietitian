import { PageHeaderSkeleton } from '@/components/layout/page-header-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * What the staff app shows the instant you arrive, before the screen's data is.
 *
 * **This file is why navigation in this app is immediate.** Without a `loading`
 * boundary a route change is not committed until the server has finished the
 * page, so a click sat on the *old* screen for as long as the *new* one took to
 * query — the reader had already decided to leave and the app had not moved.
 * With one, React commits the navigation on the click and renders this in the
 * gap: the rail highlights the new section, the URL changes, and the page fills
 * in underneath. The wait is the same length; it is spent in the right place.
 *
 * It is also what makes the rail's links prefetchable. Every staff screen is
 * dynamic — they all read the session cookie — and Next will only prefetch a
 * dynamic route as far as its nearest `loading` file. With none in the tree
 * there was nothing static to fetch ahead, so `<Link>` prefetching did nothing
 * at all on this half of the product.
 *
 * ## Why this one is generic
 *
 * It stands in for the dashboard and for every screen under `/app` that has no
 * closer boundary — notifications, requests, settings, the profile. Those all
 * open the same way: the shared header, then cards. The four sections whose
 * shape is nothing like that (the register, the catalog, the calendar, the
 * planner) each have a `loading.tsx` of their own next to their page, and a
 * screen that grows a shape of its own should get one too rather than being
 * approximated here.
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy>
      <PageHeaderSkeleton />

      {/*
        The band of cards the dashboard opens on, at the width it opens at.
        Three across from `lg`, stacked below it — the same grid, so the fold
        holds the same amount before and after the data lands.
      */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>

      {/*
        And the panel under it. A fixed height rather than the diary's
        `flex-1`: this is standing in for four different screens and only one of
        them fills the window, so a block that claimed the rest of the height
        would leave the other three with a placeholder taller than the page they
        are about to be.
      */}
      <Skeleton className="h-72 rounded-lg" />
    </div>
  );
}
