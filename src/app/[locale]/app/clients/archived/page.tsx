import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ClientPagination } from '@/features/clients/components/client-pagination';
import { ClientTable } from '@/features/clients/components/client-table';
import { listClients } from '@/features/clients/queries';
import { listClientsSchema } from '@/features/clients/schema';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';
import { cn } from '@/lib/utils';

type ArchivedClientsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: ArchivedClientsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'clients' });
  return { title: t('archive.title') };
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * The other half of the register.
 *
 * Archiving has always been reversible, but there was nowhere to reverse it
 * *from*: the only way to see an archived client was to set "Status → All" in
 * the filter popover and then work out which of the rows in front of you were
 * the grey ones. So a client archived by a slipped click was, in practice,
 * gone.
 *
 * A page rather than a filter, for three reasons a filter could not give:
 * it has an address, so it can be linked to and returned to; it can say what it
 * is at the top, so nobody has to infer why this list looks short; and every
 * row's action is Restore rather than Archive, which is the only thing anyone
 * comes here to do.
 *
 * It is the same table, the same search and the same pager as the register —
 * one component, told which half it is reading. Two lists of the same people
 * should not be two screens' worth of code, and the moment they are, they start
 * disagreeing about what a client row looks like.
 *
 * **Not in the rail.** The rail is the five places a working day is spent, and
 * this is not one of them; it is reached from the register, which is where you
 * are standing when you notice someone missing.
 */
export default async function ArchivedClientsPage({ params, searchParams }: ArchivedClientsPageProps) {
  const locale = await resolveLocale(params);
  const { clinicId } = await requireStaffClinic(locale);

  const raw = await searchParams;
  const input = listClientsSchema.parse({
    q: single(raw.q),
    filterBy: single(raw.filterBy),
    filterValue: single(raw.filterValue),
    sort: single(raw.sort),
    dir: single(raw.dir),
    page: single(raw.page),
    // Not from the query string: which half of the register this is, is a
    // property of the route. A hand-edited `?status=active` here would render
    // the active list under an "Archived" heading.
    status: 'archived',
  });

  const [result, t] = await Promise.all([listClients(clinicId, input), getTranslations('clients')]);

  return (
    <div className="flex flex-col gap-6 text-start md:h-full md:min-h-0">
      <div className="shrink-0 space-y-1">
        {/*
          The way back, above the title rather than beside it: this page is a
          detour off the register, and the first thing someone needs after
          restoring a client is the list they restored them to.
        */}
        <Link
          href="/app/clients"
          className={cn(
            buttonVariants({ variant: 'neutralGhost', size: 'sm' }),
            '-ms-3 self-start ps-2',
          )}
        >
          <Icon name="chevronStart" />
          {t('title')}
        </Link>

        <h1 className="font-heading text-heading-lg font-semibold tracking-tight">
          {t('archive.title')}
        </h1>
        <p className="text-body-sm text-muted-foreground">
          {t('archive.subtitle')} · {t('resultCount', { total: result.total })}
        </p>
      </div>

      <ClientTable
        result={result}
        input={input}
        filtered={Boolean(input.q) || Boolean(input.filterBy && input.filterValue)}
        locale={locale}
        basePath="/app/clients/archived"
        archived
      />

      <ClientPagination result={result} input={input} basePath="/app/clients/archived" />
    </div>
  );
}
