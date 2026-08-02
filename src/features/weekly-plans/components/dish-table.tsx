import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '@/components/ui/table';
import { roundForDisplay } from '@/features/weekly-plans/nutrition';
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
    return <p className="py-8 text-center text-muted-foreground">{t('empty')}</p>;
  }

  return (
    /* The table scrolls inside its own container: at this column count a phone
       would otherwise scroll the whole page sideways. */
    <TableRoot>
      <Table className="min-w-3xl">
        <TableHeader>
          <TableRow>
            <TableHead>{t('columns.name')}</TableHead>
            <TableHead>{t('columns.mealTypes')}</TableHead>
            <TableHead>{t('columns.tags')}</TableHead>
            <TableHead numeric className="text-end">
              {t('columns.kcal')}
            </TableHead>
            <TableHead numeric className="text-end">
              {t('columns.protein')}
            </TableHead>
            <TableHead>{t('columns.ingredients')}</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {result.items.map((dish) => (
            <TableRow key={dish.id} className="align-top">
              <TableCell>
                <span className="block font-medium">{dish.nameAr}</span>
                <span className="block text-caption text-muted-foreground">{dish.nameEn}</span>
                {dish.allergenTags.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {/*
                      Allergens are the one thing on this row that is a medical
                      fact rather than a label, so they take the medical status
                      rather than a plain outline chip.
                    */}
                    {membersOf(ALLERGENS, dish.allergenTags).map((tag) => (
                      <Badge key={tag} variant="medical">
                        {t(`allergens.${tag}`)}
                      </Badge>
                    ))}
                  </span>
                )}
              </TableCell>

              <TableCell className="text-caption text-muted-foreground">
                {membersOf(MEAL_TYPES, dish.mealTypes)
                  .map((type) => t(`mealTypes.${type}`))
                  .join('، ')}
              </TableCell>

              <TableCell className="text-caption text-muted-foreground">
                {membersOf(DISH_TAGS, dish.tags)
                  .map((tag) => t(`tags.${tag}`))
                  .join('، ')}
              </TableCell>

              <TableCell numeric className="text-end">
                {roundForDisplay('kcal', dish.baseKcal)}
              </TableCell>

              <TableCell numeric className="text-end">
                {roundForDisplay('protein', dish.totals.protein.value)}
              </TableCell>

              <TableCell className="text-caption text-muted-foreground">
                <ul className="flex flex-col gap-0.5">
                  {dish.ingredients.map((ingredient) => (
                    <li key={ingredient.food.id}>
                      {roundForDisplay('protein', ingredient.quantityGrams)} g ·{' '}
                      {ingredient.food.description}
                    </li>
                  ))}
                </ul>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableRoot>
  );
}
