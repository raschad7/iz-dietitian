import { useTranslations } from 'next-intl';

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { DISHES_PAGE_SIZE, type DishListResult } from '@/features/weekly-plans/queries';
import { DISH_AXES, type DishAxisFilters } from '@/features/weekly-plans/schema';
import { Link } from '@/i18n/navigation';
import { pageWindow } from '@/lib/pagination';

/**
 * The catalog's pager: what you are looking at, and the pages you can reach.
 *
 * This screen used to print every page number in one row — fine at three pages,
 * a wrapping wall at forty, and the catalog is the longest list in the app.
 * `pageWindow` draws the first page, three around the reader and the last, with
 * a `…` only where pages are genuinely being skipped, so the row is the same
 * width on page 2 as on page 200.
 *
 * Composed from `@/components/ui/pagination` the way that file's header
 * describes: every link is a typed `<Link>` handed in through `render`, so the
 * pager keeps client-side navigation and the locale prefix while this file
 * stays a server component with no state and no handlers.
 *
 * It draws even on a single page — the lone `1`, marked current between two
 * inert steps, says "this is all of them" rather more plainly than an empty
 * space does. An empty catalog is the exception: `DishTable` draws its own way
 * out there, and a pager under it would be a control for moving through
 * nothing.
 */
export function DishPagination({
  result,
  q,
  mealType,
  axes,
  hp,
  owner,
  hidden,
}: {
  result: DishListResult;
  q: string | undefined;
  mealType: string | undefined;
  /** The axis selections, re-joined into one query parameter each. */
  axes: DishAxisFilters;
  hp: string | undefined;
  owner: string | undefined;
  hidden: string | undefined;
}) {
  const t = useTranslations('dishes');

  if (result.total === 0) return null;

  // Every filter rides along, the "show hidden" view included: page 2 of a
  // differently filtered catalog is not the page the reader was on.
  const query = (page: number) => ({
    pathname: '/app/dishes' as const,
    query: {
      ...(q ? { q } : {}),
      ...(mealType ? { mealType } : {}),
      ...Object.fromEntries(
        DISH_AXES.filter(({ key }) => axes[key].length > 0).map(({ key }) => [
          key,
          axes[key].join(','),
        ]),
      ),
      ...(hp ? { hp } : {}),
      ...(owner ? { owner } : {}),
      ...(hidden ? { hidden } : {}),
      page: String(page),
    },
  });

  const from = (result.page - 1) * DISHES_PAGE_SIZE + 1;
  const to = from + result.items.length - 1;

  const atStart = result.page <= 1;
  const atEnd = result.page >= result.pageCount;

  return (
    /*
      The range and the controls are the two ends of one bar. They wrap onto
      separate lines below `sm` rather than shrinking, and the pager gives up
      its `mx-auto` here — it is the inline-end of a strip on this screen, not a
      block centred under a list.
    */
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border pt-3">
      {/* `tabular` so the range does not jitter as the digits change under it. */}
      <p className="tabular text-body-sm text-muted-foreground">
        {t('pagination.showing', { from, to, total: result.total })}
      </p>

      {/* `mx-0` drops the pager's default `mx-auto` centering; `w-auto` lets it
          size to its links and sit at the inline-end in both directions. */}
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            {/*
              At the ends there is no page to go to, so there is no link: an
              inert `<span>` rather than a disabled anchor, which is something a
              keyboard reader can land on only to be told it does nothing.
            */}
            <PaginationPrevious
              label={t('pagination.previous')}
              aria-disabled={atStart || undefined}
              className={atStart ? 'pointer-events-none text-muted-foreground/50' : undefined}
              render={atStart ? <span /> : <Link href={query(result.page - 1)} />}
            />
          </PaginationItem>

          {pageWindow(result.page, result.pageCount).map((token, index) =>
            token === 'gap' ? (
              // Keyed by index because a gap has no identity of its own — and
              // there are only ever two, at fixed positions.
              <PaginationItem key={`gap-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={token}>
                <PaginationLink
                  isActive={token === result.page}
                  aria-label={t('pagination.page', { page: token })}
                  /*
                    The current page goes nowhere: `aria-current` on a link that
                    reloads the page you are on is a step to nowhere with a
                    focus stop attached.

                    `prefetch={false}` on the numbers, and only on the numbers.
                    Next prefetches every link in the viewport, and this pager
                    puts five or six of them on screen at once, so opening the
                    catalog fired a request for page 2, 3, 4, 5 and 6 before the
                    reader had touched anything — the catalog fetching its whole
                    pagination is the one thing paging exists to avoid. It bought
                    nothing either: `/app/dishes` is dynamic, so an `auto`
                    prefetch reaches only as far as `loading.tsx` and the dishes
                    themselves are still fetched on the click. Next and Previous
                    keep theirs below — one step, in the direction a reader
                    actually goes.
                  */
                  render={
                    token === result.page ? <span /> : <Link href={query(token)} prefetch={false} />
                  }
                >
                  {token}
                </PaginationLink>
              </PaginationItem>
            ),
          )}

          <PaginationItem>
            <PaginationNext
              label={t('pagination.next')}
              aria-disabled={atEnd || undefined}
              className={atEnd ? 'pointer-events-none text-muted-foreground/50' : undefined}
              render={atEnd ? <span /> : <Link href={query(result.page + 1)} />}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
