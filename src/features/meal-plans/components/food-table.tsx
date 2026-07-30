import { useFormatter, useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { roundForDisplay } from '@/features/meal-plans/nutrition';
import type { FoodListResult } from '@/features/meal-plans/queries';
import type { ListFoodsInput } from '@/features/meal-plans/schema';
import { Link } from '@/i18n/navigation';

/** The macros every food has, plus energy. The rest live on the detail page. */
export function FoodTable({ result, filtered }: { result: FoodListResult; filtered: boolean }) {
  const t = useTranslations('foods');
  const format = useFormatter();

  if (result.items.length === 0) {
    return (
      <div className="space-y-4 rounded-lg border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">{filtered ? t('emptyFiltered') : t('empty')}</p>
        {filtered ? (
          <Link href="/app/foods" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {t('clearFilters')}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-start font-medium">{t('fields.description')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('fields.category')}</th>
            <th className="px-3 py-2 text-end font-medium">{t('nutrients.kcal')}</th>
            <th className="px-3 py-2 text-end font-medium">{t('short.protein')}</th>
            <th className="px-3 py-2 text-end font-medium">{t('short.carbs')}</th>
            <th className="px-3 py-2 text-end font-medium">{t('short.fat')}</th>
            <th className="px-3 py-2 text-start font-medium">{t('fields.portion')}</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((food) => (
            <tr key={food.id} className="border-t border-border hover:bg-muted/40">
              <td className="px-3 py-2 text-start">
                <Link
                  href={`/app/foods/${food.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {food.description}
                </Link>
              </td>
              <td className="px-3 py-2 text-start text-muted-foreground">{food.category}</td>
              <td className="px-3 py-2 text-end tabular-nums" dir="ltr">
                {format.number(roundForDisplay('kcal', food.kcal), 'integer')}
              </td>
              <td className="px-3 py-2 text-end tabular-nums" dir="ltr">
                {format.number(roundForDisplay('protein', food.protein), 'plain')}
              </td>
              <td className="px-3 py-2 text-end tabular-nums" dir="ltr">
                {format.number(roundForDisplay('carbs', food.carbs), 'plain')}
              </td>
              <td className="px-3 py-2 text-end tabular-nums" dir="ltr">
                {format.number(roundForDisplay('fat', food.fat), 'plain')}
              </td>
              <td className="px-3 py-2 text-start text-muted-foreground">
                {food.portionGrams === null ? (
                  '—'
                ) : (
                  <span dir="ltr">
                    {food.portionLabel} ({format.number(food.portionGrams, 'plain')} g)
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FoodPagination({
  result,
  input,
}: {
  result: FoodListResult;
  input: ListFoodsInput;
}) {
  const t = useTranslations('foods');

  if (result.pageCount <= 1) return null;

  const query = (page: number) => ({
    pathname: '/app/foods' as const,
    query: {
      ...(input.q ? { q: input.q } : {}),
      ...(input.category ? { category: input.category } : {}),
      page: String(page),
    },
  });

  return (
    <nav className="flex items-center justify-between gap-4 text-sm" aria-label={t('title')}>
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
