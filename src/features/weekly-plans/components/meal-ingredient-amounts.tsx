import { useTranslations } from 'next-intl';

import { localizedName } from '../food-display';
import { ingredientAmount } from '../meal-quantity';
import type { DishIngredientDetail } from '../nutrition';

/**
 * The recipe at the serving actually planned, each line in the unit it was written
 * in — 150 غ of labneh, 1 رغيف of bread, 2 حبة of egg.
 *
 * Deliberately **not** a `'use client'` module. The staff panel that renders it is
 * a client component and pulls it into the bundle; the patient portal's meal card
 * is a server component and keeps it on the server, where the week's recipes stay
 * out of the browser. Written once so a dietitian and their client cannot end up
 * reading two different sentences for the same meal.
 *
 * `dir="auto"` on both columns rather than a fixed direction: a food name or a
 * unit can be Arabic on an English plan and the other way round, and the first
 * strong character is the only thing that reliably knows which way the line runs.
 */
export function MealIngredientAmounts({
  ingredients,
  servings,
  locale,
}: {
  ingredients: readonly DishIngredientDetail[];
  servings: number;
  locale: string;
}) {
  const t = useTranslations('weeklyPlans');

  if (!ingredients.length) return null;

  return (
    <ul className="flex flex-col gap-1.5 text-body-sm">
      {ingredients.map((ingredient) => {
        const amount = ingredientAmount(ingredient, servings, locale);

        return (
          <li key={ingredient.food.id} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere] text-muted-foreground" dir="auto">
              {localizedName(ingredient.food, locale)}
            </span>
            {/* `shrink-0` and no wrapping: the amount is short in both languages
                and is what the eye runs down the column for. */}
            <span className="shrink-0 text-end font-medium tabular-nums" dir="auto">
              {amount.kind === 'grams' ? t('gramsShort', { value: amount.grams }) : amount.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
