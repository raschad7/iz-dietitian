import { PageHeaderSkeleton } from '@/components/layout/page-header-skeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { CLIENTS_PAGE_SIZE } from '@/features/clients/queries';

/**
 * The register, drawn empty.
 *
 * **Inside `(register)` rather than at `clients/`, and the group exists for
 * this file.** A boundary one level up wraps `[clientId]` as well, so opening a
 * client's record showed a page of grey table rows — the screen being left, not
 * the one arriving — until that record's own layout resolved, and only then the
 * record's skeleton. Two waits, the first of them wrong. The group scopes this
 * one to the list and the archive, which are the same screen reading the two
 * halves of the register, and leaves the record to `clients/loading.tsx`.
 *
 * The group changes no URL: `(register)` is parentheses, so `/app/clients` is
 * still `/app/clients`.
 *
 * `CLIENTS_PAGE_SIZE` rows, read from the query that will fill them rather than
 * guessed at: that figure is chosen so a full page of the register fits the
 * screen, so it is also exactly the number of rows that makes this placeholder
 * the same height as the thing replacing it. A literal here would be a second
 * place to remember when the page size changes, and the page would step up or
 * down as it landed.
 */
export default function ClientsLoading() {
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
