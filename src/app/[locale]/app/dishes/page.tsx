import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { DishTable } from '@/features/weekly-plans/components/dish-table';
import { listDishes, listMealTypes } from '@/features/weekly-plans/queries';
import { MEAL_TYPES } from '@/features/weekly-plans/schema';
import { membersOf } from '@/lib/enum';
import { Link } from '@/i18n/navigation';
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
    <div className="space-y-4 text-start">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('subtitle', { count: result.total })}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="min-w-48">
          <label htmlFor="q" className="block pb-1 text-xs font-medium">
            {t('search')}
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q ?? ''}
            className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm"
          />
        </div>

        <div>
          <label htmlFor="mealType" className="block pb-1 text-xs font-medium">
            {t('columns.mealTypes')}
          </label>
          <select
            id="mealType"
            name="mealType"
            defaultValue={mealType ?? ''}
            className="h-9 rounded-md border border-border bg-transparent px-3 text-sm"
          >
            <option value="">{t('allMealTypes')}</option>
            {membersOf(MEAL_TYPES, mealTypes).map((type) => (
              <option key={type} value={type}>
                {t(`mealTypes.${type}`)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          {t('apply')}
        </button>
      </form>

      <DishTable result={result} />

      {result.pageCount > 1 && (
        <nav className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: result.pageCount }, (_, index) => index + 1).map((number) => (
            <Link
              key={number}
              href={`/app/dishes?${new URLSearchParams({
                ...(q ? { q } : {}),
                ...(mealType ? { mealType } : {}),
                page: String(number),
              })}`}
              aria-current={number === result.page ? 'page' : undefined}
              className={
                number === result.page
                  ? 'rounded bg-accent px-2 py-1 font-medium'
                  : 'rounded px-2 py-1 text-muted-foreground hover:bg-accent/60'
              }
            >
              {number}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
