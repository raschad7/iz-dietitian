import { ClientListSkeleton } from '@/features/clients/components/client-list-skeleton';

/**
 * Bills, drawn empty.
 *
 * The same skeleton the register waits behind, because Bills renders the same
 * table — see `bills/page.tsx`. Without this file the wait would fall through
 * to `clients/loading.tsx`, which is a client *record* arriving: a way-back
 * link and an identity card, none of which this screen has.
 */
export default function BillsLoading() {
  return <ClientListSkeleton />;
}
