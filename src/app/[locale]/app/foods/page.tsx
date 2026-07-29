import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { FoodSearch } from '@/features/meal-plans/components/food-search';
import { FoodPagination, FoodTable } from '@/features/meal-plans/components/food-table';
import { listFoodCategories, listFoods } from '@/features/meal-plans/queries';
import { listFoodsSchema } from '@/features/meal-plans/schema';
import { resolveLocale } from '@/i18n/params';
import { requireStaffSession } from '@/lib/session';

type FoodsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: FoodsPageProps): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'foods' });
  return { title: t('title') };
}

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * The food composition reference, browsable.
 *
 * Guarded by `requireStaffSession` rather than `requireStaffClinic`: `foods` is
 * shared public-domain reference data with no tenant to scope to, so there is no
 * `clinicId` to demand. The session check is still needed — this is behind the
 * dietitian area.
 */
export default async function FoodsPage({ params, searchParams }: FoodsPageProps) {
  const locale = await resolveLocale(params);
  await requireStaffSession(locale);

  const raw = await searchParams;
  const input = listFoodsSchema.parse({
    q: single(raw.q),
    category: single(raw.category),
    page: single(raw.page),
  });

  const [result, categories, t] = await Promise.all([
    listFoods(input),
    listFoodCategories(),
    getTranslations('foods'),
  ]);

  return (
    <div className="space-y-6 text-start">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('resultCount', { total: result.total })} · {t('per100g')}
        </p>
      </div>

      {/* The whole feature depends on this table; an empty one is worth saying out loud. */}
      {result.total === 0 && !input.q && !input.category ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {t('notSeeded')}
        </p>
      ) : null}

      <FoodSearch input={input} categories={categories} />
      <FoodTable result={result} filtered={Boolean(input.q || input.category)} />
      <FoodPagination result={result} input={input} />

      <p className="text-xs text-muted-foreground">{t('dataSource')}</p>
    </div>
  );
}
