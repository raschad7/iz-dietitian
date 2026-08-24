import { Skeleton } from '@/components/ui/skeleton';

/**
 * The body of a client's record, drawn empty.
 *
 * This boundary sits *inside* the record's layout, so it covers the traffic
 * that stays within one client — overview, nutrition, plans, visits, portal —
 * and leaves the way back and the record's own chrome standing while the next
 * section loads. Those are the navigations the record is mostly made of.
 *
 * Arriving from the register is a different trip: the layout above has to read
 * the client before any of this exists, so that wait belongs to
 * `clients/loading.tsx`, one level up.
 *
 * No header row here for the same reason — the layout draws it and the layout
 * is already on screen.
 */
export default function ClientRecordLoading() {
  return (
    <div className="flex flex-col gap-3 lg:h-full lg:min-h-0" aria-busy>
      {/* The identity card, then the sections under it. */}
      <Skeleton className="h-40 shrink-0 rounded-lg" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}
