import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { Badge } from '@/components/ui/badge';
import { DismissibleCallout } from '@/components/ui/dismissible-callout';
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { CATALOG_QUERY_MAX, listSharedFoods } from '@/features/admin/catalog';
import { AdminToolbar } from '@/features/admin/components/toolbar';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/params';
import { formatNumber } from '@/lib/format';

type CatalogPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({ params }: CatalogPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'admin.catalog' });
  return { title: t('title') };
}

/**
 * The shared food catalog.
 *
 * Capped at `CATALOG_QUERY_MAX` rows with a line saying so, rather than
 * paginated. The catalog is 145 foods and the way anyone finds one is by typing
 * its name; a page control would be furniture on a list nobody reads to the end.
 *
 * **The export notice is at the top, not the bottom.** An edit made here is not
 * durable until `db:export:catalog --apply` writes it back to the committed file
 * — telling the reader that after they have edited would be telling them too
 * late.
 */
export default async function CatalogPage({ params, searchParams }: CatalogPageProps) {
  const locale = await resolveLocale(params);
  const query = (await searchParams).q?.trim();

  const [t, tAdmin, foods] = await Promise.all([
    getTranslations('admin.catalog'),
    getTranslations('admin'),
    listSharedFoods(query),
  ]);

  return (
    <div className="space-y-4 text-start">
      <header className="space-y-1">
        <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('title')}</h1>
        <p className="max-w-3xl text-body-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <DismissibleCallout
        tone="attention"
        /*
          A standing operational reminder, identical on both catalog screens and
          on every visit: edits here are database-only until somebody runs the
          export. That is exactly the shape of notice worth a dismiss control —
          it never resolves itself, so without one it is a permanent amber band
          across a screen the operator uses daily and learns to look past. The id
          is the notice, not the screen, so putting it away here puts it away on
          the food detail too; it says the same sentence.
        */
        noticeId="admin.catalog.exportNotice"
        dismissLabel={tAdmin('dismissNotice')}
      >
        {t('exportNotice')}
      </DismissibleCallout>

      {/*
        The same strip as the registry, the register and the log. It was a
        bespoke form with its own submit button; four list screens sharing one
        control is what makes "type, press enter" mean the same thing on each.
      */}
      <AdminToolbar
        action={`/${locale}/admin/catalog`}
        path="/admin/catalog"
        searchValue={query}
        searchLabel={t('searchLabel')}
        hasFilters={Boolean(query)}
      />

      {foods.length === CATALOG_QUERY_MAX ? (
        <p className="text-body-sm text-muted-foreground">
          {t('truncated', { count: formatNumber(locale, CATALOG_QUERY_MAX) })}
        </p>
      ) : null}

      <TableRoot>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columns.food')}</TableHead>
              <TableHead>{t('columns.category')}</TableHead>
              <TableHead>{t('columns.state')}</TableHead>
              <TableHead>{t('columns.kcal')}</TableHead>
              <TableHead>{t('columns.aliases')}</TableHead>
              <TableHead>{t('columns.usedBy')}</TableHead>
              <TableHead>{t('columns.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {foods.length === 0 ? (
              <TableEmpty colSpan={7}>{t('empty')}</TableEmpty>
            ) : (
              foods.map((food) => (
                <TableRow key={food.id}>
                  <TableCell>
                    <Link
                      href={`/admin/catalog/${food.id}`}
                      className="block rounded-sm font-medium underline-offset-4 outline-hidden hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {food.nameAr}
                    </Link>
                    <span className="block text-caption text-muted-foreground">{food.nameEn}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{food.category}</TableCell>
                  <TableCell className="text-muted-foreground">{food.state}</TableCell>
                  <TableCell className="tabular-nums">{formatNumber(locale, food.kcal)}</TableCell>
                  <TableCell className="tabular-nums">{formatNumber(locale, food.aliases)}</TableCell>
                  <TableCell className="tabular-nums">{formatNumber(locale, food.usedBy)}</TableCell>
                  <TableCell>
                    <Badge variant={food.isActive ? 'muted' : 'attention'}>
                      {food.isActive ? t('status.active') : t('status.inactive')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableRoot>
    </div>
  );
}
