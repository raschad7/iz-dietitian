import { useTranslations } from 'next-intl';

import { type ClientListResult } from '@/features/clients/queries';
import { type ListClientsInput } from '@/features/clients/schema';
import { Link } from '@/i18n/navigation';

export function ClientPagination({
  result,
  input,
  basePath = '/app/clients',
}: {
  result: ClientListResult;
  input: ListClientsInput;
  /** The list this pager belongs to — the register, or the archive. */
  basePath?: '/app/clients' | '/app/clients/archived';
}) {
  const t = useTranslations('clients');

  if (result.pageCount <= 1) return null;

  // Every filter rides along, the sort included — page 2 of a differently
  // ordered list is not the page the reader was on.
  const query = (page: number) => ({
    pathname: basePath,
    query: {
      ...(input.q ? { q: input.q } : {}),
      ...(input.filterBy && input.filterValue
        ? { filterBy: input.filterBy, filterValue: input.filterValue }
        : {}),
      sort: input.sort,
      dir: input.dir,
      page: String(page),
    },
  });

  return (
    <nav className="flex shrink-0 items-center justify-between gap-4 text-sm" aria-label={t('title')}>
      {result.page > 1 ? (
        <Link href={query(result.page - 1)} className="underline-offset-4 hover:underline">
          {t('pagination.previous')}
        </Link>
      ) : (
        <span className="text-muted-foreground">{t('pagination.previous')}</span>
      )}

      <span className="text-muted-foreground">
        {t('pagination.position', { page: result.page, pageCount: result.pageCount })}
      </span>

      {result.page < result.pageCount ? (
        <Link href={query(result.page + 1)} className="underline-offset-4 hover:underline">
          {t('pagination.next')}
        </Link>
      ) : (
        <span className="text-muted-foreground">{t('pagination.next')}</span>
      )}
    </nav>
  );
}
