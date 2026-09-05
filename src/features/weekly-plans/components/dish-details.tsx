'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { membersOf } from '@/lib/enum';

import { loadDishDetailAction } from '../catalog-actions';
import { localizedName, localizedPortionLabel, secondaryName } from '../food-display';
import { nutritionCategory } from '../nutrition';
import type { DishDetailView } from '../queries';
import { ALLERGENS, DISH_AXES, MEAL_TYPES, axisMessageKey } from '../schema';
import { DishNutritionLabel } from './dish-nutrition-label';

/**
 * The read-only dish detail drawer (spec §8).
 *
 * Opened from a catalog row. Shows what browsing deliberately leaves out — the
 * recipe — in the terms it was entered in: each ingredient by its friendly name
 * ("أرز أبيض", not "Rice, white, cooked") in its own household unit ("1 كوب",
 * "150 غرام"), reconstructed from the saved unit by the same `resolveSavedRow` the
 * editor uses, so the drawer and the editor never disagree. Macros come
 * pre-computed from the server; nothing here sums nutrition.
 *
 * A clinic dish offers **Edit** (delegated up via `onEdit`, the same editor the
 * row menu opens). A system dish is read-only and shows no edit affordance.
 */
export function DishDetails({
  locale,
  dishId,
  onClose,
  onEdit,
}: {
  locale: string;
  /** The dish to show, or null when the drawer is closed. */
  dishId: string | null;
  onClose: () => void;
  onEdit: (dishId: string) => void;
}) {
  const t = useTranslations('dishes');
  const tUnits = useTranslations('dishEditor.editor.units');
  const tEditor = useTranslations('dishEditor.editor');

  // Keyed by the dish it belongs to, so a stale response for a dish the reader has
  // since closed (or swapped) is ignored, and loading is derived rather than set
  // synchronously in the effect: the drawer is "loading" whenever the open dish is
  // not the one the last fetch resolved.
  const [resolved, setResolved] = useState<{ dishId: string; detail: DishDetailView | null } | null>(
    null,
  );

  useEffect(() => {
    if (!dishId) return;
    let live = true;
    loadDishDetailAction(locale, dishId).then((data) => {
      if (live) setResolved({ dishId, detail: data });
    });
    return () => {
      live = false;
    };
  }, [dishId, locale]);

  const detail = resolved && resolved.dishId === dishId ? resolved.detail : null;
  const loading = dishId !== null && (resolved === null || resolved.dishId !== dishId);
  const editable = detail !== null && detail.clinicId !== null;

  const axisBadges = detail
    ? DISH_AXES.map(({ key }) => t(axisMessageKey(key, detail[key])))
    : [];
  const mealTypes = detail ? membersOf(MEAL_TYPES, detail.mealTypes) : [];
  const totalWeightGrams = detail
    ? detail.ingredients.reduce((acc, ing) => acc + ing.quantityGrams, 0)
    : 0;

  return (
    <Sheet open={dishId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="inline-end" className="w-full gap-0 p-0 sm:max-w-md">
        {loading ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <Spinner />
          </div>
        ) : !detail ? null : (
          <>
            <SheetHeader className="gap-2 border-b border-border p-5">
              {/* Category, ownership, and meal-type badges */}
              <div className="flex flex-wrap items-center gap-1.5 pe-8">
                <Badge variant={editable ? 'default' : 'muted'} size="sm">
                  {editable ? t('ownership.clinic') : t('ownership.system')}
                </Badge>
                {mealTypes.map((type) => (
                  <Badge key={type} variant="outline" size="sm">
                    {t(`mealTypes.${type}`)}
                  </Badge>
                ))}
              </div>

              {/* The dish in the reader's language, the other name quietly under it. */}
              <SheetTitle className="font-heading text-heading-sm text-start">
                {localizedName(detail, locale)}
              </SheetTitle>
              {secondaryName(detail, locale) && (
                <SheetDescription className="text-start">
                  <bdi>{secondaryName(detail, locale)}</bdi>
                </SheetDescription>
              )}

              {/* Dish axes (properties: effort, source, cost, occasion) */}
              {axisBadges.length > 0 && (
                <p className="pt-0.5 text-body-sm text-muted-foreground">
                  {axisBadges.join(' · ')}
                </p>
              )}
            </SheetHeader>

            <SheetBody className="gap-5 p-5">
              {/* Nutrition: Reuses the exact circular EnergyRing label from the dish editor */}
              <DishNutritionLabel
                totals={detail.totals}
                empty={detail.ingredients.length === 0}
                categoryLabel={tEditor(`categories.${nutritionCategory(detail.totals)}`)}
                totalGrams={totalWeightGrams}
                ringSize="narrow"
                className="shrink-0"
              />

              {/* Allergens: Compact red badges instead of a large alert box */}
              {detail.allergenTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-caption font-medium text-muted-foreground">
                    {tEditor('allergensLegend')}:
                  </span>
                  {membersOf(ALLERGENS, detail.allergenTags).map((tag) => (
                    <Badge key={tag} variant="medical" size="sm">
                      {t(`allergens.${tag}`)}
                    </Badge>
                  ))}
                </div>
              )}

              {/* The recipe: each line by its friendly name, secondary name anchored at text-start, and unit */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-label font-semibold text-foreground">
                      {t('detail.ingredients')}
                    </h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-caption font-medium text-muted-foreground">
                      {detail.ingredients.length}
                    </span>
                  </div>
                  {totalWeightGrams > 0 && (
                    <span className="text-caption text-muted-foreground tabular-nums">
                      {Math.round(totalWeightGrams)} {tUnits('g')}
                    </span>
                  )}
                </div>

                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                  {detail.ingredients.map((ingredient, index) => {
                    const amount = ingredient.portion
                      ? Math.round((ingredient.portionQuantity ?? 0) * 1000) / 1000
                      : Math.round(ingredient.quantityGrams);
                    const unit = ingredient.portion
                      ? localizedPortionLabel(ingredient.portion, locale)
                      : tUnits('g');
                    const secondary = secondaryName(ingredient.food, locale);

                    return (
                      <li
                        key={`${ingredient.food.id}-${index}`}
                        className="flex items-center justify-between gap-3 p-3 text-body-sm transition-colors hover:bg-muted/30"
                      >
                        <div className="flex min-w-0 flex-1 flex-col text-start">
                          <span className="font-medium text-foreground [overflow-wrap:anywhere]">
                            {localizedName(ingredient.food, locale)}
                          </span>
                          {secondary && (
                            <span className="text-caption text-muted-foreground [overflow-wrap:anywhere]">
                              {secondary}
                            </span>
                          )}
                        </div>
                        <span
                          className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-label font-medium tabular-nums text-foreground"
                          dir="auto"
                        >
                          {amount} {unit}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </SheetBody>

            {editable && (
              <SheetFooter className="border-t border-border p-4">
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={() => onEdit(detail.id)}
                >
                  <Icon name="edit" />
                  {t('detail.edit')}
                </Button>
              </SheetFooter>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
