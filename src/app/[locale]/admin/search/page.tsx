import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon, type IconName } from '@/components/ui/icon';
import { searchPlatform, type SearchHit } from '@/features/admin/queries';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { formatNumber } from '@/lib/format';

type SearchPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({ params }: SearchPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'admin.search' });
  return { title: t('title') };
}

const KIND_ICON: Record<SearchHit['kind'], IconName> = {
  clinic: 'clinicOutline',
  account: 'person',
  food: 'foods',
};

const KIND_KEY = {
  clinic: 'kinds.clinic',
  account: 'kinds.account',
  food: 'kinds.food',
} as const;

const FLAG_KEY = {
  suspended: 'flags.suspended',
  disabled: 'flags.disabled',
  inactive: 'flags.inactive',
} as const;

/**
 * Everything the platform can act on, from one box.
 *
 * ## The question the old panel could not answer
 *
 * It had three search fields: one on the clinics screen, one on accounts, one on
 * the catalog. An operator holding an address had to decide *first* which table
 * it belonged to — which is the question they came to ask. Support work does not
 * arrive pre-sorted.
 *
 * ## Results are grouped by kind, not interleaved by relevance
 *
 * There is no scoring here and inventing one would be pretending. Three separate
 * `ILIKE` reads over three tables produce three answers, and a merged list with
 * no ranking is a list whose order the reader cannot predict. Grouped, the
 * reader scans to the heading they wanted and stops.
 *
 * ## Two characters is the floor
 *
 * A single letter matches most of the deployment and answers nothing. The
 * minimum is in `searchPlatform`, so the read never happens rather than being
 * discarded after.
 */
export default async function AdminSearchPage({ params, searchParams }: SearchPageProps) {
  const locale = await resolveLocale(params);
  const query = (await searchParams).q?.trim() ?? '';

  const t = await getTranslations('admin.search');
  const hits = query.length >= 2 ? await searchPlatform(query) : [];

  const groups: { kind: SearchHit['kind']; hits: SearchHit[] }[] = (
    ['clinic', 'account', 'food'] as const
  )
    .map((kind) => ({ kind, hits: hits.filter((hit) => hit.kind === kind) }))
    .filter((group) => group.hits.length > 0);

  return (
    <div className="space-y-5 text-start">
      <header className="space-y-1">
        <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('title')}</h1>
        {query ? (
          <p className="text-body-sm text-muted-foreground">
            {t('results', { count: formatNumber(locale, hits.length) })}
          </p>
        ) : (
          <p className="text-body-sm text-muted-foreground">{t('hint')}</p>
        )}
      </header>

      {query.length >= 2 && hits.length === 0 ? (
        <EmptyState icon="search" title={t('empty', { query })} description={t('hint')} />
      ) : null}

      {groups.map((group) => (
        <section key={group.kind} className="space-y-2">
          <h2 className="flex items-center gap-2 font-heading text-heading-sm font-semibold">
            <Icon name={KIND_ICON[group.kind]} className="size-4 text-muted-foreground" aria-hidden />
            {t(KIND_KEY[group.kind])}
          </h2>

          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {group.hits.map((hit) => (
                  <li key={`${hit.kind}-${hit.id}`}>
                    {/*
                      The whole row is the target here, unlike the registry's
                      tables. A search result has nothing in it to select — it is
                      a name and a subtitle, both of which the reader wants to
                      click — so a row-wide target costs nothing and gives a
                      pointer-sized destination.
                    */}
                    <Link
                      href={hit.href}
                      className="flex items-center justify-between gap-3 p-3 outline-hidden hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{hit.title}</span>
                        {hit.subtitle ? (
                          <span className="block truncate text-caption text-muted-foreground" dir="ltr">
                            {hit.subtitle}
                          </span>
                        ) : null}
                      </span>

                      {hit.flag ? <Badge variant="attention">{t(FLAG_KEY[hit.flag])}</Badge> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
