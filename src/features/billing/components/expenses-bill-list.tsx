'use client';

import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { pageWindow } from '@/lib/pagination';

/** How many bills the account shows before it asks you to turn a page. */
export const EXPENSES_PAGE_SIZE = 8;

/**
 * The bill list on a client's Expenses tab, eight at a time.
 *
 * ## Why the rows arrive already rendered
 *
 * They are built in `ClientExpensesPanel`, which is a server component: each row
 * needs `describeEntry` and the server's own translations, and every control in
 * it is already a client component of its own. Handing this the finished
 * elements and letting it slice them keeps all of that where it is — the
 * alternative was moving the entry formatting into the browser so that a page
 * number could be held there, which is a lot of code shipped to move a
 * `useState`.
 *
 * ## Why the page lives in this component and not in the URL
 *
 * The register's pagers are links, because there the page is a different
 * *query* — the rows have to be fetched. Here the whole ledger is already in
 * hand: the account was loaded to draw the totals above it and the subscription
 * standing beside it, and a year of bills for one subscriber is a short list
 * however it is read. A `?bills=2` would spend a server round trip on rows the
 * browser is already holding, and would reload the whole record — the identity
 * panel, the tabs, the rest of it — to move eight rows.
 *
 * It is also not a place worth returning to. A shared link to page 3 of one
 * subscriber's ledger answers no question anybody asks; a link to the
 * subscriber does.
 */
export function ExpensesBillList({
  rows,
}: {
  /** One element per bill, newest first, rendered on the server. */
  rows: ReactNode[];
}) {
  /* Its own translator rather than labels threaded down: the rows are what the
     server had to render, the pager's three words are not. */
  const t = useTranslations('billing');
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(rows.length / EXPENSES_PAGE_SIZE));
  /* Clamped rather than trusted: nothing can currently shrink the list under a
     reader mid-page, but a component that renders an empty page when something
     does is a bug that only shows up in front of somebody. */
  const current = Math.min(page, pageCount);
  const start = (current - 1) * EXPENSES_PAGE_SIZE;
  const atStart = current === 1;
  const atEnd = current === pageCount;

  return (
    <ul className="divide-y divide-border">
      {rows.slice(start, start + EXPENSES_PAGE_SIZE)}

      {/*
        The pager sits *in the list*, on the row the ninth bill would have
        occupied — same `<li>`, same rule above it, same height. It reads as the
        list continuing rather than as a control parked underneath it, and the
        card does not change height between a full page and a short last one.

        Drawn only when there is somewhere to go. A single page of six bills is
        all of them, and a pager saying `1` under it would be a control for
        moving through nothing.
      */}
      {pageCount > 1 ? (
        <li className="flex items-center justify-center py-3">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  label={t('pagination.previous')}
                  /*
                    A `<button>`, where the register's pager hands in a `<Link>`.
                    The page is state here, so the control that changes it is
                    the element that means "this does something on this page" —
                    an anchor with no address is a link nobody can open in a new
                    tab, middle-click, or copy.
                  */
                  render={
                    atStart ? <span /> : <button type="button" onClick={() => setPage(current - 1)} />
                  }
                  /* The same way `DishPagination` spends its ends: a step with
                     nowhere to go stops being a control rather than becoming a
                     greyed one that still takes focus. */
                  aria-disabled={atStart || undefined}
                  className={atStart ? 'pointer-events-none text-muted-foreground/50' : undefined}
                />
              </PaginationItem>

              {pageWindow(current, pageCount).map((token, index) =>
                token === 'gap' ? (
                  <PaginationItem key={`gap-${index}`}>
                    <span aria-hidden className="px-2 text-muted-foreground">
                      …
                    </span>
                  </PaginationItem>
                ) : (
                  <PaginationItem key={token}>
                    <PaginationLink
                      isActive={token === current}
                      aria-label={t('pagination.page', { page: token })}
                      render={<button type="button" onClick={() => setPage(token)} />}
                    >
                      {token}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}

              <PaginationItem>
                <PaginationNext
                  label={t('pagination.next')}
                  render={
                    atEnd ? <span /> : <button type="button" onClick={() => setPage(current + 1)} />
                  }
                  aria-disabled={atEnd || undefined}
                  className={atEnd ? 'pointer-events-none text-muted-foreground/50' : undefined}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </li>
      ) : null}
    </ul>
  );
}
