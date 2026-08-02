import { useFormatter, useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
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
      <Card variant="empty" className="items-center gap-4 p-8 text-center">
        <p>{filtered ? t('emptyFiltered') : t('empty')}</p>
        {filtered ? (
          <Link href="/app/foods" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {t('clearFilters')}
          </Link>
        ) : null}
      </Card>
    );
  }

  return (
    <TableRoot>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('fields.description')}</TableHead>
            <TableHead>{t('fields.category')}</TableHead>
            <TableHead numeric className="text-end">
              {t('nutrients.kcal')}
            </TableHead>
            <TableHead numeric className="text-end">
              {t('short.protein')}
            </TableHead>
            <TableHead numeric className="text-end">
              {t('short.carbs')}
            </TableHead>
            <TableHead numeric className="text-end">
              {t('short.fat')}
            </TableHead>
            <TableHead>{t('fields.portion')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.items.map((food) => (
            <TableRow key={food.id}>
              <TableCell>
                <Link
                  href={`/app/foods/${food.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {food.description}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{food.category}</TableCell>
              <TableCell numeric className="text-end">
                {format.number(roundForDisplay('kcal', food.kcal), 'integer')}
              </TableCell>
              <TableCell numeric className="text-end">
                {format.number(roundForDisplay('protein', food.protein), 'plain')}
              </TableCell>
              <TableCell numeric className="text-end">
                {format.number(roundForDisplay('carbs', food.carbs), 'plain')}
              </TableCell>
              <TableCell numeric className="text-end">
                {format.number(roundForDisplay('fat', food.fat), 'plain')}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {food.portionGrams === null ? (
                  '—'
                ) : (
                  <span dir="ltr">
                    {food.portionLabel} ({format.number(food.portionGrams, 'plain')} g)
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableRoot>
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
