'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { Input } from '@/components/ui/input';
import {
  deleteItemAction,
  deleteMealAction,
  updateItemQuantityAction,
  updateMealAction,
} from '@/features/meal-plans/actions';
import { FoodPicker } from '@/features/meal-plans/components/food-picker';
import { roundForDisplay, scaleNutrients } from '@/features/meal-plans/nutrition';
// `import type` keeps `queries.ts` — and therefore `postgres` — out of the
// client bundle. See the note in `plan-workspace.tsx`.
import type { PlanMeal } from '@/features/meal-plans/queries';
import { formatNumber } from '@/lib/format';
import { type Locale } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * One block in the day's schedule: a time, a name, and what is eaten then.
 *
 * Selecting the block drives the analysis panel; that is why the header is a
 * button. The edit and delete controls are siblings of that button rather than
 * children — nesting them would make them unreachable by keyboard and invalid
 * HTML besides.
 */
export function MealBlock({
  locale,
  planId,
  meal,
  categories,
  selected,
  onSelect,
}: {
  locale: Locale;
  planId: string;
  meal: PlanMeal;
  categories: string[];
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('mealPlans');
  const tCommon = useTranslations('common');

  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  return (
    <section
      className={cn(
        'rounded-lg border transition-colors',
        selected ? 'border-foreground/40 bg-muted/40' : 'border-border',
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        {editing ? (
          <form
            action={updateMealAction}
            onSubmit={() => setEditing(false)}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="mealId" value={meal.id} />

            <Input
              name="timeOfDay"
              type="time"
              required
              dir="ltr"
              defaultValue={meal.timeOfDay}
              className="w-32"
              aria-label={t('fields.timeOfDay')}
            />
            <Input
              name="label"
              required
              maxLength={60}
              defaultValue={meal.label}
              className="w-44"
              aria-label={t('fields.mealLabel')}
            />

            <Button type="submit" size="sm">
              {tCommon('save')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
              {tCommon('cancel')}
            </Button>
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={onSelect}
              aria-pressed={selected}
              className="flex items-baseline gap-3 rounded text-start outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="text-sm font-semibold tabular-nums" dir="ltr">
                {meal.timeOfDay}
              </span>
              <span className="text-sm font-medium">{meal.label}</span>
              <span className="text-xs text-muted-foreground" dir="ltr">
                {formatNumber(locale, roundForDisplay('kcal', meal.totals.kcal.value))} kcal
              </span>
            </button>

            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
                {tCommon('edit')}
              </Button>

              <form action={deleteMealAction}>
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="planId" value={planId} />
                <input type="hidden" name="mealId" value={meal.id} />
                <ConfirmSubmitButton
                  label={tCommon('delete')}
                  confirmMessage={t('actions.confirmDeleteMeal', { label: meal.label })}
                  variant="ghost"
                  size="sm"
                />
              </form>
            </div>
          </>
        )}
      </header>

      <div className="space-y-3 p-3">
        {meal.items.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('emptyMeal')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pb-1 text-start font-medium">{t('fields.food')}</th>
                  <th className="pb-1 text-end font-medium">{t('fields.quantityGrams')}</th>
                  <th className="pb-1 text-end font-medium">{t('nutrients.kcal')}</th>
                  <th className="pb-1 text-end font-medium">{t('short.protein')}</th>
                  <th className="pb-1 text-end font-medium">{t('short.carbs')}</th>
                  <th className="pb-1 text-end font-medium">{t('short.fat')}</th>
                  <th className="pb-1">
                    <span className="sr-only">{t('fields.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {meal.items.map((item) => {
                  const scaled = scaleNutrients(item);

                  return (
                    <tr key={item.id} className="border-t border-border/60">
                      <td className="py-1.5 pe-2 text-start">{item.food.description}</td>

                      <td className="py-1.5 text-end">
                        {/*
                         * Editing a quantity is the commonest edit in the whole
                         * feature, so it is inline: change the number, press
                         * Enter. No edit mode to enter first.
                         */}
                        <form action={updateItemQuantityAction} className="flex items-center justify-end gap-1">
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="planId" value={planId} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <Input
                            name="quantityGrams"
                            type="number"
                            inputMode="decimal"
                            min={1}
                            max={5000}
                            step="any"
                            required
                            dir="ltr"
                            defaultValue={item.quantityGrams}
                            aria-label={t('fields.quantityGrams')}
                            className="h-6 w-20 text-end text-xs"
                          />
                          <span className="text-muted-foreground">g</span>
                        </form>
                      </td>

                      <td className="py-1.5 text-end tabular-nums" dir="ltr">
                        {formatNumber(locale, roundForDisplay('kcal', scaled.kcal ?? 0))}
                      </td>
                      <td className="py-1.5 text-end tabular-nums" dir="ltr">
                        {formatNumber(locale, roundForDisplay('protein', scaled.protein ?? 0))}
                      </td>
                      <td className="py-1.5 text-end tabular-nums" dir="ltr">
                        {formatNumber(locale, roundForDisplay('carbs', scaled.carbs ?? 0))}
                      </td>
                      <td className="py-1.5 text-end tabular-nums" dir="ltr">
                        {formatNumber(locale, roundForDisplay('fat', scaled.fat ?? 0))}
                      </td>

                      <td className="py-1.5 ps-2 text-end">
                        <form action={deleteItemAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="planId" value={planId} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <ConfirmSubmitButton label={tCommon('remove')} variant="ghost" size="sm" />
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {adding ? (
          <FoodPicker
            locale={locale}
            planId={planId}
            mealId={meal.id}
            categories={categories}
            onDone={() => setAdding(false)}
          />
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            {t('actions.addFood')}
          </Button>
        )}
      </div>
    </section>
  );
}
