import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { DishFilters } from '@/features/weekly-plans/components/dish-filters';
import { DishPagination } from '@/features/weekly-plans/components/dish-pagination';
import { DishTable } from '@/features/weekly-plans/components/dish-table';
import { listDishes, listMealTypes } from '@/features/weekly-plans/queries';
import { MEAL_TYPES } from '@/features/weekly-plans/schema';
import { membersOf } from '@/lib/enum';
import { resolveLocale } from '@/i18n/params';
import { requireStaffClinic } from '@/lib/session';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; mealType?: string; page?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'dishes' });
  return { title: t('title') };
}

export default async function DishesPage({ params, searchParams }: PageProps) {
  const locale = await resolveLocale(params);
  await requireStaffClinic(locale);

  const { q, mealType, page } = await searchParams;

  // `.catch`-style coercion: a hand-edited query string degrades to page 1 rather
  // than throwing a 500, matching the food browser.
  const parsedPage = Number(page);
  const currentPage = Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const [result, mealTypes, t] = await Promise.all([
    listDishes({ q, mealType, page: currentPage }),
    listMealTypes(),
    getTranslations('dishes'),
  ]);

  return (
    /*
      The page fills the shell and does not scroll; the catalog does, inside
      itself. A long list otherwise pushes the search field and the pager off
      the top and bottom of the screen, and the two controls you reach for
      *because* the list is long are the two the list hides.

      Below `md` the page scrolls as a whole, the way the register does: on a
      phone the chrome and a usable number of rows do not both fit. The column
      names still stay put — the table header is sticky either way.
    */
    <div className="flex flex-col gap-6 text-start md:h-full md:min-h-0">
      <div className="shrink-0">
        <h1 className="font-heading text-heading-lg font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-body-sm text-muted-foreground">
          {t('subtitle', { count: result.total })}
        </p>
      </div>

      <DishFilters
        q={q}
        mealType={mealType}
        // Narrowed against the enum rather than passed as strings: the labels
        // are looked up as `mealTypes.${type}`, and a `text[]` column is not
        // proof its contents are still valid meal times.
        mealTypes={membersOf(MEAL_TYPES, mealTypes)}
      />

      <DishTable result={result} filtered={Boolean(q) || Boolean(mealType)} />

      {/* Renders nothing on an empty catalog, so it is a direct child: an empty
          wrapper here would still cost the page a row's worth of gap. */}
      <DishPagination result={result} q={q} mealType={mealType} />
    </div>
  );
}
