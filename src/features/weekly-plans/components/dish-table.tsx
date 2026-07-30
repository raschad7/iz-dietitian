import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { roundForDisplay } from '@/features/meal-plans/nutrition';
import { membersOf } from '@/lib/enum';

import type { DishListResult } from '../queries';
import { ALLERGENS, DISH_TAGS, MEAL_TYPES } from '../schema';

/**
 * The read-only catalog browser.
 *
 * Exists to answer "what was the AI choosing from", which is the first question
 * anyone asks when a generated plan looks wrong. The numbers here come from the same
 * loader a plan uses, so what this page shows is what a plan would compute.
 *
 * There is no dish editor in this cut. Adding one is a whole feature — form,
 * validation, actions, tests — and it sits between the dietitian and seeing a plan.
 */
export function DishTable({ result }: { result: DishListResult }) {
  const t = useTranslations('dishes');

  if (!result.items.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>;
  }

  return (
    /* The table scrolls inside its own container: at this column count a phone
       would otherwise scroll the whole page sideways. */
    <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
      <table className="w-full min-w-3xl text-sm">
        <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="p-3 text-start font-medium">
              {t('columns.name')}
            </th>
            <th scope="col" className="p-3 text-start font-medium">
              {t('columns.mealTypes')}
            </th>
            <th scope="col" className="p-3 text-start font-medium">
              {t('columns.tags')}
            </th>
            <th scope="col" className="p-3 text-end font-medium">
              {t('columns.kcal')}
            </th>
            <th scope="col" className="p-3 text-end font-medium">
              {t('columns.protein')}
            </th>
            <th scope="col" className="p-3 text-start font-medium">
              {t('columns.ingredients')}
            </th>
          </tr>
        </thead>

        <tbody>
          {result.items.map((dish) => (
            <tr key={dish.id} className="border-t border-border align-top">
              <td className="p-3">
                <span className="block font-medium">{dish.nameAr}</span>
                <span className="block text-xs text-muted-foreground">{dish.nameEn}</span>
                {dish.allergenTags.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {membersOf(ALLERGENS, dish.allergenTags).map((tag) => (
                      <Badge key={tag} variant="outline" className="border-destructive/40">
                        {t(`allergens.${tag}`)}
                      </Badge>
                    ))}
                  </span>
                )}
              </td>

              <td className="p-3 text-xs text-muted-foreground">
                {membersOf(MEAL_TYPES, dish.mealTypes)
                  .map((type) => t(`mealTypes.${type}`))
                  .join('، ')}
              </td>

              <td className="p-3 text-xs text-muted-foreground">
                {membersOf(DISH_TAGS, dish.tags)
                  .map((tag) => t(`tags.${tag}`))
                  .join('، ')}
              </td>

              <td className="p-3 text-end tabular-nums">{roundForDisplay('kcal', dish.baseKcal)}</td>

              <td className="p-3 text-end tabular-nums">
                {roundForDisplay('protein', dish.totals.protein.value)}
              </td>

              <td className="p-3 text-xs text-muted-foreground">
                <ul className="flex flex-col gap-0.5">
                  {dish.ingredients.map((ingredient) => (
                    <li key={ingredient.food.id}>
                      {roundForDisplay('protein', ingredient.quantityGrams)} g ·{' '}
                      {ingredient.food.description}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
