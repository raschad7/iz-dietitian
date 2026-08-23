import { PageHeaderSkeleton } from '@/components/layout/page-header-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * A client's record, drawn empty — chrome and all.
 *
 * This is the boundary for *arriving* at a record from somewhere else, which is
 * a different wait from moving between a record's own sections. The record's
 * layout reads the client before anything below it exists, and a layout runs
 * above its own segment's `loading.tsx`, so that read can only be covered from
 * here. Hence the way-back link and the identity card in this file and not in
 * `[clientId]/loading.tsx`, which covers the sections and leaves the chrome
 * standing because by then it is real.
 *
 * The register is not this shape and no longer shares this boundary — it is in
 * the `(register)` group with a skeleton of its own. See the note there.
 */
export default function ClientRecordArrivalLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 text-start" aria-busy>
      {/* The way back to the register — the layout's only chrome. */}
      <Skeleton className="h-5 w-28" />

      <PageHeaderSkeleton />

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Skeleton className="h-40 shrink-0 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}
