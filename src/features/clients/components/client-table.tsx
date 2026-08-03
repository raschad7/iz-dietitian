import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
  TableSortLabel,
} from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { ArchiveButton } from '@/features/clients/components/archive-button';
import { ClientFormTrigger } from '@/features/clients/components/client-form-trigger';
import { StatusBadge } from '@/features/clients/components/status-badge';
import { type ClientListResult } from '@/features/clients/queries';
import { type ClientSort, type ListClientsInput } from '@/features/clients/schema';
import { Link } from '@/i18n/navigation';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * The client register.
 *
 * **The whole row is the link to the record.** A name that is the only target
 * in a 48px row is a small target on a phone and an odd one on a desktop, where
 * the pointer is already over the row. It is done with a stretched link — a
 * real `<Link>` in the name cell whose `::after` covers the row — rather than
 * an `onClick`, so the row keeps every affordance of a link (keyboard focus,
 * middle-click, open in a new tab, a URL in the status bar) and this file stays
 * a server component. The action cell sits `relative` so its own controls stay
 * above that overlay and remain separately clickable.
 *
 * The actions are icons rather than labels: three text buttons per row is
 * wider than the data in most columns, and at 20 rows the column of repeated
 * words is the loudest thing on the page. Each one keeps a real `aria-label`
 * and gains a hover/focus tooltip — the icon is shorthand for people who
 * already know the screen, never the only way to find out what it does.
 */

/** Columns a reader can order the register by, in the order they appear. */
const COLUMNS = [
  { key: 'fullName', numeric: false },
  { key: 'phone', numeric: true },
  { key: 'email', numeric: true },
  { key: 'status', numeric: false },
  { key: 'portalAccess', numeric: false },
] as const satisfies ReadonlyArray<{ key: ClientSort; numeric: boolean }>;

export function ClientTable({
  result,
  input,
  filtered,
  locale,
}: {
  result: ClientListResult;
  input: ListClientsInput;
  filtered: boolean;
  locale: Locale;
}) {
  const t = useTranslations('clients');
  const tNav = useTranslations('nav');

  if (result.items.length === 0) {
    return (
      <Card variant="empty" className="items-center gap-4 p-8 text-center">
        <p>{filtered ? t('emptyFiltered') : t('empty')}</p>

        {/* An empty list with no way out is a dead end; offer the next step. */}
        {filtered ? (
          <Link href="/app/clients" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {t('clearFilters')}
          </Link>
        ) : (
          <ClientFormTrigger locale={locale} className={buttonVariants({ size: 'sm' })}>
            {t('new')}
          </ClientFormTrigger>
        )}
      </Card>
    );
  }

  /**
   * Where a header points.
   *
   * Clicking the column already in effect flips its direction; clicking any
   * other starts it ascending, because a column you have just chosen to sort by
   * is one you want to read from the top. Sorting always returns to page 1 —
   * page 3 of a differently ordered list is not the same page 3.
   */
  const sortHref = (key: ClientSort) => ({
    pathname: '/app/clients' as const,
    query: {
      ...(input.q ? { q: input.q } : {}),
      status: input.status,
      sort: key,
      dir: input.sort === key && input.dir === 'asc' ? 'desc' : 'asc',
    },
  });

  return (
    <TableRoot>
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => {
              const active = input.sort === column.key ? input.dir : false;

              return (
                <TableHead key={column.key} numeric={column.numeric} sorted={active} className="p-0">
                  {/*
                    The link fills the cell rather than sitting inside it, so
                    the whole header is the target and not just the words.
                  */}
                  <Link
                    href={sortHref(column.key)}
                    className="flex w-full items-center px-3 py-2.5 transition-colors hover:bg-accent"
                  >
                    <TableSortLabel direction={active}>{t(`fields.${column.key}`)}</TableSortLabel>
                  </Link>
                </TableHead>
              );
            })}

            {/* Actions are not a column you can sort, so this head carries no `sorted`. */}
            <TableHead className="text-end">
              <span className="sr-only">{t('fields.actions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.items.map((client) => (
            <TableRow key={client.id} zebra linked>
              <TableCell>
                {/*
                  `after:absolute after:inset-0` is what stretches this link
                  over the whole row — see the `linked` prop on TableRow.
                */}
                <Link
                  href={`/app/clients/${client.id}`}
                  /*
                    The focus ring stays on the words, not on the stretched
                    `::after` — a keyboard reader tabbing down the list needs to
                    see *which* name they are on, and a ring drawn around the
                    whole row is the same shape as the row's hover fill.
                  */
                  className={cn(
                    'rounded-sm font-medium underline-offset-4 after:absolute after:inset-0 after:content-[""]',
                    'hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2',
                  )}
                >
                  {client.fullName}
                </Link>
              </TableCell>
              <TableCell numeric>{client.phone ?? '—'}</TableCell>
              <TableCell numeric>{client.email ?? '—'}</TableCell>
              <TableCell>
                <StatusBadge status={client.status} />
              </TableCell>
              <TableCell>
                {client.hasPortalAccess ? <Badge variant="outline">{t('portal.title')}</Badge> : '—'}
              </TableCell>

              {/*
                Row actions: the things worth doing without opening the record.
                `relative` lifts the cell above the row's stretched link so
                these stay separately clickable.
              */}
              <TableCell className="relative">
                <div className="flex items-center justify-end gap-2">
                  {/* Straight to this client's board — the client is the route, not a query param. */}
                  <Tooltip label={tNav('weeklyPlans')}>
                    <Link
                      href={`/app/weekly-plans/${client.id}`}
                      aria-label={tNav('weeklyPlans')}
                      className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
                    >
                      <Icon name="weeklyPlans" />
                    </Link>
                  </Tooltip>

                  <Tooltip label={t('edit')}>
                    <ClientFormTrigger
                      locale={locale}
                      clientId={client.id}
                      aria-label={t('edit')}
                      className={buttonVariants({ variant: 'outline', size: 'icon-sm' })}
                    >
                      <Icon name="edit" />
                    </ClientFormTrigger>
                  </Tooltip>


                  <ArchiveButton
                    locale={locale}
                    clientId={client.id}
                    archived={client.status === 'archived'}
                    iconOnly
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableRoot>
  );
}
