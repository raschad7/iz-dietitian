import { ClientListSkeleton } from '@/features/clients/components/client-list-skeleton';

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
 * The markup moved to `ClientListSkeleton` when Bills — the other half of the
 * Subscriber group — came to need the same shape. See the note there.
 */
export default function ClientsLoading() {
  return <ClientListSkeleton />;
}
