import { PageHeaderSkeleton } from '@/components/layout/page-header-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { CLIENTS_PAGE_SIZE } from '@/features/clients/queries';

/**
 * The subscriber list, drawn empty.
 *
 * Two routes wait on this shape — Details (`clients/(register)`) and Bills
 * (`clients/bills`) — because both render the same `ClientTable` under the same
 * toolbar. It is a component rather than a file each of them copies for the
 * ordinary reason: a placeholder that is not the same height as the thing
 * replacing it makes the page step as it lands, and two copies drift the moment
 * one screen's toolbar changes.
 *
 * Not to be confused with `clients/loading.tsx`, which is a *record* arriving
 * and a different shape entirely.
 *
 * `CLIENTS_PAGE_SIZE` rows, read from the query that will fill them rather than
 * guessed at: that figure is chosen so a full page fits the screen, so it is
 * also exactly the number of rows that makes this the same height as the table.
 */
export function ClientListSkeleton() {
  return (
    <div className="flex min-h-full flex-col gap-4 text-start" aria-busy>
      <PageHeaderSkeleton subtitle />

      {/*
        The toolbar: search across the reading side, filter and "New client" on
        the far one. Same row, same wrap, so the controls do not jump sideways
        as they arrive.
      */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-11 w-full sm:w-64 lg:min-w-64 lg:flex-1" />
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:justify-end">
          <Skeleton className="h-11 w-28" />
          <Skeleton className="h-11 w-32" />
        </div>
      </div>

      {/* Header rule and rows, at the table's own row height. */}
      <div className="min-w-0 space-y-px">
        <Skeleton className="h-10 rounded-b-none" />
        {Array.from({ length: CLIENTS_PAGE_SIZE }, (_, row) => (
          <Skeleton key={row} className="h-13 rounded-none last:rounded-b-md" />
        ))}
      </div>
    </div>
  );
}
