import { redirect } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';

type ArchivedClientsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/app/clients/archived` is a legacy address.
 *
 * The archive was a page of its own: the same table, the same pager and the
 * same query as the register, wrapped in a second header, a second title and a
 * way back. Leaving the register to read it meant losing the toolbar you were
 * standing at — the search you had typed, the filter you had set — to look at a
 * list of the same people.
 *
 * It is a *view* of the register now (`/app/clients?status=archived`): the
 * toggle in the toolbar swaps which half the table shows and leaves everything
 * else in the address bar where it was. Anything still pointing here — a
 * bookmark, an older link — arrives at that view through this hop, with its
 * search, filter and sort carried across.
 */
export default async function ArchivedClientsPage({ params, searchParams }: ArchivedClientsPageProps) {
  const locale = await resolveLocale(params);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value);
  }
  // Not read from the query string: this address *is* the archive, and a
  // hand-edited `?status=active` on it would forward to the active register.
  query.set('status', 'archived');

  redirect({ href: `/app/clients?${query.toString()}`, locale });
}
